"""Sync engine tests against a mocked external participant system."""

import httpx
from httpx import MockTransport

from app.config import Settings
from app.database import SessionLocal
from app.models import Participant
from app.sync.adapter import ExternalAdapter, guess_field_map
from app.sync.service import SyncService

BASE = "http://external.test/api"
FIELD_MAP = '{"id": "id", "name": "name", "nationalId": "id_number", "phone": "phone", "bus": "group"}'


def make_settings(base_url: str = BASE, field_map: str = FIELD_MAP, delta_path: str = "") -> Settings:
    return Settings(
        external_api_base_url=base_url,
        external_api_participants_path="/participants",
        external_api_delta_path=delta_path,
        external_api_field_map=field_map,
        external_sync_enabled=True,
    )


def record(ext_id: str, national_id: str, name: str, updated_at: str) -> dict:
    return {
        "id": ext_id,
        "nationalId": national_id,
        "name": name,
        "phone": "024" + ext_id,
        "bus": "Bus A",
        "updatedAt": updated_at,
    }


def make_transport(snapshot, seen_requests=None):
    async def handler(request: httpx.Request) -> httpx.Response:
        if seen_requests is not None:
            seen_requests.append(request)
        if request.url.path.endswith("/updated"):
            since = request.url.params.get("updated_since", "")
            data = [p for p in snapshot if p["updatedAt"] > since]
            return httpx.Response(200, json={"data": data})
        return httpx.Response(200, json={"data": snapshot})

    return MockTransport(handler)


def service_with_transport(snapshot, settings=None, seen_requests=None):
    settings = settings or make_settings()
    adapter = ExternalAdapter(settings, transport=make_transport(snapshot, seen_requests))
    return SyncService(settings=settings, adapter=adapter)


def count_by(db, external_id: str) -> Participant | None:
    return db.query(Participant).filter(Participant.external_id == external_id).first()


def test_guess_field_map():
    sample = {"id": "1", "nationalId": "NID-1", "fullName": "A", "mobile": "x", "busGroup": "b"}
    mapped = guess_field_map(sample)
    assert mapped["nationalId"] == "id_number"
    assert mapped["fullName"] == "name"
    assert mapped["mobile"] == "phone"
    assert mapped["busGroup"] == "group"


def test_snapshot_imports_and_maps_fields():
    snapshot = [
        record("X-001", "NID-8844", "Grace Mensah", "2026-08-10T08:00:00Z"),
        record("X-002", "NID-5521", "David Osei", "2026-08-10T08:05:00Z"),
    ]
    svc = service_with_transport(snapshot)
    db = SessionLocal()
    try:
        result = svc.run_once(db=db)
        assert result["last_imported"] == 2
        g = count_by(db, "X-001")
        assert g is not None
        assert g.name == "Grace Mensah"
        assert g.id_number == "NID-8844"
        assert g.group == "Bus A"
        assert g.phone == "024X-001"
        assert g.source == "external"
        assert g.active is True
        assert svc.status.last_error is None
        assert result["enabled"] is True
    finally:
        db.close()


def test_snapshot_soft_deletes_missing_externals():
    full = [record("X-001", "NID-1", "One", "2026-08-10T08:00:00Z"), record("X-002", "NID-2", "Two", "2026-08-10T08:05:00Z")]
    svc = service_with_transport(full)
    db = SessionLocal()
    try:
        svc.run_once(db=db)
        assert count_by(db, "X-001").active is True

        svc2 = service_with_transport([record("X-002", "NID-2", "Two Updated", "2026-08-10T09:00:00Z")])
        result = svc2.run_once(db=db)
        assert result["last_soft_deleted"] == 1
        assert count_by(db, "X-001").active is False
        assert count_by(db, "X-002").active is True
        assert count_by(db, "X-002").name == "Two Updated"
    finally:
        db.close()


def test_delta_mode_sends_updated_since():
    snapshot = [record("X-001", "NID-1", "One", "2026-08-10T08:00:00Z")]
    seen = []
    settings = make_settings(delta_path="/participants/updated")
    svc = service_with_transport(snapshot, settings=settings, seen_requests=seen)
    db = SessionLocal()
    try:
        svc.run_once(db=db)
        assert len(seen) == 1
        assert seen[0].url.path.endswith("/participants")  # first pass is a full snapshot
        assert not seen[0].url.params.get("updated_since")

        svc.run_once(db=db)
        assert len(seen) == 2
        assert seen[1].url.path.endswith("/updated")
        assert seen[1].url.params.get("updated_since")
        # delta returned nothing new -> no new import, no soft delete
        assert svc.status.last_imported == 0
    finally:
        db.close()


def test_adopts_local_participant_with_same_id_number():
    snapshot = [record("X-050", "NID-7777", "Grace Renamed", "2026-08-11T08:00:00Z")]
    db = SessionLocal()
    try:
        local = Participant(
            id="p-local-adopt",
            name="Old Local Grace",
            id_number="NID-7777",
            phone="999",
            group="Bus Z",
            active=True,
            source="local",
        )
        db.add(local)
        db.commit()

        svc = service_with_transport(snapshot)
        svc.run_once(db=db)

        db.refresh(local)
        assert local.external_id == "X-050"
        assert local.source == "external"
        assert local.name == "Grace Renamed"
        assert local.group == "Bus A"
        matches = db.query(Participant).filter(Participant.id_number == "NID-7777").all()
        assert len(matches) == 1  # no duplicate created
    finally:
        db.close()


def test_dry_run_works_without_sync_enabled():
    settings = make_settings()
    settings.external_sync_enabled = False
    adapter = ExternalAdapter(settings, transport=make_transport([record("X-001", "NID-1", "One", "2026-08-10T08:00:00Z")]))
    import asyncio

    reached, sample, guess = asyncio.run(adapter.dry_run())
    assert reached is True
    assert len(sample) == 1
    assert guess["nationalId"] == "id_number"


def test_missing_base_url_raises():
    adapter = ExternalAdapter(make_settings(base_url=""))
    import asyncio

    try:
        asyncio.run(adapter.fetch_participants())
        assert False, "expected ExternalApiError"
    except Exception as exc:
        assert "not configured" in str(exc)


def test_sync_error_is_recorded():
    async def fail(request):
        raise httpx.ConnectError("boom", request=request)

    settings = make_settings()
    adapter = ExternalAdapter(settings, transport=MockTransport(fail))
    svc = SyncService(settings=settings, adapter=adapter)
    try:
        svc.run_once()
        assert False, "expected ExternalApiError"
    except Exception as exc:
        assert "failed" in str(exc) or "boom" in str(exc)
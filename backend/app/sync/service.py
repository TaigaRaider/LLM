"""Sync engine: pulls participants from the existing system and upserts them locally."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..database import SessionLocal
from ..models import Participant
from .adapter import ExternalAdapter, ExternalApiError


class SyncStatusHolder:
    def __init__(self) -> None:
        self.enabled = False
        self.last_run_at: datetime | None = None
        self.last_success_at: datetime | None = None
        self.last_error: str | None = None
        self.last_imported = 0
        self.last_soft_deleted = 0

    def snapshot(self) -> dict:
        db = SessionLocal()
        try:
            count = db.query(Participant).count()
        finally:
            db.close()
        return {
            "enabled": self.enabled,
            "last_run_at": self.last_run_at,
            "last_success_at": self.last_success_at,
            "last_error": self.last_error,
            "last_imported": self.last_imported,
            "last_soft_deleted": self.last_soft_deleted,
            "participant_count": count,
        }


class SyncService:
    def __init__(self, settings: Settings | None = None, adapter: ExternalAdapter | None = None):
        self.settings = settings or get_settings()
        self.adapter = adapter or ExternalAdapter(self.settings)
        self.status = SyncStatusHolder()
        self.status.enabled = self.adapter.enabled

    def run_once(self, db: Session | None = None) -> dict:
        """One sync pass. Raises ExternalApiError on failure."""
        self.status.last_run_at = datetime.now(timezone.utc)
        since = self.status.last_success_at if self.settings.external_api_delta_path else None
        records = asyncio.run(self.adapter.fetch_participants(since))
        own = db or SessionLocal()
        try:
            imported = 0
            for raw in records:
                mapped = self.adapter.map_participant(raw)
                if not mapped:
                    continue
                existing = own.execute(
                    select(Participant).where(Participant.external_id == mapped["external_id"])
                ).scalar_one_or_none()
                if existing is None:
                    # no external_id match: adopt a local participant with the same ID number
                    existing = own.execute(
                        select(Participant).where(Participant.id_number == mapped["id_number"])
                    ).scalar_one_or_none()
                if existing:
                    existing.external_id = existing.external_id or mapped["external_id"]
                    existing.name = mapped["name"]
                    existing.id_number = mapped["id_number"]
                    existing.phone = mapped["phone"]
                    existing.group = mapped["group"]
                    existing.active = True
                    existing.source = "external"
                    existing.synced_at = datetime.now(timezone.utc)
                else:
                    own.add(
                        Participant(
                            external_id=mapped["external_id"],
                            name=mapped["name"],
                            id_number=mapped["id_number"],
                            phone=mapped["phone"],
                            group=mapped["group"],
                            active=True,
                            source="external",
                            synced_at=datetime.now(timezone.utc),
                        )
                    )
                imported += 1
            soft_deleted = 0
            if since is None:
                # snapshot mode: hide external participants the remote no longer returns
                seen = {m["external_id"] for m in (self.adapter.map_participant(r) for r in records) if m}
                externals = own.execute(select(Participant).where(Participant.source == "external")).scalars().all()
                for p in externals:
                    if p.external_id not in seen and p.active:
                        p.active = False
                        soft_deleted += 1
            own.commit()
            self.status.last_imported = imported
            self.status.last_soft_deleted = soft_deleted
            self.status.last_success_at = datetime.now(timezone.utc)
            self.status.last_error = None
            return self.status.snapshot()
        except Exception:
            own.rollback()
            raise
        finally:
            if db is None:
                own.close()

    async def run_once_async(self, db: Session | None = None) -> dict:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.run_once, db)

    async def poll_loop(self) -> None:
        while True:
            try:
                self.run_once()
            except ExternalApiError as exc:
                self.status.last_error = str(exc)
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                self.status.last_error = f"Unexpected sync failure: {exc}"
            await asyncio.sleep(self.settings.external_sync_interval_seconds)


service = SyncService()
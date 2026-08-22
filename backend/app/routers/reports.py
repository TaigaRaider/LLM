import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Bag, Event, Officer, Participant
from ..permissions import require_perms
from ..schemas import ReconciliationReport

router = APIRouter(prefix="/api/reports", tags=["reports"])

OVERDUE_HOURS = 2


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _event_time(bag: Bag, event_name: str) -> datetime | None:
    for e in bag.events:
        if e.event == event_name:
            return e.timestamp
    return None


def _bags_with_participants(db: Session, bags: list[Bag]) -> list[dict]:
    participants = {p.id: p for p in db.query(Participant).all()}
    return [
        {
            "tag_code": b.tag_code,
            "status": b.status,
            "vehicle_code": b.vehicle_code,
            "participant": participants.get(b.participant_id),
            "restore_status": b.restore_status,
        }
        for b in bags
    ]


@router.get("/reconciliation", response_model=ReconciliationReport)
def reconciliation(db: Session = Depends(get_db), _: Officer = Depends(require_perms("reports"))):
    checked_in = db.query(Bag).count()
    counts = {
        status: db.query(Bag).filter(Bag.status == status).count()
        for status in ("HANDED_OVER", "IN_TRANSIT", "UNLOADED", "LOADED", "CHECKED_IN", "LOST")
    }
    outstanding = counts["UNLOADED"]
    discrepancy = checked_in - sum(counts.values())
    return ReconciliationReport(
        checked_in=checked_in,
        handed_over=counts["HANDED_OVER"],
        in_transit=counts["IN_TRANSIT"],
        unloaded=counts["UNLOADED"],
        loaded=counts["LOADED"],
        at_origin=counts["CHECKED_IN"],
        outstanding=outstanding,
        discrepancy=discrepancy,
        ok=discrepancy == 0,
    )


@router.get("/alerts")
def alerts(db: Session = Depends(get_db), _: Officer = Depends(require_perms("reports", "admin"))):
    on_truck = db.query(Bag).filter(Bag.status.in_(["LOADED", "IN_TRANSIT"])).all()
    unloaded = db.query(Bag).filter(Bag.status == "UNLOADED").all()
    lost = db.query(Bag).filter(Bag.status == "LOST").all()

    overdue = []
    for b in _bags_with_participants(db, unloaded):
        unloaded_at = _event_time(b, "UNLOADED")
        if unloaded_at is None:
            continue
        minutes = int((_now() - unloaded_at).total_seconds() // 60)
        overdue.append({**b, "unloaded_at": unloaded_at.isoformat(), "minutes_unloaded": minutes, "overdue": minutes > OVERDUE_HOURS * 60})

    return {
        "bags_on_truck": _bags_with_participants(db, on_truck),
        "overdue_unloaded": overdue,
        "lost": _bags_with_participants(db, lost),
    }


def _csv_response(rows: list[list[str]], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _xlsx_response(headers: list[str], rows: list[list], filename: str) -> Response:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Report"
    ws.append(headers)
    for row in rows:
        ws.append(row)
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return Response(
        content=out.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _row_participant(db: Session, bag: Bag) -> tuple[str, str, str, str]:
    p = db.get(Participant, bag.participant_id)
    if not p:
        return ("", "", "", "")
    return (p.name, p.id_number, p.phone, p.group)


def _fmt(dt: datetime | None) -> str:
    return dt.isoformat() if dt else ""


def _checkin_rows(db: Session) -> list[list]:
    rows = [["Tag", "Participant", "ID Number", "Phone", "Group", "Status", "Vehicle", "Checked In At", "Loaded At"]]
    for b in db.query(Bag).order_by(Bag.tag_code).all():
        name, id_number, phone, group = _row_participant(db, b)
        rows.append(
            [
                b.tag_code,
                name,
                id_number,
                phone,
                group,
                b.status,
                b.vehicle_code or "",
                _fmt(_event_time(b, "CHECKED_IN")),
                _fmt(_event_time(b, "LOADED")),
            ]
        )
    return rows


def _handover_rows(db: Session) -> list[list]:
    rows = [["Tag", "Participant", "ID Number", "Handed Over At", "Handed To Officer", "Note"]]
    officers = {o.id: o.name for o in db.query(Officer).all()}
    for b in db.query(Bag).order_by(Bag.tag_code).all():
        event = next((e for e in b.events if e.event == "HANDED_OVER"), None)
        if not event:
            continue
        name, id_number, _, _ = _row_participant(db, b)
        rows.append([b.tag_code, name, id_number, _fmt(event.timestamp), officers.get(event.officer_id, ""), event.note])
    return rows


@router.get("/checkin-manifest.csv")
def checkin_manifest_csv(db: Session = Depends(get_db), _: Officer = Depends(require_perms("reports", "admin"))):
    return _csv_response(_checkin_rows(db), "checkin-manifest.csv")


@router.get("/checkin-manifest.xlsx")
def checkin_manifest_xlsx(db: Session = Depends(get_db), _: Officer = Depends(require_perms("reports", "admin"))):
    rows = _checkin_rows(db)
    return _xlsx_response(rows[0], rows[1:], "checkin-manifest.xlsx")


@router.get("/handover-log.csv")
def handover_log_csv(db: Session = Depends(get_db), _: Officer = Depends(require_perms("reports", "admin"))):
    return _csv_response(_handover_rows(db), "handover-log.csv")


@router.get("/handover-log.xlsx")
def handover_log_xlsx(db: Session = Depends(get_db), _: Officer = Depends(require_perms("reports", "admin"))):
    rows = _handover_rows(db)
    return _xlsx_response(rows[0], rows[1:], "handover-log.xlsx")


@router.get("/participants.csv")
def participants_csv(db: Session = Depends(get_db), _: Officer = Depends(require_perms("reports", "admin"))):
    rows = [["Name", "ID Number", "Phone", "Group", "Source", "Active"]]
    for p in db.query(Participant).order_by(Participant.name).all():
        rows.append([p.name, p.id_number, p.phone, p.group, p.source, "yes" if p.active else "no"])
    return _csv_response(rows, "participants.csv")


@router.get("/reconciliation.csv")
def reconciliation_csv(db: Session = Depends(get_db), _: Officer = Depends(require_perms("reports", "admin"))):
    rep = reconciliation(db)
    rows = [["Metric", "Count"]]
    rows.append(["Checked In", rep.checked_in])
    rows.append(["Handed Over", rep.handed_over])
    rows.append(["In Transit", rep.in_transit])
    rows.append(["Unloaded", rep.unloaded])
    rows.append(["Loaded", rep.loaded])
    rows.append(["At Origin", rep.at_origin])
    rows.append(["Outstanding", rep.outstanding])
    rows.append(["Discrepancy", rep.discrepancy])
    return _csv_response([[str(c) for c in r] for r in rows], "reconciliation.csv")
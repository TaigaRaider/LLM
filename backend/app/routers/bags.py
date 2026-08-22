import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Bag, Event, Officer, Participant, Trip, Vehicle
from ..permissions import require_perms
from ..schemas import (
    ActionResult,
    BagOut,
    CheckInRequest,
    EventOut,
    HandoverRequest,
    LoadRequest,
    LostBagRequest,
    RecoverBagRequest,
    VehicleOut,
)
from ..security import current_officer

router = APIRouter(prefix="/api", tags=["bags"])

TAG_PATTERN = re.compile(r"^LLM-(\d+)$")
DEFAULT_VEHICLE = "TRUCK-01"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _bag_out(db: Session, bag: Bag) -> BagOut:
    officers = {o.id: o.name for o in db.query(Officer).all()}
    return BagOut(
        tag_code=bag.tag_code,
        participant_id=bag.participant_id,
        status=bag.status,
        vehicle_code=bag.vehicle_code,
        restore_status=bag.restore_status,
        timeline=[
            EventOut(
                event=e.event,
                officer_id=e.officer_id,
                officer_name=officers.get(e.officer_id, ""),
                timestamp=e.timestamp,
                note=e.note,
            )
            for e in bag.events
        ],
    )


def _vehicle(db: Session, code: str = DEFAULT_VEHICLE) -> Vehicle:
    vehicle = db.get(Vehicle, code)
    if not vehicle:
        vehicle = Vehicle(code=code, status="AT_ORIGIN")
        db.add(vehicle)
        db.commit()
        db.refresh(vehicle)
    return vehicle


def _vehicle_for_bag(db: Session, bag: Bag) -> Vehicle:
    return _vehicle(db, bag.vehicle_code or DEFAULT_VEHICLE)


def _next_tag_code(db: Session) -> str:
    used = {b.tag_code for b in db.query(Bag).all()}
    n = 1
    while f"LLM-{n:04d}" in used:
        n += 1
    return f"LLM-{n:04d}"


def _find_bag(db: Session, tag_code: str) -> Bag:
    bag = db.query(Bag).filter(Bag.tag_code == tag_code.upper()).first()
    if not bag:
        raise HTTPException(status_code=404, detail=f"Tag {tag_code} not found")
    return bag


def _add_event(db: Session, bag: Bag, officer: Officer, event: str, note: str) -> None:
    db.add(Event(bag_id=bag.id, event=event, officer_id=officer.id, timestamp=_now(), note=note))
    bag.status = event
    bag.updated_at = _now()


def _trip_for_vehicle(db: Session, vehicle_code: str) -> Trip | None:
    return (
        db.query(Trip)
        .filter(Trip.vehicle_code == vehicle_code, Trip.arrived_at.is_(None))
        .order_by(Trip.departed_at.desc())
        .first()
    )


@router.get("/bags", response_model=list[BagOut])
def list_bags(status: str = "", participant_id: str = "", vehicle_code: str = "", db: Session = Depends(get_db), _: Officer = Depends(current_officer)):
    q = db.query(Bag)
    if status:
        q = q.filter(Bag.status == status)
    if participant_id:
        q = q.filter(Bag.participant_id == participant_id)
    if vehicle_code:
        q = q.filter(Bag.vehicle_code == vehicle_code)
    return [_bag_out(db, b) for b in q.order_by(Bag.tag_code).all()]


@router.get("/vehicle", response_model=VehicleOut)
def get_vehicle(code: str = DEFAULT_VEHICLE, db: Session = Depends(get_db), _: Officer = Depends(current_officer)):
    return _vehicle(db, code)


@router.post("/bags/check-in", response_model=list[BagOut], status_code=201)
def check_in(body: CheckInRequest, db: Session = Depends(get_db), officer: Officer = Depends(require_perms("check_in"))):
    participant = db.get(Participant, body.participant_id)
    if not participant or not participant.active:
        raise HTTPException(status_code=404, detail="Participant not found")
    created = []
    for _ in range(body.bag_count):
        tag_code = _next_tag_code(db)
        bag = Bag(tag_code=tag_code, participant_id=participant.id, status="CHECKED_IN", vehicle_code=None)
        db.add(bag)
        db.flush()
        _add_event(db, bag, officer, "CHECKED_IN", "Bag tagged & receipt issued")
        created.append(bag)
    db.commit()
    return [_bag_out(db, b) for b in created]


@router.delete("/bags/{tag_code}", response_model=BagOut)
def remove_bag(tag_code: str, db: Session = Depends(get_db), _: Officer = Depends(require_perms("remove_bag"))):
    bag = _find_bag(db, tag_code)
    if bag.status != "CHECKED_IN":
        raise HTTPException(status_code=409, detail=f"{bag.tag_code} is {bag.status} — can only remove bags still at check-in")
    removed = BagOut(tag_code=bag.tag_code, participant_id=bag.participant_id, status="REMOVED", vehicle_code=None)
    for e in bag.events:
        db.delete(e)
    db.delete(bag)
    db.commit()
    return removed


@router.post("/bags/load", response_model=list[BagOut])
def load_bags(body: LoadRequest, db: Session = Depends(get_db), officer: Officer = Depends(require_perms("load"))):
    vehicle = _vehicle(db, body.vehicle_code or DEFAULT_VEHICLE)
    if vehicle.status != "AT_ORIGIN":
        raise HTTPException(status_code=409, detail=f"Vehicle {vehicle.code} is {vehicle.status} — loading only allowed at origin")
    loaded = []
    for tag in body.tag_codes:
        bag = _find_bag(db, tag)
        if bag.status != "CHECKED_IN":
            raise HTTPException(status_code=409, detail=f"{bag.tag_code} is {bag.status} — cannot load")
        bag.vehicle_code = vehicle.code
        _add_event(db, bag, officer, "LOADED", f"Loaded onto {vehicle.code}")
        loaded.append(bag)
    db.commit()
    return [_bag_out(db, b) for b in loaded]


@router.post("/bags/depart", response_model=VehicleOut)
def depart(vehicle_code: str = DEFAULT_VEHICLE, db: Session = Depends(get_db), officer: Officer = Depends(require_perms("load"))):
    vehicle = _vehicle(db, vehicle_code)
    if vehicle.status != "AT_ORIGIN":
        raise HTTPException(status_code=409, detail=f"Vehicle {vehicle.code} is {vehicle.status} — cannot depart")
    vehicle.status = "IN_TRANSIT"
    vehicle.updated_at = _now()
    bags = db.query(Bag).filter(Bag.status == "LOADED", Bag.vehicle_code == vehicle.code).all()
    for bag in bags:
        _add_event(db, bag, officer, "IN_TRANSIT", "Manifest locked — truck departed")
    db.add(
        Trip(
            vehicle_code=vehicle.code,
            departed_at=_now(),
            bag_count=len(bags),
            departed_by=officer.id,
        )
    )
    db.commit()
    db.refresh(vehicle)
    return VehicleOut.model_validate(vehicle)


@router.post("/bags/unload", response_model=ActionResult)
def unload(tag_code: str = "", all_bags: bool = False, vehicle_code: str = DEFAULT_VEHICLE, db: Session = Depends(get_db), officer: Officer = Depends(require_perms("unload"))):
    vehicle = _vehicle(db, vehicle_code)
    if all_bags:
        if vehicle.status != "IN_TRANSIT":
            raise HTTPException(status_code=409, detail=f"Vehicle {vehicle.code} is {vehicle.status} — nothing to offload")
        bags = db.query(Bag).filter(Bag.status == "IN_TRANSIT", Bag.vehicle_code == vehicle.code).all()
        for bag in bags:
            _add_event(db, bag, officer, "UNLOADED", "Scanned off truck at destination")
        vehicle.status = "AT_DESTINATION"
        vehicle.updated_at = _now()
        trip = _trip_for_vehicle(db, vehicle.code)
        if trip:
            trip.arrived_at = _now()
            trip.arrived_by = officer.id
        db.commit()
        return ActionResult(reason=f"{len(bags)} bag(s) offloaded — {vehicle.code} at destination")
    if not tag_code:
        raise HTTPException(status_code=422, detail="Provide tag_code or all_bags=true")
    bag = _find_bag(db, tag_code)
    if bag.status != "IN_TRANSIT":
        raise HTTPException(status_code=409, detail=f"{bag.tag_code} is {bag.status} — can only offload bags in transit")
    vehicle = _vehicle_for_bag(db, bag)
    remaining = (
        db.query(Bag)
        .filter(Bag.status == "IN_TRANSIT", Bag.vehicle_code == vehicle.code, Bag.id != bag.id)
        .count()
    )
    _add_event(db, bag, officer, "UNLOADED", "Scanned off truck at destination")
    if remaining == 0:
        vehicle.status = "AT_DESTINATION"
        vehicle.updated_at = _now()
        trip = _trip_for_vehicle(db, vehicle.code)
        if trip:
            trip.arrived_at = _now()
            trip.arrived_by = officer.id
    db.commit()
    return ActionResult(reason=f"{bag.tag_code} offloaded" + ("" if remaining else " — last bag, truck ready to return"))


@router.post("/bags/handover", response_model=ActionResult)
def handover(body: HandoverRequest, db: Session = Depends(get_db), officer: Officer = Depends(require_perms("handover"))):
    bag = _find_bag(db, body.tag_code)
    if bag.participant_id != body.participant_id:
        raise HTTPException(status_code=409, detail=f"MISMATCH — {bag.tag_code} belongs to a different participant")
    if bag.status == "LOST":
        raise HTTPException(status_code=409, detail=f"{bag.tag_code} is marked LOST — recover it before handing over")
    if bag.status != "UNLOADED":
        raise HTTPException(status_code=409, detail=f"{bag.tag_code} is {bag.status} — cannot hand over yet")
    _add_event(db, bag, officer, "HANDED_OVER", "ID verified — bag returned")
    db.commit()
    return ActionResult(reason=f"{bag.tag_code} handed over")


@router.post("/bags/lost", response_model=BagOut)
def mark_lost(body: LostBagRequest, db: Session = Depends(get_db), officer: Officer = Depends(require_perms("handover", "admin"))):
    bag = _find_bag(db, body.tag_code)
    if bag.status == "HANDED_OVER":
        raise HTTPException(status_code=409, detail=f"{bag.tag_code} already handed over — cannot mark lost")
    if bag.status == "LOST":
        raise HTTPException(status_code=409, detail=f"{bag.tag_code} is already marked lost")
    bag.restore_status = bag.status
    _add_event(db, bag, officer, "LOST", body.note.strip() or "Marked lost")
    db.commit()
    return _bag_out(db, bag)


@router.post("/bags/recover", response_model=BagOut)
def recover_bag(body: RecoverBagRequest, db: Session = Depends(get_db), officer: Officer = Depends(require_perms("handover", "admin"))):
    bag = _find_bag(db, body.tag_code)
    if bag.status != "LOST":
        raise HTTPException(status_code=409, detail=f"{bag.tag_code} is {bag.status} — only lost bags can be recovered")
    target = bag.restore_status or "UNLOADED"
    _add_event(db, bag, officer, target, "Bag recovered — returned to previous status")
    bag.restore_status = None
    db.commit()
    return _bag_out(db, bag)


@router.post("/bags/return-to-origin", response_model=VehicleOut)
def return_to_origin(vehicle_code: str = DEFAULT_VEHICLE, db: Session = Depends(get_db), officer: Officer = Depends(require_perms("load"))):
    vehicle = _vehicle(db, vehicle_code)
    if vehicle.status != "AT_DESTINATION":
        raise HTTPException(status_code=409, detail=f"Vehicle {vehicle.code} is {vehicle.status} — nothing to return")
    vehicle.status = "AT_ORIGIN"
    vehicle.updated_at = _now()
    trip = _trip_for_vehicle(db, vehicle.code)
    if trip:
        trip.returned_at = _now()
        trip.returned_by = officer.id
    db.commit()
    db.refresh(vehicle)
    return VehicleOut.model_validate(vehicle)


@router.post("/bags/reset", response_model=ActionResult)
def reset_database(db: Session = Depends(get_db), _: Officer = Depends(require_perms("admin"))):
    """Dev/demo helper: wipe all bags and events, vehicles back to origin. Participants and trip history are kept."""
    for event in db.query(Event).all():
        db.delete(event)
    for bag in db.query(Bag).all():
        db.delete(bag)
    for vehicle in db.query(Vehicle).all():
        vehicle.status = "AT_ORIGIN"
        vehicle.updated_at = _now()
    db.commit()
    return ActionResult(reason="Database emptied — ready for fresh check-in")


@router.get("/bags/{tag_code}", response_model=BagOut)
def get_bag(tag_code: str, db: Session = Depends(get_db), _: Officer = Depends(current_officer)):
    return _bag_out(db, _find_bag(db, tag_code))
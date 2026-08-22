from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Bag, Officer, Vehicle
from ..permissions import require_perms
from ..schemas import VehicleCreate, VehicleUpdate

router = APIRouter(prefix="/api/vehicles", tags=["vehicles"])

VEHICLE_STATUSES = ("AT_ORIGIN", "IN_TRANSIT", "AT_DESTINATION")


def _vehicle_stats(db: Session, vehicle: Vehicle) -> dict:
    bags = db.query(Bag).filter(Bag.vehicle_code == vehicle.code).all()
    return {
        "code": vehicle.code,
        "status": vehicle.status,
        "loaded": sum(1 for b in bags if b.status == "LOADED"),
        "in_transit": sum(1 for b in bags if b.status == "IN_TRANSIT"),
        "unloaded": sum(1 for b in bags if b.status == "UNLOADED"),
        "total": len(bags),
    }


@router.get("")
def list_vehicles(db: Session = Depends(get_db), _: Officer = Depends(require_perms("load", "admin"))):
    return [_vehicle_stats(db, v) for v in db.query(Vehicle).order_by(Vehicle.code).all()]


@router.post("", status_code=201)
def create_vehicle(body: VehicleCreate, db: Session = Depends(get_db), _: Officer = Depends(require_perms("admin"))):
    code = body.code.strip().upper()
    if not code:
        raise HTTPException(status_code=422, detail="Vehicle code is required")
    if db.get(Vehicle, code):
        raise HTTPException(status_code=409, detail=f"Vehicle {code} already exists")
    vehicle = Vehicle(code=code, status="AT_ORIGIN")
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return _vehicle_stats(db, vehicle)


@router.patch("/{code}")
def update_vehicle(
    code: str,
    body: VehicleUpdate,
    db: Session = Depends(get_db),
    _: Officer = Depends(require_perms("admin")),
):
    vehicle = db.get(Vehicle, code)
    if not vehicle:
        raise HTTPException(status_code=404, detail=f"Vehicle {code} not found")
    if body.status is not None:
        if body.status not in VEHICLE_STATUSES:
            raise HTTPException(status_code=422, detail=f"Status must be one of {VEHICLE_STATUSES}")
        vehicle.status = body.status
    db.commit()
    db.refresh(vehicle)
    return _vehicle_stats(db, vehicle)


@router.delete("/{code}")
def delete_vehicle(code: str, db: Session = Depends(get_db), _: Officer = Depends(require_perms("admin"))):
    vehicle = db.get(Vehicle, code)
    if not vehicle:
        raise HTTPException(status_code=404, detail=f"Vehicle {code} not found")
    assigned = db.query(Bag).filter(Bag.vehicle_code == code).count()
    if assigned:
        raise HTTPException(status_code=409, detail=f"Vehicle {code} has {assigned} bags assigned — clear them first")
    db.delete(vehicle)
    db.commit()
    return {"ok": True, "reason": f"Vehicle {code} removed"}
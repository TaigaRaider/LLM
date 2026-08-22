from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Officer, Trip
from ..permissions import require_perms
from ..schemas import TripOut

router = APIRouter(prefix="/api/trips", tags=["trips"])


def _trip_out(db: Session, trip: Trip) -> TripOut:
    officers = {o.id: o.name for o in db.query(Officer).all()}
    return TripOut(
        id=trip.id,
        vehicle_code=trip.vehicle_code,
        departed_at=trip.departed_at,
        arrived_at=trip.arrived_at,
        returned_at=trip.returned_at,
        bag_count=trip.bag_count,
        departed_by=officers.get(trip.departed_by, ""),
        arrived_by=officers.get(trip.arrived_by, ""),
        returned_by=officers.get(trip.returned_by, ""),
    )


@router.get("", response_model=list[TripOut])
def list_trips(db: Session = Depends(get_db), _: Officer = Depends(require_perms("reports", "admin"))):
    return [_trip_out(db, t) for t in db.query(Trip).order_by(Trip.departed_at.desc()).limit(200).all()]
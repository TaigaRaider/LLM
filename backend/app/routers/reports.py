from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Bag, Officer
from ..schemas import ReconciliationReport
from ..security import current_officer

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/reconciliation", response_model=ReconciliationReport)
def reconciliation(db: Session = Depends(get_db), _: Officer = Depends(current_officer)):
    checked_in = db.query(Bag).count()
    counts = {status: db.query(Bag).filter(Bag.status == status).count() for status in ("HANDED_OVER", "IN_TRANSIT", "UNLOADED", "LOADED", "CHECKED_IN")}
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
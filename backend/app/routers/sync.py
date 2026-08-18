from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Officer
from ..schemas import SyncDryRunResult, SyncStatus
from ..security import current_officer
from ..sync.adapter import ExternalApiError
from ..sync.service import service

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.get("/status", response_model=SyncStatus)
def sync_status(_: Officer = Depends(current_officer)):
    return service.status.snapshot()


@router.post("/run", response_model=SyncStatus)
async def run_sync(_: Officer = Depends(current_officer)):
    try:
        return await service.run_once_async()
    except ExternalApiError as exc:
        service.status.last_error = str(exc)
        return service.status.snapshot()


@router.post("/dry-run", response_model=SyncDryRunResult)
async def dry_run(_: Officer = Depends(current_officer)):
    reached, sample, guess = await service.adapter.dry_run()
    return SyncDryRunResult(reached=reached, sample=sample, guessed_field_map=guess)
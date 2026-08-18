from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Officer, Participant
from ..schemas import ParticipantIn, ParticipantOut, ParticipantUpdate
from ..security import current_officer

router = APIRouter(prefix="/api/participants", tags=["participants"])


def _next_id_number(db: Session) -> str:
    max_num = 0
    for p in db.query(Participant).all():
        digits = "".join(ch for ch in p.id_number if ch.isdigit())
        if digits.isdigit():
            max_num = max(max_num, int(digits))
    return f"ID-{max_num + 1:04d}"


@router.get("", response_model=list[ParticipantOut])
def list_participants(
    search: str = "",
    active_only: bool = False,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: Officer = Depends(current_officer),
):
    q = db.query(Participant)
    if search:
        s = f"%{search.strip().lower()}%"
        q = q.filter(
            or_(
                Participant.name.ilike(s),
                Participant.id_number.ilike(s),
                Participant.phone.ilike(s),
            )
        )
    if active_only:
        q = q.filter(Participant.active.is_(True))
    elif not include_inactive:
        q = q.filter(Participant.active.is_(True))
    return q.order_by(Participant.name).all()


@router.post("", response_model=ParticipantOut, status_code=201)
def create_participant(
    body: ParticipantIn,
    db: Session = Depends(get_db),
    _: Officer = Depends(current_officer),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name is required")
    id_number = body.id_number.strip() or _next_id_number(db)
    existing = db.query(Participant).filter(Participant.id_number == id_number).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"ID number {id_number} already registered")
    participant = Participant(
        name=name,
        id_number=id_number,
        phone=body.phone.strip(),
        group=body.group.strip(),
        external_id=body.external_id,
        source="local",
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return participant


@router.post("/bulk", response_model=list[ParticipantOut], status_code=201)
def bulk_create_participants(
    items: list[ParticipantIn],
    db: Session = Depends(get_db),
    _: Officer = Depends(current_officer),
):
    created = []
    existing_numbers = {p.id_number for p in db.query(Participant).all()}
    for item in items:
        name = item.name.strip()
        if not name:
            continue
        id_number = item.id_number.strip() or _next_id_number(db)
        if id_number in existing_numbers:
            continue
        participant = Participant(
            name=name,
            id_number=id_number,
            phone=item.phone.strip(),
            group=item.group.strip(),
            external_id=item.external_id,
            source="local",
        )
        db.add(participant)
        existing_numbers.add(id_number)
        created.append(participant)
    db.commit()
    for p in created:
        db.refresh(p)
    return created


@router.put("/{participant_id}", response_model=ParticipantOut)
def update_participant(
    participant_id: str,
    body: ParticipantUpdate,
    db: Session = Depends(get_db),
    _: Officer = Depends(current_officer),
):
    participant = db.get(Participant, participant_id)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    if body.name is not None:
        participant.name = body.name.strip()
    if body.id_number is not None:
        new_number = body.id_number.strip()
        if new_number:
            clash = db.query(Participant).filter(
                Participant.id_number == new_number, Participant.id != participant_id
            ).first()
            if clash:
                raise HTTPException(status_code=409, detail=f"ID number {new_number} already registered")
            participant.id_number = new_number
    if body.phone is not None:
        participant.phone = body.phone.strip()
    if body.group is not None:
        participant.group = body.group.strip()
    if body.active is not None:
        participant.active = body.active
    db.commit()
    db.refresh(participant)
    return participant


@router.delete("/{participant_id}", response_model=ParticipantOut)
def delete_participant(
    participant_id: str,
    db: Session = Depends(get_db),
    _: Officer = Depends(current_officer),
):
    participant = db.get(Participant, participant_id)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    participant.active = False
    db.commit()
    db.refresh(participant)
    return participant
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Officer
from ..permissions import ALL_PERMISSIONS, PERMISSIONS, officer_out, require_perms
from ..schemas import OfficerIn, OfficerOut, OfficerUpdate
from ..security import hash_password

router = APIRouter(prefix="/api/officers", tags=["officers"])


@router.get("", response_model=list[OfficerOut])
def list_officers(db: Session = Depends(get_db), _: Officer = Depends(require_perms("admin"))):
    return [officer_out(o) for o in db.query(Officer).order_by(Officer.name).all()]


@router.post("", response_model=OfficerOut, status_code=201)
def create_officer(body: OfficerIn, db: Session = Depends(get_db), _: Officer = Depends(require_perms("admin"))):
    if body.role not in PERMISSIONS:
        raise HTTPException(status_code=422, detail=f"Unknown role — use one of: {', '.join(PERMISSIONS)}")
    username = body.username.strip()
    if db.query(Officer).filter(Officer.username == username).first():
        raise HTTPException(status_code=409, detail=f"Username {username} already exists")
    officer = Officer(
        name=body.name.strip(),
        role=body.role,
        username=username,
        password_hash=hash_password(body.password),
        must_change_password=True,
    )
    db.add(officer)
    db.commit()
    db.refresh(officer)
    return officer_out(officer)


@router.put("/{officer_id}", response_model=OfficerOut)
def update_officer(
    officer_id: str,
    body: OfficerUpdate,
    db: Session = Depends(get_db),
    _: Officer = Depends(require_perms("admin")),
):
    officer = db.get(Officer, officer_id)
    if not officer:
        raise HTTPException(status_code=404, detail="Officer not found")
    if body.name is not None:
        officer.name = body.name.strip()
    if body.role is not None:
        if body.role not in PERMISSIONS:
            raise HTTPException(status_code=422, detail=f"Unknown role — use one of: {', '.join(PERMISSIONS)}")
        officer.role = body.role
    if body.username is not None:
        username = body.username.strip()
        clash = db.query(Officer).filter(Officer.username == username, Officer.id != officer_id).first()
        if clash:
            raise HTTPException(status_code=409, detail=f"Username {username} already exists")
        officer.username = username
    if body.password is not None:
        officer.password_hash = hash_password(body.password)
        officer.must_change_password = True
    if body.active is not None:
        officer.active = body.active
    db.commit()
    db.refresh(officer)
    return officer_out(officer)


@router.get("/roles")
def list_roles(_: Officer = Depends(require_perms("admin"))):
    return [{"role": role, "permissions": sorted(perms) if "*" not in perms else sorted(ALL_PERMISSIONS)} for role, perms in PERMISSIONS.items()]
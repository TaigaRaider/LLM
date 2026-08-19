from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Officer
from ..permissions import officer_out
from ..schemas import (
    ChangePasswordRequest,
    LoginRequest,
    OfficerOut,
    TokenResponse,
)
from ..security import (
    create_token,
    current_officer,
    current_officer_for_password_change,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    officer = db.query(Officer).filter(Officer.username == body.username.strip()).first()
    if not officer or not officer.active or not verify_password(body.password, officer.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return TokenResponse(token=create_token(officer.id), officer=officer_out(officer))


@router.get("/me", response_model=OfficerOut)
def me(officer: Officer = Depends(current_officer)):
    return officer_out(officer)


@router.post("/change-password", response_model=OfficerOut)
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    officer: Officer = Depends(current_officer_for_password_change),
):
    if not verify_password(body.current_password, officer.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if body.new_password == body.current_password:
        raise HTTPException(status_code=400, detail="New password must differ from the current one")
    officer.password_hash = hash_password(body.new_password)
    officer.must_change_password = False
    db.commit()
    db.refresh(officer)
    return officer_out(officer)
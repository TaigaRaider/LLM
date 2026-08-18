from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Officer
from ..schemas import LoginRequest, OfficerOut, TokenResponse
from ..security import create_token, current_officer, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    officer = db.query(Officer).filter(Officer.username == body.username.strip()).first()
    if not officer or not officer.active or not verify_password(body.password, officer.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return TokenResponse(token=create_token(officer.id), officer=OfficerOut.model_validate(officer))


@router.get("/me", response_model=OfficerOut)
def me(officer: Officer = Depends(current_officer)):
    return OfficerOut.model_validate(officer)
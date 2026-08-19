import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import Base, SessionLocal, engine
from .models import Officer
from .routers import auth, bags, officers, participants, reports, sync
from .security import hash_password
from .sync.service import service

SEED_OFFICERS = [
    {"username": "ama", "name": "Ama Mensah", "role": "Check-in Officer"},
    {"username": "kofi", "name": "Kofi Owusu", "role": "Handover Officer"},
    {"username": "efua", "name": "Efua Addo", "role": "Logistics Manager"},
]


def seed_officers() -> None:
    db = SessionLocal()
    try:
        if db.query(Officer).count() == 0:
            password = get_settings().default_officer_password
            for o in SEED_OFFICERS:
                db.add(
                    Officer(
                        username=o["username"],
                        name=o["name"],
                        role=o["role"],
                        password_hash=hash_password(password),
                        must_change_password=True,
                    )
                )
            db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_officers()
    task = None
    if service.adapter.enabled:
        task = asyncio.create_task(service.poll_loop())
    yield
    if task:
        task.cancel()


app = FastAPI(title=get_settings().app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(officers.router)
app.include_router(participants.router)
app.include_router(bags.router)
app.include_router(reports.router)
app.include_router(sync.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
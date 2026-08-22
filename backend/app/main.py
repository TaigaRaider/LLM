import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import get_settings
from .database import Base, SessionLocal, engine
from .models import Officer, Vehicle, Participant
from .routers import auth, bags, officers, participants, reports, sync, trips, vehicles
from .security import hash_password
from .sync.service import service

SEED_OFFICERS = [
    {"username": "ama", "name": "Ama Mensah", "role": "Check-in Officer"},
    {"username": "kofi", "name": "Kofi Owusu", "role": "Handover Officer"},
    {"username": "efua", "name": "Efua Addo", "role": "Logistics Manager"},
]

SEED_PARTICIPANTS = [
    {"name": "Abena Osei", "id_number": "ID-001", "phone": "0244123456", "group": "Bus A"},
    {"name": "Kwame Asante", "id_number": "ID-002", "phone": "0244234567", "group": "Bus A"},
    {"name": "Akosua Boadu", "id_number": "ID-003", "phone": "0244345678", "group": "Bus B"},
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
                        must_change_password=False,
                    )
                )
            db.commit()
    finally:
        db.close()


def seed_participants() -> None:
    db = SessionLocal()
    try:
        if db.query(Participant).count() == 0:
            for p in SEED_PARTICIPANTS:
                db.add(
                    Participant(
                        name=p["name"],
                        id_number=p["id_number"],
                        phone=p["phone"],
                        group=p["group"],
                        active=True,
                        source="local",
                    )
                )
            db.commit()
    finally:
        db.close()


def migrate() -> None:
    """Idempotent migrations for the live database (create_all does not alter existing tables)."""
    with engine.begin() as conn:
        # Use IF NOT EXISTS for Postgres (works on 9.6+), fallback for SQLite
        dialect = conn.dialect.name
        if dialect == "sqlite":
            try:
                conn.execute(text("ALTER TABLE bags ADD COLUMN restore_status VARCHAR"))
            except Exception:
                pass
        else:
            conn.execute(text("ALTER TABLE bags ADD COLUMN IF NOT EXISTS restore_status VARCHAR"))
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS trips (
                    id VARCHAR PRIMARY KEY,
                    vehicle_code VARCHAR NOT NULL,
                    departed_at TIMESTAMPTZ NOT NULL,
                    arrived_at TIMESTAMPTZ,
                    returned_at TIMESTAMPTZ,
                    bag_count INTEGER NOT NULL DEFAULT 0,
                    departed_by VARCHAR NOT NULL DEFAULT '',
                    arrived_by VARCHAR NOT NULL DEFAULT '',
                    returned_by VARCHAR NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ
                )
                """
            )
        )
        # Use now() for Postgres, datetime('now') for SQLite
        now_fn = "now()" if dialect != "sqlite" else "datetime('now')"
        conn.execute(
            text(
                f"INSERT INTO vehicles (code, status, updated_at) VALUES ('TRUCK-01', 'AT_ORIGIN', {now_fn}) "
                "ON CONFLICT (code) DO NOTHING"
            )
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    migrate()
    seed_officers()
    seed_participants()
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
app.include_router(vehicles.router)
app.include_router(trips.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
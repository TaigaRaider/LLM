import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

BAG_STATUSES = ("CHECKED_IN", "LOADED", "IN_TRANSIT", "UNLOADED", "HANDED_OVER")
VEHICLE_STATUSES = ("AT_ORIGIN", "IN_TRANSIT", "AT_DESTINATION")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex[:12]


class Officer(Base):
    __tablename__ = "officers"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, default="")
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    external_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    id_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    phone: Mapped[str] = mapped_column(String, default="")
    group: Mapped[str] = mapped_column(String, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[str] = mapped_column(String, default="local")  # local | external
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Bag(Base):
    __tablename__ = "bags"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    tag_code: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id"), nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="CHECKED_IN")
    vehicle_code: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    events: Mapped[list["Event"]] = relationship(back_populates="bag", order_by="Event.timestamp")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bag_id: Mapped[str] = mapped_column(ForeignKey("bags.id"), nullable=False, index=True)
    event: Mapped[str] = mapped_column(String, nullable=False)
    officer_id: Mapped[str] = mapped_column(ForeignKey("officers.id"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    note: Mapped[str] = mapped_column(String, default="")

    bag: Mapped[Bag] = relationship(back_populates="events")


class Vehicle(Base):
    __tablename__ = "vehicles"

    code: Mapped[str] = mapped_column(String, primary_key=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="AT_ORIGIN")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
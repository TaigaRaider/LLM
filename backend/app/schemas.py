from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class OfficerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    role: str
    username: str
    active: bool = True
    must_change_password: bool = False
    permissions: list[str] = []


class OfficerIn(BaseModel):
    name: str = Field(min_length=1)
    role: str = Field(min_length=1)
    username: str = Field(min_length=2)
    password: str = Field(min_length=6)


class OfficerUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    username: str | None = None
    password: str | None = Field(default=None, min_length=6)
    active: bool | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    token: str
    officer: OfficerOut


class ParticipantIn(BaseModel):
    name: str = Field(min_length=1)
    id_number: str = Field(default="")
    phone: str = ""
    group: str = ""
    external_id: str | None = None


class ParticipantUpdate(BaseModel):
    name: str | None = None
    id_number: str | None = None
    phone: str | None = None
    group: str | None = None
    active: bool | None = None


class ParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    external_id: str | None
    name: str
    id_number: str
    phone: str
    group: str
    active: bool
    source: str
    synced_at: datetime | None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event: str
    officer_id: str
    officer_name: str = ""
    timestamp: datetime
    note: str


class BagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tag_code: str
    participant_id: str
    status: str
    vehicle_code: str | None
    timeline: list[EventOut] = []


class CheckInRequest(BaseModel):
    participant_id: str
    bag_count: int = Field(ge=1, le=20)


class LoadRequest(BaseModel):
    tag_codes: list[str] = Field(min_length=1)


class HandoverRequest(BaseModel):
    participant_id: str
    tag_code: str


class ActionResult(BaseModel):
    ok: bool = True
    reason: str = ""


class ReconciliationReport(BaseModel):
    checked_in: int
    handed_over: int
    in_transit: int
    unloaded: int
    loaded: int
    at_origin: int
    outstanding: int
    discrepancy: int
    ok: bool


class SyncStatus(BaseModel):
    enabled: bool
    last_run_at: datetime | None = None
    last_success_at: datetime | None = None
    last_error: str | None = None
    last_imported: int = 0
    last_soft_deleted: int = 0
    participant_count: int = 0


class SyncDryRunResult(BaseModel):
    reached: bool
    sample: list[dict] = []
    guessed_field_map: dict = {}


class VehicleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    status: str
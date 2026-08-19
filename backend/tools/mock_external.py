"""Mock of the existing participant registration system — for local testing.

Run:  python -m uvicorn tools.mock_external:app --port 8090

Then point the backend at it:
    LLM_EXTERNAL_API_BASE_URL=http://localhost:8090/api
    LLM_EXTERNAL_API_PARTICIPANTS_PATH=/participants
    LLM_EXTERNAL_API_DELTA_PATH=/participants/updated
    LLM_EXTERNAL_API_FIELD_MAP={"id":"id","name":"name","nationalId":"id_number","phone":"phone","bus":"group"}
    LLM_EXTERNAL_SYNC_ENABLED=true

The mock stores a participant list in a local JSON file (mock_external_data.json).
Endpoints:
  GET /api/participants             full snapshot
  GET /api/participants/updated?updated_since=<ISO>   records updated after a timestamp
  POST /api/participants            add a participant (mimics their write path; not used by LLM)
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

DATA_FILE = os.path.join(os.path.dirname(__file__), "mock_external_data.json")

app = FastAPI(title="Mock External Registration System")

START = [
    {"id": "X-001", "nationalId": "NID-8844", "name": "Grace Mensah", "phone": "0241110001", "bus": "Bus A", "updatedAt": "2026-08-10T08:00:00Z"},
    {"id": "X-002", "nationalId": "NID-5521", "name": "David Osei", "phone": "0241110002", "bus": "Bus B", "updatedAt": "2026-08-10T08:05:00Z"},
    {"id": "X-003", "nationalId": "NID-9090", "name": "Linda Adjei", "phone": "0241110003", "bus": "Bus A", "updatedAt": "2026-08-10T08:10:00Z"},
]


class ParticipantIn(BaseModel):
    nationalId: str = Field(min_length=3)
    name: str = Field(min_length=1)
    phone: str = ""
    bus: str = ""


def _load() -> list[dict]:
    if not os.path.exists(DATA_FILE):
        return list(START)
    try:
        return json.load(open(DATA_FILE, encoding="utf-8"))
    except Exception:
        return list(START)


def _save(data: list[dict]) -> None:
    json.dump(data, open(DATA_FILE, "w", encoding="utf-8"), indent=2)


@app.get("/api/participants")
def participants():
    return {"data": _load()}


@app.get("/api/participants/updated")
def updated(updated_since: str = ""):
    data = _load()
    if not updated_since:
        return {"data": data}
    try:
        since_dt = datetime.fromisoformat(updated_since.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422, detail="Bad updated_since")
    return {
        "data": [
            p
            for p in data
            if datetime.fromisoformat(p["updatedAt"].replace("Z", "+00:00")) > since_dt
        ]
    }


@app.post("/api/participants", status_code=201)
def create(body: ParticipantIn):
    data = _load()
    if any(p["nationalId"] == body.nationalId for p in data):
        raise HTTPException(status_code=409, detail="nationalId already exists")
    record = body.model_dump()
    record["id"] = f"X-{len(data) + 100:03d}"
    record["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    data.append(record)
    _save(data)
    return record


@app.post("/api/reset")
def reset():
    _save(list(START))
    return {"ok": True}
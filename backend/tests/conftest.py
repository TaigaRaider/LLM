import os
import tempfile

TEST_DB = os.path.join(tempfile.gettempdir(), "llm-test.db")
if os.path.exists(TEST_DB):
    os.remove(TEST_DB)
os.environ["LLM_DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["LLM_JWT_SECRET"] = "test-secret-with-more-than-32-bytes-ok"
os.environ["LLM_EXTERNAL_SYNC_ENABLED"] = "false"

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def token(client):
    resp = client.post("/api/auth/login", json={"username": "ama", "password": "officer123"})
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


@pytest.fixture(scope="session")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


def make_participant(client, auth, name="Test Person", id_number=""):
    resp = client.post(
        "/api/participants",
        json={"name": name, "id_number": id_number, "phone": "0240000000", "group": "Bus A"},
        headers=auth,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()
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

from app.database import Base, engine
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def create_tables():
    Base.metadata.create_all(engine)
    yield


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def token(client):
    return login_officer(client, "efua")


@pytest.fixture(scope="session")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def ama_token(client):
    return login_officer(client, "ama")


@pytest.fixture(scope="session")
def ama_auth(ama_token):
    return {"Authorization": f"Bearer {ama_token}"}


@pytest.fixture(scope="session")
def kofi_token(client):
    return login_officer(client, "kofi")


@pytest.fixture(scope="session")
def kofi_auth(kofi_token):
    return {"Authorization": f"Bearer {kofi_token}"}


def login_officer(client, username: str, password: str = "officer123", new_password: str = "test-password-456") -> str:
    """Login as an officer and clear the forced password change."""
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    if resp.status_code != 200 and password != new_password:
        resp = client.post("/api/auth/login", json={"username": username, "password": new_password})
    assert resp.status_code == 200, resp.text
    token = resp.json()["token"]
    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": password, "new_password": new_password},
        headers={"Authorization": f"Bearer {token}"},
    )
    if resp.status_code == 400:
        resp = client.post(
            "/api/auth/change-password",
            json={"current_password": new_password, "new_password": "changed-once-1"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200, resp.text
    return token


def make_participant(client, auth, name="Test Person", id_number=""):
    resp = client.post(
        "/api/participants",
        json={"name": name, "id_number": id_number, "phone": "0240000000", "group": "Bus A"},
        headers=auth,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()
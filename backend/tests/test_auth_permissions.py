"""Authentication, forced password change, and role-based permission tests."""

from conftest import login_officer


def test_login_returns_permissions_and_force_flag(client, auth):
    resp = client.post(
        "/api/officers",
        json={"name": "Fresh Officer", "role": "Check-in Officer", "username": "fresh1", "password": "pass12345"},
        headers=auth,
    )
    assert resp.status_code == 201
    resp = client.post("/api/auth/login", json={"username": "fresh1", "password": "pass12345"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["officer"]["role"] == "Check-in Officer"
    assert set(body["officer"]["permissions"]) == {"check_in", "remove_bag", "load", "lookup", "reports"}
    assert body["officer"]["must_change_password"] is True


def test_forced_password_change_blocks_protected_endpoints(client, auth):
    client.post(
        "/api/officers",
        json={"name": "Fresh Two", "role": "Handover Officer", "username": "fresh2", "password": "pass12345"},
        headers=auth,
    )
    resp = client.post("/api/auth/login", json={"username": "fresh2", "password": "pass12345"})
    token = resp.json()["token"]
    resp = client.get("/api/bags", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    assert resp.json()["detail"] == "CHANGE_PASSWORD_REQUIRED"
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_change_password_flow(client, auth):
    resp = client.post(
        "/api/officers",
        json={"name": "Flow Officer", "role": "Handover Officer", "username": "flowy", "password": "pass12345"},
        headers=auth,
    )
    assert resp.status_code == 201
    token = login_officer(client, "flowy", "pass12345")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200

    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": "wrong", "new_password": "new-password-1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400

    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": "test-password-456", "new_password": "test-password-456"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400  # must differ from current

    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": "test-password-456", "new_password": "new-password-1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["must_change_password"] is False

    resp = client.post("/api/auth/login", json={"username": "flowy", "password": "new-password-1"})
    assert resp.status_code == 200
    assert resp.json()["officer"]["must_change_password"] is False
    resp = client.post("/api/auth/login", json={"username": "flowy", "password": "test-password-456"})
    assert resp.status_code == 401


def test_check_in_officer_denied_admin_endpoints(client, ama_auth):
    resp = client.get("/api/participants", headers=ama_auth)
    assert resp.status_code == 403
    resp = client.post("/api/participants", json={"name": "X", "id_number": "ID-X"}, headers=ama_auth)
    assert resp.status_code == 403
    resp = client.post("/api/bags/reset", headers=ama_auth)
    assert resp.status_code == 403
    resp = client.post("/api/sync/run", headers=ama_auth)
    assert resp.status_code == 403
    resp = client.get("/api/officers", headers=ama_auth)
    assert resp.status_code == 403


def test_check_in_officer_allowed_checkin_and_load(client, ama_auth):
    resp = client.post("/api/bags/check-in", json={"participant_id": "p-none", "bag_count": 1}, headers=ama_auth)
    assert resp.status_code == 404  # permission ok (reached the handler), participant missing


def test_handover_officer_denied_checkin(client, kofi_auth):
    resp = client.post("/api/bags/check-in", json={"participant_id": "p-none", "bag_count": 1}, headers=kofi_auth)
    assert resp.status_code == 403
    resp = client.post("/api/bags/load", json={"tag_codes": []}, headers=kofi_auth)
    assert resp.status_code == 403
    resp = client.get("/api/reports/reconciliation", headers=kofi_auth)
    assert resp.status_code == 200  # reports allowed


def test_officers_crud(client, auth):
    resp = client.post(
        "/api/officers",
        json={"name": "New Officer", "role": "Check-in Officer", "username": "newbie", "password": "pass12345"},
        headers=auth,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["must_change_password"] is True
    assert body["permissions"] == ["check_in", "load", "lookup", "remove_bag", "reports"]

    resp = client.get("/api/officers", headers=auth)
    assert any(o["username"] == "newbie" for o in resp.json())

    resp = client.post(
        "/api/officers",
        json={"name": "Dup", "role": "Handover Officer", "username": "newbie", "password": "pass12345"},
        headers=auth,
    )
    assert resp.status_code == 409

    resp = client.post(
        "/api/officers",
        json={"name": "Bad Role", "role": "Supreme Leader", "username": "badrole", "password": "pass12345"},
        headers=auth,
    )
    assert resp.status_code == 422

    resp = client.put(
        f"/api/officers/{body['id']}",
        json={"role": "Handover Officer", "active": False},
        headers=auth,
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["role"] == "Handover Officer"
    assert updated["active"] is False
    assert updated["permissions"] == ["handover", "lookup", "reports", "unload"]

    resp = client.get("/api/officers/roles", headers=auth)
    roles = {r["role"]: r["permissions"] for r in resp.json()}
    assert "admin" in roles["Logistics Manager"]
    assert set(roles["Check-in Officer"]) == {"check_in", "remove_bag", "load", "lookup", "reports"}


def test_new_officer_must_change_password(client, auth):
    resp = client.post(
        "/api/officers",
        json={"name": "Second New", "role": "Logistics Manager", "username": "newbie2", "password": "pass12345"},
        headers=auth,
    )
    officer_id = resp.json()["id"]

    login = client.post("/api/auth/login", json={"username": "newbie2", "password": "pass12345"})
    assert login.status_code == 200
    token = login.json()["token"]
    assert client.get("/api/bags", headers={"Authorization": f"Bearer {token}"}).status_code == 403

    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": "pass12345", "new_password": "changed-now-1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    resp = client.put(f"/api/officers/{officer_id}", json={"password": "reset-pass-1"}, headers=auth)
    assert resp.status_code == 200
    assert resp.json()["must_change_password"] is True


def test_inactive_officer_cannot_login(client, auth):
    resp = client.post(
        "/api/officers",
        json={"name": "Ghost", "role": "Logistics Manager", "username": "ghosty", "password": "pass12345"},
        headers=auth,
    )
    officer_id = resp.json()["id"]
    client.put(f"/api/officers/{officer_id}", json={"active": False}, headers=auth)
    resp = client.post("/api/auth/login", json={"username": "ghosty", "password": "pass12345"})
    assert resp.status_code == 401
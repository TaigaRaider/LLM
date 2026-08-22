from conftest import make_participant


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_login_rejects_bad_password(client):
    resp = client.post("/api/auth/login", json={"username": "ama", "password": "wrong"})
    assert resp.status_code == 401


def test_auth_required(client):
    assert client.get("/api/participants").status_code == 401


def test_participant_create_auto_id(client, auth):
    p = make_participant(client, auth)
    assert p["id_number"] == "ID-0004"
    assert p["source"] == "local"


def test_participant_duplicate_id_rejected(client, auth):
    make_participant(client, auth, name="First", id_number="ID-9001")
    resp = client.post("/api/participants", json={"name": "Second", "id_number": "ID-9001"}, headers=auth)
    assert resp.status_code == 409


def test_participant_soft_delete(client, auth):
    p = make_participant(client, auth, name="To Delete", id_number="ID-9002")
    resp = client.delete(f"/api/participants/{p['id']}", headers=auth)
    assert resp.status_code == 200 and resp.json()["active"] is False
    listed = client.get("/api/participants", headers=auth).json()
    assert all(x["id"] != p["id"] for x in listed)


def test_checkin_creates_tags_and_timeline(client, auth):
    p = make_participant(client, auth, name="Bag Owner", id_number="ID-9003")
    resp = client.post("/api/bags/check-in", json={"participant_id": p["id"], "bag_count": 2}, headers=auth)
    assert resp.status_code == 201
    bags = resp.json()
    assert [b["tag_code"] for b in bags] == ["LLM-0001", "LLM-0002"]
    assert bags[0]["status"] == "CHECKED_IN"
    assert bags[0]["timeline"][0]["event"] == "CHECKED_IN"
    assert bags[0]["timeline"][0]["officer_name"] == "Efua Addo"


def test_checkin_skips_existing_tags(client, auth):
    resp = client.post("/api/bags/check-in", json={"participant_id": "p-any", "bag_count": 1}, headers=auth)
    assert resp.status_code == 404  # unknown participant
    p = make_participant(client, auth, name="Collision", id_number="ID-9004")
    tags = client.post("/api/bags/check-in", json={"participant_id": p["id"], "bag_count": 3}, headers=auth).json()
    assert [b["tag_code"] for b in tags] == ["LLM-0003", "LLM-0004", "LLM-0005"]


def reset_bags(client, auth):
    resp = client.post("/api/bags/reset", headers=auth)
    assert resp.status_code == 200, resp.text


def test_remove_bag_at_checkin(client, auth):
    reset_bags(client, auth)
    p = make_participant(client, auth, name="Remover", id_number="ID-9005")
    bag = client.post("/api/bags/check-in", json={"participant_id": p["id"], "bag_count": 1}, headers=auth).json()[0]
    resp = client.delete(f"/api/bags/{bag['tag_code']}", headers=auth)
    assert resp.status_code == 200
    resp = client.delete(f"/api/bags/{bag['tag_code']}", headers=auth)
    assert resp.status_code == 404


def test_full_lifecycle(client, auth):
    reset_bags(client, auth)
    p = make_participant(client, auth, name="Traveller", id_number="ID-9006")
    bag = client.post("/api/bags/check-in", json={"participant_id": p["id"], "bag_count": 1}, headers=auth).json()[0]
    tag = bag["tag_code"]

    resp = client.post("/api/bags/load", json={"tag_codes": [tag]}, headers=auth)
    assert resp.status_code == 200 and resp.json()[0]["status"] == "LOADED"

    resp = client.post("/api/bags/depart", headers=auth)
    assert resp.status_code == 200 and resp.json()["status"] == "IN_TRANSIT"
    assert client.get(f"/api/bags/{tag}", headers=auth).json()["status"] == "IN_TRANSIT"

    resp = client.post(f"/api/bags/unload?tag_code={tag}", headers=auth)
    assert resp.status_code == 200 and resp.json()["reason"].endswith("truck ready to return")
    assert client.get("/api/vehicle", headers=auth).json()["status"] == "AT_DESTINATION"

    resp = client.post("/api/bags/handover", json={"participant_id": p["id"], "tag_code": tag}, headers=auth)
    assert resp.status_code == 200

    detail = client.get(f"/api/bags/{tag}", headers=auth).json()
    assert detail["status"] == "HANDED_OVER"
    assert [e["event"] for e in detail["timeline"]] == ["CHECKED_IN", "LOADED", "IN_TRANSIT", "UNLOADED", "HANDED_OVER"]

    resp = client.post("/api/bags/return-to-origin", headers=auth)
    assert resp.status_code == 200 and resp.json()["status"] == "AT_ORIGIN"


def test_handover_mismatch_rejected(client, auth):
    reset_bags(client, auth)
    owner = make_participant(client, auth, name="Owner", id_number="ID-9007")
    other = make_participant(client, auth, name="Other", id_number="ID-9008")
    bag = client.post("/api/bags/check-in", json={"participant_id": owner["id"], "bag_count": 1}, headers=auth).json()[0]
    tag = bag["tag_code"]
    client.post("/api/bags/load", json={"tag_codes": [tag]}, headers=auth)
    client.post("/api/bags/depart", headers=auth)
    client.post(f"/api/bags/unload?tag_code={tag}", headers=auth)
    resp = client.post("/api/bags/handover", json={"participant_id": other["id"], "tag_code": tag}, headers=auth)
    assert resp.status_code == 409 and "MISMATCH" in resp.json()["detail"]


def test_cannot_load_twice(client, auth):
    reset_bags(client, auth)
    p = make_participant(client, auth, name="Double", id_number="ID-9009")
    bag = client.post("/api/bags/check-in", json={"participant_id": p["id"], "bag_count": 1}, headers=auth).json()[0]
    client.post("/api/bags/load", json={"tag_codes": [bag["tag_code"]]}, headers=auth)
    resp = client.post("/api/bags/load", json={"tag_codes": [bag["tag_code"]]}, headers=auth)
    assert resp.status_code == 409


def test_unload_all(client, auth):
    reset_bags(client, auth)
    p = make_participant(client, auth, name="Bulk", id_number="ID-9010")
    bags = client.post("/api/bags/check-in", json={"participant_id": p["id"], "bag_count": 3}, headers=auth).json()
    client.post("/api/bags/load", json={"tag_codes": [b["tag_code"] for b in bags]}, headers=auth)
    client.post("/api/bags/depart", headers=auth)
    resp = client.post("/api/bags/unload?all_bags=true", headers=auth)
    assert resp.status_code == 200
    assert client.get("/api/vehicle", headers=auth).json()["status"] == "AT_DESTINATION"
    listed = client.get("/api/bags", headers=auth).json()
    assert all(b["status"] == "UNLOADED" for b in listed)


def test_reconciliation(client, auth):
    report = client.get("/api/reports/reconciliation", headers=auth).json()
    assert report["ok"] is True
    assert report["checked_in"] == report["handed_over"] + report["in_transit"] + report["unloaded"] + report["loaded"] + report["at_origin"]


def test_sync_dry_run_offline(client, auth):
    resp = client.post("/api/sync/dry-run", headers=auth)
    assert resp.status_code == 200
    assert resp.json()["reached"] is False


def test_sync_status_shape(client, auth):
    status = client.get("/api/sync/status", headers=auth).json()
    assert "enabled" in status and "last_imported" in status and "participant_count" in status
"""Clinician-note endpoint tests with stubbed Supabase calls."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.routers.clinician_notes as notes_router
from app.core.auth import CurrentUser, get_access_token, get_current_user
from app.core.config import Settings
from app.main import app

PSYCH_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
PATIENT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
NOTE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
PSYCHOLOGIST = CurrentUser(user_id=PSYCH_ID, role="psychologist", claims={})
PATIENT = CurrentUser(user_id=PATIENT_ID, role="patient", claims={})
URL = f"/psychologist/patients/{PATIENT_ID}/notes"


def _settings() -> Settings:
    return Settings(
        supabase_url="https://test-project.supabase.co",
        supabase_service_role_key="service-key-secret",
    )


def _row() -> dict:
    return {
        "id": NOTE_ID,
        "patient_id": PATIENT_ID,
        "psychologist_id": PSYCH_ID,
        "note": "Reviewed trends with the patient.",
        "created_at": "2026-11-27T00:00:00Z",
    }


@pytest.fixture()
def env(monkeypatch: pytest.MonkeyPatch) -> dict:
    captured: dict = {"audit": [], "inserted": []}
    monkeypatch.setattr(notes_router, "get_settings", _settings)

    async def verified(settings, token, psychologist_id):
        return captured.get("verified", True)

    async def scope(settings, token, patient_id):
        return None if captured.get("no_link") else "summary_only"

    async def rpc(settings, token, name, params):
        if name == "record_patient_access":
            captured["audit"].append(params)
            return None
        raise AssertionError(f"unexpected rpc {name}")

    async def notes(settings, token, patient_id):
        return [_row()]

    async def insert(settings, token, **kwargs):
        captured["inserted"].append(kwargs)
        return _row()

    monkeypatch.setattr(notes_router.supabase_data, "get_psychologist_verified", verified)
    monkeypatch.setattr(notes_router.supabase_data, "get_link_scope", scope)
    monkeypatch.setattr(notes_router.supabase_data, "call_rpc", rpc)
    monkeypatch.setattr(notes_router.supabase_data, "list_clinician_notes", notes)
    monkeypatch.setattr(notes_router.supabase_data, "insert_clinician_note", insert)
    return captured


@pytest.fixture()
def client(env: dict) -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: PSYCHOLOGIST
    app.dependency_overrides[get_access_token] = lambda: "test-jwt"
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_notes_require_psychologist_role(env: dict) -> None:
    app.dependency_overrides[get_current_user] = lambda: PATIENT
    app.dependency_overrides[get_access_token] = lambda: "test-jwt"
    try:
        assert TestClient(app).get(URL).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_unverified_psychologist_is_forbidden(client: TestClient, env: dict) -> None:
    env["verified"] = False
    response = client.get(URL)
    assert response.status_code == 403
    assert env["audit"] == []


def test_missing_active_link_is_not_found(client: TestClient, env: dict) -> None:
    env["no_link"] = True
    response = client.get(URL)
    assert response.status_code == 404


def test_list_notes_audits_access(client: TestClient, env: dict) -> None:
    response = client.get(URL)
    assert response.status_code == 200
    assert response.json()["notes"][0]["id"] == NOTE_ID
    assert env["audit"] == [
        {"p_patient": PATIENT_ID, "p_action": "view_clinician_notes"}
    ]


def test_add_note_uses_psychologist_identity(client: TestClient, env: dict) -> None:
    response = client.post(URL, json={"note": "Reviewed trends with the patient."})
    assert response.status_code == 200
    assert env["inserted"][0] == {
        "patient_id": PATIENT_ID,
        "psychologist_id": PSYCH_ID,
        "note": "Reviewed trends with the patient.",
    }


def test_empty_note_is_rejected(client: TestClient) -> None:
    assert client.post(URL, json={"note": "   "}).status_code == 422

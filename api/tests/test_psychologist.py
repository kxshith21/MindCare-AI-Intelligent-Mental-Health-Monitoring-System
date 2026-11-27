"""Psychologist endpoint tests with stubbed RLS-scoped data calls."""

from __future__ import annotations

from uuid import UUID

import pytest
from fastapi.testclient import TestClient

import app.routers.psychologist as psychologist_router
from app.core.auth import CurrentUser, get_access_token, get_current_user
from app.core.config import Settings
from app.main import app
from app.services.supabase_data import SupabaseDataError

PSYCH_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
PATIENT_FULL_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
PATIENT_SUMMARY_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
EVENT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd"
MESSAGE_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"

PSYCHOLOGIST = CurrentUser(user_id=PSYCH_ID, role="psychologist", claims={})
PATIENT = CurrentUser(user_id=PATIENT_FULL_ID, role="patient", claims={})


def _settings() -> Settings:
    return Settings(
        supabase_url="https://test-project.supabase.co",
        supabase_service_role_key="service-key-secret",
    )


@pytest.fixture()
def env(monkeypatch: pytest.MonkeyPatch) -> dict:
    captured: dict = {"audit_calls": [], "scope_calls": [], "content_calls": []}

    monkeypatch.setattr(psychologist_router, "get_settings", _settings)

    async def verified(settings, token, psychologist_id):
        return captured.get("verified", True)

    async def patients(settings, token, psychologist_id):
        captured["patients_called"] = True
        return [
            {
                "id": PATIENT_FULL_ID,
                "display_name": "Full Share",
                "region": "IN",
                "share_scope": "full",
            },
            {
                "id": PATIENT_SUMMARY_ID,
                "display_name": "Summary Only",
                "region": None,
                "share_scope": "summary_only",
            },
        ]

    async def scope(settings, token, patient_id):
        captured["scope_calls"].append(patient_id)
        scopes = {
            PATIENT_FULL_ID: "full",
            PATIENT_SUMMARY_ID: "summary_only",
        }
        return scopes.get(patient_id)

    async def rpc(settings, token, name, params):
        captured.setdefault("rpc_calls", []).append((name, params))
        if name == "record_patient_access":
            captured["audit_calls"].append(params)
            return None
        if name == "shared_checkins":
            return [
                {
                    "mood": 3,
                    "phq9_score": 6,
                    "gad7_score": 4,
                    "created_at": "2026-11-27T00:00:00Z",
                    "note": None,
                    "phq9_answers": None,
                    "gad7_answers": None,
                }
            ]
        raise AssertionError(f"unexpected rpc {name}")

    async def events(settings, token):
        return [
            {
                "id": EVENT_ID,
                "patient_id": PATIENT_FULL_ID,
                "message_id": MESSAGE_ID,
                "level": "elevated",
                "reason": "hopelessness",
                "status": "new",
                "created_at": "2026-11-27T00:00:00Z",
                "reviewed_by": None,
                "reviewed_at": None,
            },
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "patient_id": PATIENT_SUMMARY_ID,
                "message_id": "22222222-2222-2222-2222-222222222222",
                "level": "high",
                "reason": "plan_or_means",
                "status": "new",
                "created_at": "2026-11-27T00:01:00Z",
                "reviewed_by": None,
                "reviewed_at": None,
            },
        ]

    async def contents(settings, token, message_ids):
        captured["content_calls"].append(message_ids)
        return {MESSAGE_ID: "sensitive user text"}

    async def update(settings, token, event_id, status):
        captured["update"] = (event_id, status)
        return {
            "id": EVENT_ID,
            "patient_id": PATIENT_FULL_ID,
            "message_id": MESSAGE_ID,
            "level": "elevated",
            "reason": "hopelessness",
            "status": status,
            "created_at": "2026-11-27T00:00:00Z",
            "reviewed_by": PSYCH_ID,
            "reviewed_at": "2026-11-27T01:00:00Z",
        }

    monkeypatch.setattr(psychologist_router.supabase_data, "get_psychologist_verified", verified)
    monkeypatch.setattr(psychologist_router.supabase_data, "list_linked_patients", patients)
    monkeypatch.setattr(psychologist_router.supabase_data, "get_link_scope", scope)
    monkeypatch.setattr(psychologist_router.supabase_data, "call_rpc", rpc)
    monkeypatch.setattr(psychologist_router.supabase_data, "list_risk_events", events)
    monkeypatch.setattr(psychologist_router.supabase_data, "get_message_contents", contents)
    monkeypatch.setattr(psychologist_router.supabase_data, "update_risk_event", update)
    return captured


@pytest.fixture()
def client(env: dict) -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: PSYCHOLOGIST
    app.dependency_overrides[get_access_token] = lambda: "test-jwt"
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_patients_endpoint_requires_psychologist_role(env: dict) -> None:
    app.dependency_overrides[get_current_user] = lambda: PATIENT
    app.dependency_overrides[get_access_token] = lambda: "test-jwt"
    try:
        response = TestClient(app).get("/psychologist/patients")
        assert response.status_code == 403
        assert env.get("patients_called") is None
    finally:
        app.dependency_overrides.clear()


def test_unverified_psychologist_is_forbidden(client: TestClient, env: dict) -> None:
    env["verified"] = False
    response = client.get("/psychologist/patients")
    assert response.status_code == 403
    assert response.json()["detail"] == "Psychologist account is not verified."
    assert env.get("patients_called") is None


def test_list_patients_audits_each_view(client: TestClient, env: dict) -> None:
    response = client.get("/psychologist/patients")
    assert response.status_code == 200
    data = response.json()
    assert [item["id"] for item in data["patients"]] == [
        PATIENT_FULL_ID,
        PATIENT_SUMMARY_ID,
    ]
    assert {item["share_scope"] for item in data["patients"]} == {"full", "summary_only"}
    assert {call["p_patient"] for call in env["audit_calls"]} == {
        PATIENT_FULL_ID,
        PATIENT_SUMMARY_ID,
    }
    assert all(call["p_action"] == "view_patient_list" for call in env["audit_calls"])


def test_trends_requires_active_link(client: TestClient, env: dict) -> None:
    unknown_id = "99999999-9999-9999-9999-999999999999"
    response = client.get(f"/psychologist/patients/{unknown_id}/trends")
    assert response.status_code == 404


def test_trends_returns_only_shared_fields(client: TestClient, env: dict) -> None:
    response = client.get(f"/psychologist/patients/{PATIENT_SUMMARY_ID}/trends")
    assert response.status_code == 200
    data = response.json()
    assert UUID(data["patient_id"])
    assert data["share_scope"] == "summary_only"
    assert data["checkins"][0]["phq9_score"] == 6
    assert data["checkins"][0]["note"] is None
    assert any(call["p_action"] == "view_trends" for call in env["audit_calls"])


def test_risk_events_hide_summary_only_message_text(client: TestClient, env: dict) -> None:
    response = client.get("/psychologist/risk-events")
    assert response.status_code == 200
    events = response.json()["events"]
    assert len(events) == 2
    assert events[0]["content"] == "sensitive user text"
    assert events[1]["content"] is None
    assert env["content_calls"] == [[MESSAGE_ID]]
    assert any(call["p_action"] == "view_risk_events" for call in env["audit_calls"])


def test_review_risk_event_updates_status(client: TestClient, env: dict) -> None:
    response = client.patch(
        f"/psychologist/risk-events/{EVENT_ID}", json={"status": "acknowledged"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "acknowledged"
    assert data["content"] is None
    assert env["update"] == (EVENT_ID, "acknowledged")


def test_review_rejects_new_status(client: TestClient) -> None:
    response = client.patch(
        f"/psychologist/risk-events/{EVENT_ID}", json={"status": "new"}
    )
    assert response.status_code == 422


def test_data_errors_are_mapped(monkeypatch: pytest.MonkeyPatch, env: dict) -> None:
    async def fail(settings, token, psychologist_id):
        raise SupabaseDataError(403, "The data service rejected this request.")

    monkeypatch.setattr(psychologist_router.supabase_data, "get_psychologist_verified", fail)
    app.dependency_overrides[get_current_user] = lambda: PSYCHOLOGIST
    app.dependency_overrides[get_access_token] = lambda: "test-jwt"
    try:
        response = TestClient(app).get("/psychologist/risk-events")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()

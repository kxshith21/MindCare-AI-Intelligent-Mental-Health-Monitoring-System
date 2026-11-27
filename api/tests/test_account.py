"""Account-deletion endpoint tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.routers.account as account_router
from app.core.auth import CurrentUser, get_access_token, get_current_user
from app.core.config import Settings
from app.main import app
from app.services.supabase_data import SupabaseDataError

PATIENT = CurrentUser(user_id="patient-delete-1", role="patient", claims={})
PSYCHOLOGIST = CurrentUser(user_id="psych-delete-1", role="psychologist", claims={})


def _settings() -> Settings:
    return Settings(
        supabase_url="https://test-project.supabase.co",
        supabase_service_role_key="service-key-secret",
    )


@pytest.fixture()
def env(monkeypatch: pytest.MonkeyPatch) -> dict:
    captured: dict = {}
    monkeypatch.setattr(account_router, "get_settings", _settings)

    async def delete_data(settings, token):
        captured["rpc_called"] = True
        return {
            "messages": 4,
            "conversations": 1,
            "risk_events": 1,
            "checkins": 2,
            "care_links": 1,
            "clinician_notes": 0,
            "audit_rows_anonymised": 3,
        }

    async def delete_auth(settings, user_id):
        captured["auth_deleted"] = user_id

    monkeypatch.setattr(account_router.supabase_data, "call_delete_my_data", delete_data)
    monkeypatch.setattr(account_router.supabase_data, "delete_auth_user", delete_auth)
    return captured


@pytest.fixture()
def client(env: dict) -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: PATIENT
    app.dependency_overrides[get_access_token] = lambda: "test-jwt"
    yield TestClient(app)
    app.dependency_overrides.clear()


def _delete(client: TestClient, confirm: str = "DELETE"):
    return client.request("DELETE", "/account", json={"confirm": confirm})


def test_patient_can_delete_account(client: TestClient, env: dict) -> None:
    response = _delete(client)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "deleted"
    assert data["auth_user_deleted"] is True
    assert data["data_deleted"]["messages"] == 4
    assert env["rpc_called"] is True
    assert env["auth_deleted"] == PATIENT.user_id


def test_confirmation_is_required(client: TestClient, env: dict) -> None:
    response = _delete(client, "delete")
    assert response.status_code == 422
    assert not env.get("rpc_called")
    assert "auth_deleted" not in env


def test_psychologist_cannot_use_patient_deletion(env: dict) -> None:
    app.dependency_overrides[get_current_user] = lambda: PSYCHOLOGIST
    app.dependency_overrides[get_access_token] = lambda: "test-jwt"
    try:
        response = _delete(TestClient(app))
        assert response.status_code == 403
        assert not env.get("rpc_called")
    finally:
        app.dependency_overrides.clear()


def test_data_deletion_failure_skips_auth_deletion(
    monkeypatch: pytest.MonkeyPatch, env: dict
) -> None:
    async def fail(settings, token):
        raise SupabaseDataError(502, "Could not reach the data service.")

    monkeypatch.setattr(account_router.supabase_data, "call_delete_my_data", fail)
    app.dependency_overrides[get_current_user] = lambda: PATIENT
    app.dependency_overrides[get_access_token] = lambda: "test-jwt"
    try:
        response = _delete(TestClient(app))
        assert response.status_code == 502
        assert "auth_deleted" not in env
    finally:
        app.dependency_overrides.clear()


def test_auth_deletion_failure_returns_502(
    monkeypatch: pytest.MonkeyPatch, env: dict
) -> None:
    async def fail(settings, user_id):
        raise SupabaseDataError(502, "Could not delete the account.")

    monkeypatch.setattr(account_router.supabase_data, "delete_auth_user", fail)
    app.dependency_overrides[get_current_user] = lambda: PATIENT
    app.dependency_overrides[get_access_token] = lambda: "test-jwt"
    try:
        response = _delete(TestClient(app))
        assert response.status_code == 502
        assert env["rpc_called"] is True
    finally:
        app.dependency_overrides.clear()

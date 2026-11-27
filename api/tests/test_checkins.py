"""Check-in endpoint tests with stubbed Supabase calls."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.routers.checkins as checkins_router
from app.core.auth import CurrentUser, get_access_token, get_current_user
from app.core.config import Settings
from app.main import app
from app.services.supabase_data import SupabaseDataError

PATIENT_ID = "11111111-1111-1111-1111-111111111111"
CHECKIN_ID = "22222222-2222-2222-2222-222222222222"
PATIENT = CurrentUser(user_id=PATIENT_ID, role="patient", claims={})
PSYCHOLOGIST = CurrentUser(user_id="33333333-3333-3333-3333-333333333333", role="psychologist", claims={})


def _settings() -> Settings:
    return Settings(
        supabase_url="https://test-project.supabase.co",
        supabase_service_role_key="service-key-secret",
    )


def _row(**overrides: object) -> dict:
    row = {
        "id": CHECKIN_ID,
        "patient_id": PATIENT_ID,
        "mood": 3,
        "note": None,
        "phq9_answers": None,
        "gad7_answers": None,
        "phq9_score": None,
        "gad7_score": None,
        "created_at": "2026-11-27T00:00:00Z",
    }
    row.update(overrides)
    return row


@pytest.fixture()
def env(monkeypatch: pytest.MonkeyPatch) -> dict:
    captured: dict = {"inserted": [], "risk_events": [], "list_calls": []}
    monkeypatch.setattr(checkins_router, "get_settings", _settings)

    async def insert_checkin(settings, token, **kwargs):
        captured["inserted"].append(kwargs)
        return _row(**{key: kwargs[key] for key in ("mood", "note", "phq9_answers", "gad7_answers")})

    async def region(settings, token, patient_id):
        return "IN"

    async def risk_event(settings, **kwargs):
        captured["risk_events"].append(kwargs)
        return "risk-1"

    async def list_checkins(settings, token, patient_id, *, from_dt=None, to_dt=None):
        captured["list_calls"].append((patient_id, from_dt, to_dt))
        return [_row()]

    monkeypatch.setattr(checkins_router.supabase_data, "insert_checkin", insert_checkin)
    monkeypatch.setattr(checkins_router.supabase_data, "get_profile_region", region)
    monkeypatch.setattr(checkins_router.supabase_data, "insert_risk_event", risk_event)
    monkeypatch.setattr(checkins_router.supabase_data, "list_checkins", list_checkins)
    return captured


@pytest.fixture()
def client(env: dict) -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: PATIENT
    app.dependency_overrides[get_access_token] = lambda: "test-jwt"
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_checkins_require_patient_role(client: TestClient) -> None:
    app.dependency_overrides[get_current_user] = lambda: PSYCHOLOGIST
    app.dependency_overrides[get_access_token] = lambda: "test-jwt"
    try:
        assert TestClient(app).post("/checkins", json={"mood": 3}).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_mood_only_checkin_has_no_risk_event(client: TestClient, env: dict) -> None:
    response = client.post("/checkins", json={"mood": 4})
    assert response.status_code == 200
    data = response.json()
    assert data["show_crisis_resources"] is False
    assert data["crisis_resources"] == []
    assert env["risk_events"] == []
    assert env["inserted"][0]["mood"] == 4


def test_client_supplied_scores_are_ignored(client: TestClient, env: dict) -> None:
    response = client.post(
        "/checkins", json={"mood": 3, "phq9_score": 99, "gad7_score": 99}
    )
    assert response.status_code == 200
    assert "phq9_score" not in env["inserted"][0]
    assert "gad7_score" not in env["inserted"][0]
    assert response.json()["phq9_score"] is None


def test_item9_zero_creates_no_risk_event(client: TestClient, env: dict) -> None:
    answers = [0] * 9
    response = client.post("/checkins", json={"mood": 2, "phq9_answers": answers})
    assert response.status_code == 200
    assert response.json()["show_crisis_resources"] is False
    assert env["risk_events"] == []


@pytest.mark.parametrize(
    ("answer", "level"),
    [(1, "elevated"), (2, "elevated"), (3, "high")],
)
def test_positive_item9_creates_risk_event_and_resources(
    client: TestClient, env: dict, answer: int, level: str
) -> None:
    answers = [0] * 9
    answers[8] = answer
    response = client.post("/checkins", json={"mood": 1, "phq9_answers": answers})
    assert response.status_code == 200
    data = response.json()
    assert data["show_crisis_resources"] is True
    assert data["reason"] == "self_harm_ideation"
    assert any("14416" in item["contact"] for item in data["crisis_resources"])
    assert env["risk_events"] == [
        {
            "patient_id": PATIENT_ID,
            "level": level,
            "reason": "self_harm_ideation",
        }
    ]


def test_resources_render_even_if_risk_event_write_fails(
    client: TestClient, env: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fail(settings, **kwargs):
        raise SupabaseDataError(502, "Could not insert risk event.")

    monkeypatch.setattr(checkins_router.supabase_data, "insert_risk_event", fail)
    answers = [0] * 9
    answers[8] = 2
    response = client.post("/checkins", json={"mood": 2, "phq9_answers": answers})
    assert response.status_code == 200
    assert response.json()["show_crisis_resources"] is True
    assert len(response.json()["crisis_resources"]) >= 2


@pytest.mark.parametrize(
    "answers",
    [[0] * 8, [0] * 8 + [4], [-1] + [0] * 8],
)
def test_invalid_questionnaire_answers_are_rejected(
    client: TestClient, answers: list[int]
) -> None:
    response = client.post("/checkins", json={"mood": 3, "phq9_answers": answers})
    assert response.status_code == 422


def test_list_checkins_passes_range_and_returns_own_rows(
    client: TestClient, env: dict
) -> None:
    response = client.get("/checkins?from=2026-11-01T00:00:00Z&to=2026-11-30T00:00:00Z")
    assert response.status_code == 200
    assert len(response.json()["checkins"]) == 1
    patient_id, from_dt, to_dt = env["list_calls"][0]
    assert patient_id == PATIENT_ID
    assert from_dt is not None and to_dt is not None
    assert from_dt < to_dt


def test_inverted_range_is_rejected(client: TestClient) -> None:
    response = client.get("/checkins?from=2026-11-30T00:00:00Z&to=2026-11-01T00:00:00Z")
    assert response.status_code == 400

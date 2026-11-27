"""Psychologist signup endpoint tests.

Covers: server-assigned role (client cannot influence it), service-key
requirement, duplicate-email conflict mapping, upstream failures, request
validation, and that the service role key never appears in a response.
"""

import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

import app.routers.auth as auth_router
from app.core.config import Settings
from app.main import app
from app.services.supabase_admin import AdminApiError, admin_create_user

VALID_BODY = {
    "email": "applicant@example.com",
    "password": "long-enough-password",
    "display_name": "Dr Applicant",
    "license_no": "LIC-12345",
    "region": "US",
}


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture()
def settings() -> Settings:
    return Settings(
        supabase_url="https://test-project.supabase.co",
        supabase_service_role_key="service-key-secret",
    )


def _patch_settings(monkeypatch: pytest.MonkeyPatch, **overrides: object) -> None:
    base = {
        "supabase_url": "https://test-project.supabase.co",
        "supabase_service_role_key": "service-key-secret",
    }
    base.update(overrides)
    monkeypatch.setattr(auth_router, "get_settings", lambda: Settings(**base))


def _patch_admin(
    monkeypatch: pytest.MonkeyPatch, handler=None
) -> dict:
    """Replace admin_create_user in the router; return a capture dict."""
    captured: dict = {}

    async def default_handler(settings, *, email, password, app_metadata, user_metadata):
        captured.update(
            email=email,
            password=password,
            app_metadata=app_metadata,
            user_metadata=user_metadata,
        )
        return {"id": "user-abc", "email": email}

    monkeypatch.setattr(auth_router, "admin_create_user", handler or default_handler)
    return captured


# ---------------------------------------------------------------------------
# Endpoint behaviour
# ---------------------------------------------------------------------------


def test_signup_success_assigns_psychologist_role(client, monkeypatch) -> None:
    _patch_settings(monkeypatch)
    captured = _patch_admin(monkeypatch)

    response = client.post("/auth/psychologist-signup", json=VALID_BODY)

    assert response.status_code == 201
    data = response.json()
    assert data["role"] == "psychologist"
    assert data["verified"] is False
    assert data["user_id"] == "user-abc"
    assert data["email"] == VALID_BODY["email"]
    # role comes from the SERVER, license from the applicant
    assert captured["app_metadata"] == {"role": "psychologist"}
    assert captured["user_metadata"]["license_no"] == "LIC-12345"
    assert captured["user_metadata"]["display_name"] == "Dr Applicant"
    assert captured["user_metadata"]["region"] == "US"


def test_client_supplied_role_is_ignored(client, monkeypatch) -> None:
    """A 'role' field in the body must not influence the created account."""
    _patch_settings(monkeypatch)
    captured = _patch_admin(monkeypatch)

    response = client.post(
        "/auth/psychologist-signup",
        json={**VALID_BODY, "role": "patient", "verified": True},
    )

    assert response.status_code == 201
    assert captured["app_metadata"] == {"role": "psychologist"}
    assert "role" not in captured["user_metadata"]
    assert "verified" not in captured["user_metadata"]


def test_duplicate_email_returns_409(client, monkeypatch) -> None:
    _patch_settings(monkeypatch)

    async def handler(settings, **kwargs):
        raise AdminApiError(409, "User already registered")

    _patch_admin(monkeypatch, handler)
    response = client.post("/auth/psychologist-signup", json=VALID_BODY)

    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_upstream_failure_returns_502(client, monkeypatch) -> None:
    _patch_settings(monkeypatch)

    async def handler(settings, **kwargs):
        raise AdminApiError(502, "admin api returned 500")

    _patch_admin(monkeypatch, handler)
    response = client.post("/auth/psychologist-signup", json=VALID_BODY)

    assert response.status_code == 502
    assert "service-key-secret" not in response.text


def test_missing_service_key_returns_503(client, monkeypatch) -> None:
    _patch_settings(monkeypatch, supabase_service_role_key="")

    async def should_not_be_called(settings, **kwargs):  # pragma: no cover
        raise AssertionError("admin_create_user must not be called without a key")

    _patch_admin(monkeypatch, should_not_be_called)
    response = client.post("/auth/psychologist-signup", json=VALID_BODY)

    assert response.status_code == 503


def test_response_without_user_id_returns_502(client, monkeypatch) -> None:
    _patch_settings(monkeypatch)

    async def handler(settings, **kwargs):
        return {}

    _patch_admin(monkeypatch, handler)
    response = client.post("/auth/psychologist-signup", json=VALID_BODY)

    assert response.status_code == 502


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({**VALID_BODY, "email": "not-an-email"}, "email"),
        ({**VALID_BODY, "password": "short"}, "password"),
        ({**VALID_BODY, "display_name": ""}, "display_name"),
        ({k: v for k, v in VALID_BODY.items() if k != "license_no"}, "license_no"),
    ],
)
def test_invalid_fields_are_rejected(client, monkeypatch, body, field) -> None:
    _patch_settings(monkeypatch)
    _patch_admin(monkeypatch)
    response = client.post("/auth/psychologist-signup", json=body)

    assert response.status_code == 422
    assert field in response.text


# ---------------------------------------------------------------------------
# Service layer (Supabase Admin API)
# ---------------------------------------------------------------------------


def _patch_post(monkeypatch: pytest.MonkeyPatch, status_code: int, body: dict) -> dict:
    captured: dict = {}

    async def fake_post(self, url, *, json=None, headers=None, **kwargs):
        captured.update(url=url, json=json, headers=headers)
        return httpx.Response(status_code, json=body)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    return captured


def test_admin_create_user_sends_server_side_role(
    monkeypatch, settings: Settings
) -> None:
    captured = _patch_post(monkeypatch, 200, {"id": "u-1", "email": "a@b.co"})

    result = asyncio.run(
        admin_create_user(
            settings,
            email="a@b.co",
            password="long-enough-password",
            app_metadata={"role": "psychologist"},
            user_metadata={"display_name": "Dr A", "license_no": "LIC-1"},
        )
    )

    assert result["id"] == "u-1"
    assert captured["json"]["app_metadata"] == {"role": "psychologist"}
    assert captured["json"]["email_confirm"] is True
    assert captured["url"] == "https://test-project.supabase.co/auth/v1/admin/users"
    # service key travels only in outbound headers, never in the body
    assert captured["headers"]["apikey"] == "service-key-secret"
    assert "service-key-secret" not in str(captured["json"])


def test_admin_create_user_maps_duplicate_to_409(
    monkeypatch, settings: Settings
) -> None:
    _patch_post(monkeypatch, 422, {"msg": "User already registered"})

    with pytest.raises(AdminApiError) as exc:
        asyncio.run(
            admin_create_user(
                settings,
                email="a@b.co",
                password="long-enough-password",
                app_metadata={"role": "psychologist"},
                user_metadata={},
            )
        )
    assert exc.value.status_code == 409


def test_admin_create_user_maps_other_errors_to_502(
    monkeypatch, settings: Settings
) -> None:
    _patch_post(monkeypatch, 500, {"msg": "internal"})

    with pytest.raises(AdminApiError) as exc:
        asyncio.run(
            admin_create_user(
                settings,
                email="a@b.co",
                password="long-enough-password",
                app_metadata={"role": "psychologist"},
                user_metadata={},
            )
        )
    assert exc.value.status_code == 502


def test_admin_create_user_requires_service_key() -> None:
    without_key = Settings(
        supabase_url="https://test-project.supabase.co",
        supabase_service_role_key="",
    )
    with pytest.raises(AdminApiError) as exc:
        asyncio.run(
            admin_create_user(
                without_key,
                email="a@b.co",
                password="long-enough-password",
                app_metadata={"role": "psychologist"},
                user_metadata={},
            )
        )
    assert exc.value.status_code == 503

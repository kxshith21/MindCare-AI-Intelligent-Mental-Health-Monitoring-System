"""Health probe tests — HTTP is monkeypatched, no real network calls."""

from __future__ import annotations

import logging

import httpx
import pytest
from fastapi.testclient import TestClient

import app.routers.health as health_router
from app.core.config import Settings
from app.main import app


def _settings(*, configured: bool = True) -> Settings:
    return Settings(
        supabase_url="https://test-project.supabase.co" if configured else "",
        supabase_service_role_key="service-key-secret" if configured else "",
    )


def _patch_http(monkeypatch: pytest.MonkeyPatch, *, status_code: int = 200, error=None) -> dict:
    """Replace the health probe's HTTP client with a capturing fake."""
    captured: dict = {}

    class FakeAsyncClient:
        def __init__(self, *, timeout: float):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, *, headers=None, params=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["params"] = params
            if error is not None:
                raise error
            return httpx.Response(status_code, json=[])

    monkeypatch.setattr(health_router.httpx, "AsyncClient", FakeAsyncClient)
    return captured


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_health_ok_when_db_reachable(monkeypatch, client) -> None:
    monkeypatch.setattr(health_router, "get_settings", lambda: _settings())
    captured = _patch_http(monkeypatch, status_code=200)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "mindcare-api"}
    assert captured["url"] == "https://test-project.supabase.co/rest/v1/profiles"
    assert captured["headers"]["apikey"] == "service-key-secret"
    assert captured["headers"]["Authorization"] == "Bearer service-key-secret"
    assert captured["timeout"] <= 5.0


def test_health_degraded_when_db_unreachable(monkeypatch, client, caplog) -> None:
    monkeypatch.setattr(health_router, "get_settings", lambda: _settings())
    _patch_http(
        monkeypatch,
        error=httpx.ConnectError("https://secret-host/with-key?token=secret-token"),
    )

    with caplog.at_level(logging.INFO):
        response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "service": "mindcare-api"}
    assert "secret-host" not in response.text
    assert "secret-token" not in caplog.text


def test_health_degraded_when_not_configured(monkeypatch, client) -> None:
    monkeypatch.setattr(
        health_router, "get_settings", lambda: _settings(configured=False)
    )
    captured = _patch_http(monkeypatch, status_code=200)

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "service": "mindcare-api"}
    assert "url" not in captured


def test_health_degraded_on_upstream_error(monkeypatch, client) -> None:
    monkeypatch.setattr(health_router, "get_settings", lambda: _settings())
    _patch_http(monkeypatch, status_code=500)

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "service": "mindcare-api"}


def test_cors_allows_web_origin(monkeypatch, client) -> None:
    monkeypatch.setattr(health_router, "get_settings", lambda: _settings())
    _patch_http(monkeypatch, status_code=200)

    response = client.get("/health", headers={"Origin": "http://localhost:3000"})

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"

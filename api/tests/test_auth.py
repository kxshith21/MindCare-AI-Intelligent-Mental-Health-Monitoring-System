"""Auth guard tests: Supabase JWT verification and role checks.

A fresh RSA key pair is generated per test session and a matching JWKS is
served via a monkeypatched fetcher, so no network access is needed.
"""

import base64
import time

import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core import auth
from app.core.auth import AuthError, decode_token, extract_role, get_current_user, require_role
from app.core.config import get_settings

ISSUER = "https://test-project.supabase.co/auth/v1"


def _b64url_uint(value: int) -> str:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


@pytest.fixture(scope="module")
def key_pair() -> tuple[bytes, dict]:
    """Return (private_key_pem, jwks) for signing/verifying test tokens."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    numbers = private_key.public_key().public_numbers()
    jwks = {
        "keys": [
            {
                "kty": "RSA",
                "kid": "test-key",
                "use": "sig",
                "alg": "RS256",
                "n": _b64url_uint(numbers.n),
                "e": _b64url_uint(numbers.e),
            }
        ]
    }
    return private_pem, jwks


def _make_token(private_pem: bytes, **overrides: object) -> str:
    claims: dict = {
        "sub": "user-123",
        # Supabase always stamps this built-in claim; it is not an app role.
        "role": "authenticated",
        "app_metadata": {"role": "patient"},
        "aud": "authenticated",
        "iss": ISSUER,
        "exp": int(time.time()) + 300,
    }
    claims.update(overrides)
    return pyjwt.encode(claims, private_pem, algorithm="RS256", headers={"kid": "test-key"})


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch, key_pair: tuple[bytes, dict]) -> TestClient:
    """TestClient for a small app with role-protected routes."""
    _, jwks = key_pair

    async def fake_fetch_jwks(url: str) -> dict:
        return jwks

    monkeypatch.setattr(auth, "fetch_jwks", fake_fetch_jwks)
    auth.reset_jwks_cache()

    test_app = FastAPI()

    @test_app.get("/me")
    async def me(user=Depends(get_current_user)) -> dict:
        return {"user_id": user.user_id, "role": user.role}

    @test_app.get("/patient-only", dependencies=[Depends(require_role("patient"))])
    async def patient_only() -> dict:
        return {"ok": True}

    return TestClient(test_app)


# ---------------------------------------------------------------------------
# Test isolation
# ---------------------------------------------------------------------------


def test_settings_use_fake_issuer_not_local_env() -> None:
    """A local api/.env must never change the issuer used by these tests."""
    assert get_settings().token_issuer == ISSUER


# ---------------------------------------------------------------------------
# extract_role — app_metadata only
# ---------------------------------------------------------------------------


def test_extract_role_reads_app_metadata() -> None:
    assert extract_role({"app_metadata": {"role": "psychologist"}}) == "psychologist"
    assert extract_role({"role": "authenticated", "app_metadata": {"role": "patient"}}) == "patient"


def test_extract_role_ignores_top_level_role_claim() -> None:
    # Even a top-level "patient" claim must not grant the role — Supabase's
    # built-in claim is "authenticated" and we only trust app_metadata.
    assert extract_role({"role": "patient"}) is None
    assert extract_role({"role": "authenticated"}) is None


def test_extract_role_ignores_user_metadata() -> None:
    # Regression: user_metadata is client-writable and must never grant access.
    assert extract_role({"user_metadata": {"role": "psychologist"}}) is None
    assert extract_role(
        {
            "role": "authenticated",
            "app_metadata": {},
            "user_metadata": {"role": "psychologist"},
        }
    ) is None


def test_extract_role_returns_none_when_missing() -> None:
    assert extract_role({}) is None
    assert extract_role({"app_metadata": {}}) is None
    assert extract_role({"app_metadata": {"role": "admin"}}) is None


# ---------------------------------------------------------------------------
# decode_token
# ---------------------------------------------------------------------------


def test_decode_token_accepts_valid_signature(key_pair: tuple[bytes, dict]) -> None:
    private_pem, jwks = key_pair
    claims = decode_token(_make_token(private_pem), jwks, ISSUER)
    assert claims["sub"] == "user-123"


def test_decode_token_rejects_wrong_signature(key_pair: tuple[bytes, dict]) -> None:
    _, jwks = key_pair
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_pem = other_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    with pytest.raises(AuthError):
        decode_token(_make_token(other_pem), jwks, ISSUER)


def test_decode_token_rejects_expired(key_pair: tuple[bytes, dict]) -> None:
    private_pem, jwks = key_pair
    expired = _make_token(private_pem, exp=int(time.time()) - 60)
    with pytest.raises(AuthError, match="expired"):
        decode_token(expired, jwks, ISSUER)


def test_decode_token_rejects_wrong_issuer(key_pair: tuple[bytes, dict]) -> None:
    private_pem, jwks = key_pair
    token = _make_token(private_pem, iss="https://evil.example.com/auth/v1")
    with pytest.raises(AuthError):
        decode_token(token, jwks, ISSUER)


def test_decode_token_rejects_unknown_key_id(key_pair: tuple[bytes, dict]) -> None:
    private_pem, jwks = key_pair
    token = pyjwt.encode(
        {
            "sub": "user-123",
            "aud": "authenticated",
            "iss": ISSUER,
            "exp": int(time.time()) + 300,
        },
        private_pem,
        algorithm="RS256",
        headers={"kid": "unknown-key"},
    )
    with pytest.raises(AuthError, match="not recognized"):
        decode_token(token, jwks, ISSUER)


# ---------------------------------------------------------------------------
# HTTP-level guards
# ---------------------------------------------------------------------------


def test_request_without_token_is_unauthorized(client: TestClient) -> None:
    response = client.get("/me")
    assert response.status_code == 401


def test_valid_patient_token_is_accepted(client: TestClient, key_pair: tuple[bytes, dict]) -> None:
    private_pem, _ = key_pair
    response = client.get("/me", headers={"Authorization": f"Bearer {_make_token(private_pem)}"})
    assert response.status_code == 200
    assert response.json() == {"user_id": "user-123", "role": "patient"}


def test_garbage_token_is_unauthorized(client: TestClient) -> None:
    response = client.get("/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401


def test_patient_passes_role_gate(client: TestClient, key_pair: tuple[bytes, dict]) -> None:
    private_pem, _ = key_pair
    response = client.get(
        "/patient-only", headers={"Authorization": f"Bearer {_make_token(private_pem)}"}
    )
    assert response.status_code == 200


def test_psychologist_is_forbidden_on_patient_route(
    client: TestClient, key_pair: tuple[bytes, dict]
) -> None:
    private_pem, _ = key_pair
    token = _make_token(private_pem, app_metadata={"role": "psychologist"})
    response = client.get("/patient-only", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


def test_token_without_app_role_is_forbidden(
    client: TestClient, key_pair: tuple[bytes, dict]
) -> None:
    private_pem, _ = key_pair
    token = _make_token(private_pem, app_metadata={})
    response = client.get("/patient-only", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


def test_user_metadata_role_cannot_pass_role_gate(
    client: TestClient, key_pair: tuple[bytes, dict]
) -> None:
    # Regression: a client-writable user_metadata.role must never grant access.
    private_pem, _ = key_pair
    token = _make_token(private_pem, app_metadata={}, user_metadata={"role": "patient"})
    response = client.get("/patient-only", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403

"""Supabase JWT verification — no hand-rolled login.

Flow:
1. Client sends `Authorization: Bearer <supabase-access-token>`.
2. We verify the token's signature against the Supabase project's JWKS
   (RS256 or ES256, depending on the project's signing key) and check
   `iss` / `aud` / `exp`.
3. We extract the user id (`sub`) and the app role (`patient` | `psychologist`).

The role claim is used for endpoint-level role checks. The `profiles` table
remains the authoritative source for authorization decisions that touch data
(RLS enforces it at the database level).
"""

import json
import logging
import time
from dataclasses import dataclass
from typing import Annotated, Callable, Literal

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

logger = logging.getLogger(__name__)

Role = Literal["patient", "psychologist"]
APP_ROLES: tuple[str, ...] = ("patient", "psychologist")

# Supabase hosted projects commonly use RS256; newer local CLI versions sign
# with ES256. Both are asymmetric, so verification always uses the public JWKS.
SUPPORTED_ALGORITHMS: dict[str, str] = {"RS256": "RSA", "ES256": "EC"}

JWKS_CACHE_TTL_SECONDS = 3600

_bearer_scheme = HTTPBearer(auto_error=False)


class AuthError(Exception):
    """Raised when a token cannot be verified or lacks required claims."""


# ---------------------------------------------------------------------------
# JWKS fetching (monkeypatchable in tests)
# ---------------------------------------------------------------------------

_jwks_cache: dict | None = None
_jwks_fetched_at: float = 0.0


async def fetch_jwks(url: str) -> dict:
    """Fetch the JSON Web Key Set from Supabase."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()


async def get_jwks() -> dict:
    """Return the JWKS, refreshing at most once per hour."""
    global _jwks_cache, _jwks_fetched_at

    if _jwks_cache is not None and (time.monotonic() - _jwks_fetched_at) < JWKS_CACHE_TTL_SECONDS:
        return _jwks_cache

    settings = get_settings()
    try:
        jwks = await fetch_jwks(settings.jwks_url)
    except httpx.HTTPError as exc:
        raise AuthError(f"Could not fetch signing keys: {exc}") from exc

    _jwks_cache = jwks
    _jwks_fetched_at = time.monotonic()
    return jwks


def reset_jwks_cache() -> None:
    """Clear the cached JWKS (used by tests)."""
    global _jwks_cache, _jwks_fetched_at
    _jwks_cache = None
    _jwks_fetched_at = 0.0


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------


def load_public_key(key: dict, algorithm: str) -> object:
    """Build a verification key from a JWKS entry for an allowed algorithm."""
    expected_kty = SUPPORTED_ALGORITHMS[algorithm]
    if key.get("kty") != expected_kty:
        raise AuthError("Signing key type does not match token algorithm")
    if key.get("alg") and key["alg"] != algorithm:
        raise AuthError("Signing key algorithm does not match token")
    if key.get("use") and key["use"] != "sig":
        raise AuthError("Signing key cannot be used for signatures")

    try:
        if algorithm == "RS256":
            return jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key))
        return jwt.algorithms.ECAlgorithm.from_jwk(json.dumps(key))
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        raise AuthError("Could not load signing key") from exc


def decode_token(token: str, jwks: dict, issuer: str) -> dict:
    """Verify a Supabase access token and return its claims.

    Raises AuthError on any verification failure.
    """
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise AuthError("Malformed token") from exc

    algorithm = header.get("alg")
    if algorithm not in SUPPORTED_ALGORITHMS:
        raise AuthError(f"Unsupported token algorithm: {algorithm}")

    kid = header.get("kid")
    key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if key is None:
        raise AuthError("Token signing key not recognized")

    public_key = load_public_key(key, algorithm)

    try:
        return jwt.decode(
            token,
            public_key,
            algorithms=[algorithm],
            audience="authenticated",
            issuer=issuer,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Token has expired") from exc
    except jwt.PyJWTError as exc:
        raise AuthError(f"Invalid token: {exc}") from exc


def extract_role(claims: dict) -> Role | None:
    """Read the app role from token claims — **`app_metadata` ONLY**.

    `user_metadata` is client-writable and is deliberately ignored: a user
    could otherwise edit their own metadata to claim the psychologist role.
    Supabase's built-in top-level `role` claim is always "authenticated".
    The psychologist role is assigned only server-side at signup (see
    `POST /auth/psychologist-signup`), never from client-writable metadata.
    """
    app_metadata = claims.get("app_metadata") or {}
    candidate = app_metadata.get("role")
    if candidate in APP_ROLES:
        return candidate  # type: ignore[return-value]
    return None


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CurrentUser:
    user_id: str
    role: Role | None
    claims: dict


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> CurrentUser:
    """Dependency: require a valid Supabase JWT and return the caller."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = get_settings()
    if not settings.supabase_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth is not configured (SUPABASE_URL missing)",
        )

    try:
        jwks = await get_jwks()
        claims = decode_token(credentials.credentials, jwks, settings.token_issuer)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    return CurrentUser(user_id=claims["sub"], role=extract_role(claims), claims=claims)


async def get_access_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> str:
    """Return the raw JWT so routers can reuse it for RLS-scoped Supabase calls.

    This dependency does not verify the token by itself; router endpoints that
    use it also depend on `get_current_user` / `require_role`, so verification
    always happens first.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


def require_role(*roles: Role) -> Callable[..., CurrentUser]:
    """Dependency factory: require a valid JWT *and* one of the given roles."""

    async def dependency(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role",
            )
        return user

    return dependency

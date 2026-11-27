"""Thin client for the Supabase Auth Admin API (service role key only).

The service role key never leaves the server: it is read from the
environment, attached to outbound admin requests, and never returned in a
response body or written to logs.
"""

from __future__ import annotations

import httpx

from app.core.config import Settings

ADMIN_TIMEOUT_SECONDS = 15.0


class AdminApiError(Exception):
    """Raised when the Supabase Admin API call does not succeed."""

    def __init__(self, status_code: int, message: str = "") -> None:
        self.status_code = status_code
        super().__init__(message or f"admin api error {status_code}")


async def admin_create_user(
    settings: Settings,
    *,
    email: str,
    password: str,
    app_metadata: dict,
    user_metadata: dict,
) -> dict:
    """POST /auth/v1/admin/users — create a user server-side.

    ``app_metadata`` (which carries the role) is only ever built here; the
    request schema has no role field, so clients cannot influence it.
    ``email_confirm=True`` lets the account log in immediately — the
    app-level gate for psychologists is ``psychologist_profiles.verified``,
    not email confirmation.
    """
    if not settings.supabase_service_role_key:
        raise AdminApiError(503, "service role key not configured")

    url = f"{settings.supabase_url}/auth/v1/admin/users"
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    body = {
        "email": email,
        "password": password,
        "email_confirm": True,
        "app_metadata": app_metadata,
        "user_metadata": user_metadata,
    }

    async with httpx.AsyncClient(timeout=ADMIN_TIMEOUT_SECONDS) as client:
        response = await client.post(url, json=body, headers=headers)

    if 200 <= response.status_code < 300:
        try:
            return response.json()
        except ValueError as exc:
            raise AdminApiError(502, "unexpected admin api response") from exc

    detail = ""
    try:
        detail = str(response.json().get("msg", ""))
    except (ValueError, AttributeError):
        pass

    lowered = detail.lower()
    if "already registered" in lowered or ("already" in lowered and "register" in lowered):
        raise AdminApiError(409, detail)

    raise AdminApiError(502, f"admin api returned {response.status_code}")

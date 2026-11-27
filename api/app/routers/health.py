"""Readiness probe — no auth required, no connection details exposed.

A short service-role REST call confirms the database is reachable. Response
bodies and logs contain only generic status labels: never URLs, keys, upstream
errors or exception text.
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Response

from app.core.config import Settings, get_settings

router = APIRouter(tags=["health"])

HEALTH_TIMEOUT_SECONDS = 3.0
OK_BODY = {"status": "ok", "service": "mindcare-api"}
DEGRADED_BODY = {"status": "degraded", "service": "mindcare-api"}


async def _db_reachable(settings: Settings) -> bool:
    """Return True only when Supabase REST answers with the configured service role."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return False

    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Accept": "application/json",
    }
    url = f"{settings.supabase_url}/rest/v1/profiles"
    try:
        async with httpx.AsyncClient(timeout=HEALTH_TIMEOUT_SECONDS) as client:
            response = await client.get(
                url, headers=headers, params={"select": "id", "limit": 1}
            )
    except httpx.HTTPError:
        return False
    return response.status_code < 400


@router.get("/health")
async def health(response: Response) -> dict[str, str]:
    if await _db_reachable(get_settings()):
        return OK_BODY
    response.status_code = 503
    return DEGRADED_BODY

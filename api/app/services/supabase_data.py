"""Thin Supabase REST/RPC client.

RLS-scoped calls attach the **user's JWT** as `Authorization` (the service role
key is only the gateway `apikey`). Service-role calls attach the service role
key as both. The service role is used for assistant-message inserts, risk-event
inserts and account deletion — the writes clients are deliberately not allowed
to perform. Nothing here logs message content or keys.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)
REST_TIMEOUT_SECONDS = 15.0


class SupabaseDataError(Exception):
    """A Supabase failure reduced to an HTTP status and generic detail."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _headers(settings: Settings, *, token: str | None, service: bool) -> dict[str, str]:
    if not settings.supabase_service_role_key:
        raise SupabaseDataError(503, "Supabase is not configured on this server.")
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if service:
        headers["Authorization"] = f"Bearer {settings.supabase_service_role_key}"
    elif token:
        headers["Authorization"] = f"Bearer {token}"
    else:
        raise SupabaseDataError(401, "Not authenticated")
    return headers


async def _request(
    settings: Settings,
    method: str,
    path: str,
    *,
    token: str | None = None,
    service: bool = False,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
) -> Any:
    headers = _headers(settings, token=token, service=service)
    if method in {"POST", "PATCH"}:
        headers["Prefer"] = "return=representation"

    url = f"{settings.supabase_url}{path}"
    try:
        async with httpx.AsyncClient(timeout=REST_TIMEOUT_SECONDS) as client:
            response = await client.request(
                method, url, headers=headers, params=params, json=json_body
            )
    except httpx.HTTPError as exc:
        logger.warning("supabase.%s transport_error path=%s", method, path.split("?")[0])
        raise SupabaseDataError(502, "Could not reach the data service.") from exc

    if response.status_code >= 400:
        status = {
            401: 401,
            403: 403,
            404: 404,
        }.get(response.status_code, 502)
        if status == 401:
            status = 403
        logger.warning(
            "supabase.%s upstream_error path=%s status=%s",
            method,
            path.split("?")[0],
            response.status_code,
        )
        raise SupabaseDataError(status, "The data service rejected this request.")

    if response.status_code == 204 or not response.content:
        return None
    try:
        return response.json()
    except ValueError as exc:
        raise SupabaseDataError(502, "Unexpected response from the data service.") from exc


def _first_row(rows: Any) -> dict[str, Any] | None:
    if isinstance(rows, list):
        return rows[0] if rows else None
    if isinstance(rows, dict):
        return rows
    return None


# ---------------------------------------------------------------------------
# Patient chat (RLS-scoped with the user's JWT)
# ---------------------------------------------------------------------------


async def get_profile_region(settings: Settings, token: str, patient_id: str) -> str | None:
    rows = await _request(
        settings,
        "GET",
        "/rest/v1/profiles",
        token=token,
        params={"id": f"eq.{patient_id}", "select": "region", "limit": "1"},
    )
    row = _first_row(rows)
    return (row or {}).get("region")


async def create_conversation(settings: Settings, token: str, patient_id: str) -> str:
    rows = await _request(
        settings,
        "POST",
        "/rest/v1/conversations",
        token=token,
        json_body={"patient_id": patient_id},
    )
    row = _first_row(rows)
    if not row or not row.get("id"):
        raise SupabaseDataError(502, "Could not create the conversation.")
    return str(row["id"])


async def verify_conversation_owner(
    settings: Settings, token: str, conversation_id: str, patient_id: str
) -> bool:
    rows = await _request(
        settings,
        "GET",
        "/rest/v1/conversations",
        token=token,
        params={
            "id": f"eq.{conversation_id}",
            "patient_id": f"eq.{patient_id}",
            "select": "id",
            "limit": "1",
        },
    )
    return _first_row(rows) is not None


async def insert_user_message(
    settings: Settings, token: str, conversation_id: str, patient_id: str, content: str
) -> str:
    rows = await _request(
        settings,
        "POST",
        "/rest/v1/messages",
        token=token,
        json_body={
            "conversation_id": conversation_id,
            "patient_id": patient_id,
            "sender": "user",
            "content": content,
        },
    )
    row = _first_row(rows)
    if not row or not row.get("id"):
        raise SupabaseDataError(502, "Could not store the message.")
    return str(row["id"])


async def list_recent_messages(
    settings: Settings, token: str, conversation_id: str, limit: int = 10
) -> list[dict[str, Any]]:
    rows = await _request(
        settings,
        "GET",
        "/rest/v1/messages",
        token=token,
        params={
            "conversation_id": f"eq.{conversation_id}",
            "select": "sender,content,created_at",
            "order": "created_at.desc",
            "limit": str(limit),
        },
    )
    return list(reversed(rows)) if isinstance(rows, list) else []


async def insert_assistant_message(
    settings: Settings,
    *,
    conversation_id: str,
    patient_id: str,
    content: str,
    prompt_version: str,
    model: str,
) -> str:
    rows = await _request(
        settings,
        "POST",
        "/rest/v1/messages",
        service=True,
        json_body={
            "conversation_id": conversation_id,
            "patient_id": patient_id,
            "sender": "assistant",
            "content": content,
            "prompt_version": prompt_version,
            "model": model,
        },
    )
    row = _first_row(rows)
    if not row or not row.get("id"):
        raise SupabaseDataError(502, "Could not store the reply.")
    return str(row["id"])


async def insert_risk_event(
    settings: Settings,
    *,
    patient_id: str,
    message_id: str,
    level: str,
    reason: str,
) -> str:
    # `reason` is a short category label from the rules/LLM enum, never the
    # user's message text.
    rows = await _request(
        settings,
        "POST",
        "/rest/v1/risk_events",
        service=True,
        json_body={
            "patient_id": patient_id,
            "message_id": message_id,
            "level": level,
            "reason": reason,
        },
    )
    row = _first_row(rows)
    return str(row["id"]) if row and row.get("id") else ""


async def list_conversations(
    settings: Settings, token: str, patient_id: str
) -> list[dict[str, Any]]:
    rows = await _request(
        settings,
        "GET",
        "/rest/v1/conversations",
        token=token,
        params={
            "patient_id": f"eq.{patient_id}",
            "select": "id,created_at",
            "order": "created_at.desc",
        },
    )
    return rows if isinstance(rows, list) else []


async def list_messages(
    settings: Settings, token: str, conversation_id: str
) -> list[dict[str, Any]]:
    rows = await _request(
        settings,
        "GET",
        "/rest/v1/messages",
        token=token,
        params={
            "conversation_id": f"eq.{conversation_id}",
            "select": "id,sender,content,created_at,prompt_version,model",
            "order": "created_at.asc",
        },
    )
    return rows if isinstance(rows, list) else []


# ---------------------------------------------------------------------------
# RPCs and psychologist reads
# ---------------------------------------------------------------------------


async def call_rpc(
    settings: Settings, token: str, name: str, params: dict[str, Any]
) -> Any:
    """Call a SECURITY DEFINER RPC with the caller's JWT for auth.uid()."""
    if not re_rpc_name(name):
        raise SupabaseDataError(502, "Invalid RPC.")
    return await _request(
        settings, "POST", f"/rest/v1/rpc/{name}", token=token, json_body=params
    )


def re_rpc_name(name: str) -> bool:
    """Allowlist so a path can never be built from untrusted input."""
    return name in {
        "shared_checkins",
        "record_patient_access",
        "delete_my_data",
        "link_scope",
    }


async def get_psychologist_verified(
    settings: Settings, token: str, psychologist_id: str
) -> bool:
    rows = await _request(
        settings,
        "GET",
        "/rest/v1/psychologist_profiles",
        token=token,
        params={
            "user_id": f"eq.{psychologist_id}",
            "select": "verified",
            "limit": "1",
        },
    )
    row = _first_row(rows)
    return bool(row and row.get("verified"))


async def get_link_scope(settings: Settings, token: str, patient_id: str) -> str | None:
    result = await call_rpc(settings, token, "link_scope", {"p_patient": patient_id})
    return result if isinstance(result, str) else None


async def list_linked_patients(
    settings: Settings, token: str, psychologist_id: str
) -> list[dict[str, Any]]:
    links = await _request(
        settings,
        "GET",
        "/rest/v1/care_links",
        token=token,
        params={
            "psychologist_id": f"eq.{psychologist_id}",
            "status": "eq.active",
            "select": "patient_id,share_scope",
        },
    )
    if not isinstance(links, list) or not links:
        return []

    scopes = {str(row["patient_id"]): row.get("share_scope") for row in links}
    profiles = await _request(
        settings,
        "GET",
        "/rest/v1/profiles",
        token=token,
        params={
            "id": f"in.({','.join(scopes)})",
            "select": "id,display_name,region",
        },
    )
    result: list[dict[str, Any]] = []
    for profile in profiles if isinstance(profiles, list) else []:
        patient_id = str(profile.get("id", ""))
        if patient_id in scopes:
            result.append(
                {
                    "id": patient_id,
                    "display_name": profile.get("display_name"),
                    "region": profile.get("region"),
                    "share_scope": scopes[patient_id],
                }
            )
    return result


async def list_risk_events(settings: Settings, token: str) -> list[dict[str, Any]]:
    rows = await _request(
        settings,
        "GET",
        "/rest/v1/risk_events",
        token=token,
        params={
            "select": "id,patient_id,message_id,level,reason,status,created_at,reviewed_by,reviewed_at",
            "order": "created_at.desc",
        },
    )
    return rows if isinstance(rows, list) else []


async def get_message_contents(
    settings: Settings, token: str, message_ids: list[str]
) -> dict[str, str]:
    if not message_ids:
        return {}
    rows = await _request(
        settings,
        "GET",
        "/rest/v1/messages",
        token=token,
        params={"id": f"in.({','.join(message_ids)})", "select": "id,content"},
    )
    return {
        str(row["id"]): str(row.get("content", ""))
        for row in rows
        if isinstance(row, dict) and row.get("id")
    } if isinstance(rows, list) else {}


async def update_risk_event(
    settings: Settings, token: str, event_id: str, status: str
) -> dict[str, Any]:
    rows = await _request(
        settings,
        "PATCH",
        "/rest/v1/risk_events",
        token=token,
        params={"id": f"eq.{event_id}"},
        json_body={"status": status},
    )
    row = _first_row(rows)
    if not row:
        raise SupabaseDataError(404, "Risk event not found.")
    return row


async def call_delete_my_data(settings: Settings, token: str) -> dict[str, Any]:
    result = await call_rpc(settings, token, "delete_my_data", {})
    return result if isinstance(result, dict) else {}


async def delete_auth_user(settings: Settings, user_id: str) -> None:
    if not settings.supabase_service_role_key:
        raise SupabaseDataError(503, "Account deletion is not configured on this server.")
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=REST_TIMEOUT_SECONDS) as client:
            response = await client.delete(
                f"{settings.supabase_url}/auth/v1/admin/users/{user_id}", headers=headers
            )
    except httpx.HTTPError as exc:
        logger.warning("supabase.admin_delete transport_error")
        raise SupabaseDataError(502, "Could not delete the account.") from exc

    if response.status_code >= 400:
        logger.warning("supabase.admin_delete upstream_error status=%s", response.status_code)
        raise SupabaseDataError(502, "Could not delete the account.")

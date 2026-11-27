"""Psychologist endpoints.

All reads use the caller's JWT so RLS applies. Verification is checked
explicitly (RLS alone would return an empty list instead of 403). Every patient
data read appends an audit_log row through record_patient_access().
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import CurrentUser, get_access_token, require_role
from app.core.config import get_settings
from app.schemas.psychologist import (
    PatientListResponse,
    RiskEventListResponse,
    RiskEventResponse,
    RiskEventReviewRequest,
    TrendsResponse,
)
from app.services import supabase_data
from app.services.supabase_data import SupabaseDataError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/psychologist", tags=["psychologist"])

psychologist_only = require_role("psychologist")


def _data_error(exc: SupabaseDataError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


async def _require_verified(settings, token: str, user: CurrentUser) -> None:
    try:
        verified = await supabase_data.get_psychologist_verified(
            settings, token, user.user_id
        )
    except SupabaseDataError as exc:
        raise _data_error(exc) from exc
    if not verified:
        raise HTTPException(
            status_code=403,
            detail="Psychologist account is not verified.",
        )


async def _audit_access(
    settings, token: str, patient_ids: set[str], action: str
) -> None:
    for patient_id in patient_ids:
        try:
            await supabase_data.call_rpc(
                settings,
                token,
                "record_patient_access",
                {"p_patient": patient_id, "p_action": action},
            )
        except SupabaseDataError as exc:
            raise _data_error(exc) from exc
    if patient_ids:
        logger.info(
            "psychologist.audit action=%s patients=%s count=%s",
            action,
            ",".join(sorted(patient_ids)),
            len(patient_ids),
        )


@router.get("/patients", response_model=PatientListResponse)
async def list_patients(
    user: CurrentUser = Depends(psychologist_only),
    token: str = Depends(get_access_token),
) -> PatientListResponse:
    settings = get_settings()
    await _require_verified(settings, token, user)
    try:
        patients = await supabase_data.list_linked_patients(
            settings, token, user.user_id
        )
    except SupabaseDataError as exc:
        raise _data_error(exc) from exc

    await _audit_access(
        settings, token, {str(row["id"]) for row in patients}, "view_patient_list"
    )
    return PatientListResponse(patients=patients)


@router.get("/patients/{patient_id}/trends", response_model=TrendsResponse)
async def get_trends(
    patient_id: UUID,
    user: CurrentUser = Depends(psychologist_only),
    token: str = Depends(get_access_token),
) -> TrendsResponse:
    settings = get_settings()
    await _require_verified(settings, token, user)
    pid = str(patient_id)
    try:
        scope = await supabase_data.get_link_scope(settings, token, pid)
        if scope not in {"summary_only", "full"}:
            raise HTTPException(status_code=404, detail="Patient not found.")
        rows = await supabase_data.call_rpc(
            settings, token, "shared_checkins", {"p_patient": pid}
        )
    except SupabaseDataError as exc:
        raise _data_error(exc) from exc

    await _audit_access(settings, token, {pid}, "view_trends")
    checkins = rows if isinstance(rows, list) else []
    return TrendsResponse(patient_id=patient_id, share_scope=scope, checkins=checkins)


@router.get("/risk-events", response_model=RiskEventListResponse)
async def list_risk_events(
    user: CurrentUser = Depends(psychologist_only),
    token: str = Depends(get_access_token),
) -> RiskEventListResponse:
    settings = get_settings()
    await _require_verified(settings, token, user)
    try:
        rows = await supabase_data.list_risk_events(settings, token)
    except SupabaseDataError as exc:
        raise _data_error(exc) from exc

    patient_ids = {str(row["patient_id"]) for row in rows if row.get("patient_id")}
    await _audit_access(settings, token, patient_ids, "view_risk_events")

    scopes: dict[str, str | None] = {}
    for pid in patient_ids:
        scopes[pid] = await supabase_data.get_link_scope(settings, token, pid)

    full_message_ids = [
        str(row["message_id"])
        for row in rows
        if row.get("message_id")
        and scopes.get(str(row["patient_id"])) == "full"
    ]
    contents = await supabase_data.get_message_contents(settings, token, full_message_ids)

    events: list[RiskEventResponse] = []
    for row in rows:
        message_id = row.get("message_id")
        content = (
            contents.get(str(message_id))
            if message_id and scopes.get(str(row["patient_id"])) == "full"
            else None
        )
        events.append(RiskEventResponse(**row, content=content))
    return RiskEventListResponse(events=events)


@router.patch("/risk-events/{event_id}", response_model=RiskEventResponse)
async def review_risk_event(
    event_id: UUID,
    payload: RiskEventReviewRequest,
    user: CurrentUser = Depends(psychologist_only),
    token: str = Depends(get_access_token),
) -> RiskEventResponse:
    settings = get_settings()
    await _require_verified(settings, token, user)
    try:
        row = await supabase_data.update_risk_event(
            settings, token, str(event_id), payload.status
        )
    except SupabaseDataError as exc:
        raise _data_error(exc) from exc

    logger.info(
        "psychologist.risk_event_review event_id=%s status=%s", event_id, payload.status
    )
    return RiskEventResponse(**row, content=None)

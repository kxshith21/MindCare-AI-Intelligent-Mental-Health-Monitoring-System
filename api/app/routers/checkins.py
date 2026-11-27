"""Patient check-in endpoints.

PHQ-9 item 9 is an independent, deterministic second trigger path: a positive
answer creates a service-role risk event and returns region resources even if
the chat API was never called. The DB trigger remains the only source of
computed scores.
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import CurrentUser, get_access_token, require_role
from app.core.config import get_settings
from app.schemas.checkins import CheckinCreateRequest, CheckinListResponse, CheckinResponse
from app.schemas.chat import CrisisResourceResponse
from app.services import supabase_data
from app.services.crisis_resources import get_crisis_resources
from app.services.supabase_data import SupabaseDataError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/checkins", tags=["checkins"])

patient_only = require_role("patient")


def _data_error(exc: SupabaseDataError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.post("", response_model=CheckinResponse)
async def create_checkin(
    payload: CheckinCreateRequest,
    user: CurrentUser = Depends(patient_only),
    token: str = Depends(get_access_token),
) -> CheckinResponse:
    settings = get_settings()
    try:
        row = await supabase_data.insert_checkin(
            settings,
            token,
            patient_id=user.user_id,
            mood=payload.mood,
            note=payload.note,
            phq9_answers=payload.phq9_answers,
            gad7_answers=payload.gad7_answers,
        )
    except SupabaseDataError as exc:
        raise _data_error(exc) from exc

    item9 = payload.phq9_answers[8] if payload.phq9_answers else 0
    reason: str | None = None
    show_resources = item9 > 0
    resources = []
    if show_resources:
        reason = "self_harm_ideation"
        level = "high" if item9 == 3 else "elevated"
        try:
            region = await supabase_data.get_profile_region(settings, token, user.user_id)
        except SupabaseDataError:
            region = None
        resources = get_crisis_resources(region)
        try:
            await supabase_data.insert_risk_event(
                settings,
                patient_id=user.user_id,
                level=level,
                reason=reason,
            )
        except SupabaseDataError:
            # Resources still render — safety does not depend on the queue write.
            logger.warning("checkin.risk_event_store_failed level=%s", level)

    return CheckinResponse(
        **row,
        show_crisis_resources=show_resources,
        crisis_resources=[CrisisResourceResponse(**item) for item in resources],
        reason=reason,  # type: ignore[arg-type]
    )


@router.get("", response_model=CheckinListResponse)
async def list_checkins(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    user: CurrentUser = Depends(patient_only),
    token: str = Depends(get_access_token),
) -> CheckinListResponse:
    if from_ is not None and to is not None and from_ > to:
        raise HTTPException(status_code=400, detail="'from' must not be after 'to'.")
    settings = get_settings()
    try:
        rows = await supabase_data.list_checkins(
            settings, token, user.user_id, from_dt=from_, to_dt=to
        )
    except SupabaseDataError as exc:
        raise _data_error(exc) from exc
    return CheckinListResponse(
        checkins=[CheckinResponse(**row, crisis_resources=[]) for row in rows]
    )

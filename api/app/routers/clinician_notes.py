"""Psychologist-only private notes for actively linked patients."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import CurrentUser, get_access_token, require_role
from app.core.config import get_settings
from app.schemas.clinician_notes import (
    ClinicianNoteCreateRequest,
    ClinicianNoteListResponse,
    ClinicianNoteResponse,
)
from app.services import supabase_data
from app.services.supabase_data import SupabaseDataError

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/psychologist/patients/{patient_id}/notes", tags=["clinician-notes"]
)

psychologist_only = require_role("psychologist")


def _data_error(exc: SupabaseDataError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


async def _require_link(
    settings, token: str, user: CurrentUser, patient_id: str
) -> None:
    try:
        verified = await supabase_data.get_psychologist_verified(
            settings, token, user.user_id
        )
    except SupabaseDataError as exc:
        raise _data_error(exc) from exc
    if not verified:
        raise HTTPException(status_code=403, detail="Psychologist account is not verified.")

    try:
        scope = await supabase_data.get_link_scope(settings, token, patient_id)
    except SupabaseDataError as exc:
        raise _data_error(exc) from exc
    if scope is None:
        raise HTTPException(status_code=404, detail="Patient not found.")


async def _audit(settings, token: str, patient_id: str, action: str) -> None:
    try:
        await supabase_data.call_rpc(
            settings,
            token,
            "record_patient_access",
            {"p_patient": patient_id, "p_action": action},
        )
    except SupabaseDataError as exc:
        raise _data_error(exc) from exc


@router.get("", response_model=ClinicianNoteListResponse)
async def list_notes(
    patient_id: UUID,
    user: CurrentUser = Depends(psychologist_only),
    token: str = Depends(get_access_token),
) -> ClinicianNoteListResponse:
    settings = get_settings()
    pid = str(patient_id)
    await _require_link(settings, token, user, pid)
    await _audit(settings, token, pid, "view_clinician_notes")
    try:
        rows = await supabase_data.list_clinician_notes(settings, token, pid)
    except SupabaseDataError as exc:
        raise _data_error(exc) from exc
    return ClinicianNoteListResponse(notes=[ClinicianNoteResponse(**row) for row in rows])


@router.post("", response_model=ClinicianNoteResponse)
async def add_note(
    patient_id: UUID,
    payload: ClinicianNoteCreateRequest,
    user: CurrentUser = Depends(psychologist_only),
    token: str = Depends(get_access_token),
) -> ClinicianNoteResponse:
    settings = get_settings()
    pid = str(patient_id)
    await _require_link(settings, token, user, pid)
    try:
        row = await supabase_data.insert_clinician_note(
            settings,
            token,
            patient_id=pid,
            psychologist_id=user.user_id,
            note=payload.note,
        )
    except SupabaseDataError as exc:
        raise _data_error(exc) from exc
    logger.info("clinician_note.add patient_id=%s", pid)
    return ClinicianNoteResponse(**row)

"""Patient account deletion.

First deletes patient data via the `delete_my_data()` RPC with the caller's
JWT (RLS applies), then deletes the auth user with the service role. No message
content is logged. This closes the Phase 2 account-deletion TODO.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import CurrentUser, get_access_token, require_role
from app.core.config import get_settings
from app.schemas.account import DeleteAccountRequest, DeleteAccountResponse
from app.services import supabase_data
from app.services.supabase_data import SupabaseDataError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/account", tags=["account"])

patient_only = require_role("patient")


@router.delete("", response_model=DeleteAccountResponse)
async def delete_account(
    payload: DeleteAccountRequest,
    user: CurrentUser = Depends(patient_only),
    token: str = Depends(get_access_token),
) -> DeleteAccountResponse:
    settings = get_settings()
    try:
        deleted = await supabase_data.call_delete_my_data(settings, token)
        await supabase_data.delete_auth_user(settings, user.user_id)
    except SupabaseDataError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    logger.info("account.deleted user_id=%s", user.user_id)
    return DeleteAccountResponse(
        status="deleted",
        data_deleted=deleted,
        auth_user_deleted=True,
    )

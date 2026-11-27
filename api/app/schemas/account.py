"""Request/response models for account deletion."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class DeleteAccountRequest(BaseModel):
    confirm: Literal["DELETE"] = Field(
        description="Must be exactly 'DELETE' to confirm permanent deletion."
    )


class DeleteAccountResponse(BaseModel):
    status: str
    data_deleted: dict
    auth_user_deleted: bool

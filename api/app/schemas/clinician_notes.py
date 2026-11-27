"""Private clinician notes for linked patients."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ClinicianNoteCreateRequest(BaseModel):
    note: str = Field(min_length=1, max_length=8000)

    @field_validator("note")
    @classmethod
    def non_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("note must not be blank")
        return value


class ClinicianNoteResponse(BaseModel):
    id: UUID
    patient_id: UUID
    psychologist_id: UUID
    note: str
    created_at: datetime


class ClinicianNoteListResponse(BaseModel):
    notes: list[ClinicianNoteResponse]

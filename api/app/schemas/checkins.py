"""Request/response models for patient check-ins.

Scores are deliberately absent from the request model: the database trigger is
the only place that computes PHQ-9/GAD-7 totals. Extra client fields are
ignored by Pydantic's default model config.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.chat import CrisisResourceResponse


class CheckinCreateRequest(BaseModel):
    mood: int = Field(ge=1, le=5)
    note: str | None = Field(default=None, max_length=4000)
    phq9_answers: list[int] | None = None
    gad7_answers: list[int] | None = None

    @field_validator("phq9_answers")
    @classmethod
    def validate_phq9(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        if len(value) != 9:
            raise ValueError("phq9_answers must contain exactly 9 items")
        if any(item < 0 or item > 3 for item in value):
            raise ValueError("phq9_answers values must be 0-3")
        return value

    @field_validator("gad7_answers")
    @classmethod
    def validate_gad7(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        if len(value) != 7:
            raise ValueError("gad7_answers must contain exactly 7 items")
        if any(item < 0 or item > 3 for item in value):
            raise ValueError("gad7_answers values must be 0-3")
        return value


class CheckinResponse(BaseModel):
    id: UUID
    patient_id: UUID
    mood: int
    note: str | None = None
    phq9_score: int | None = None
    gad7_score: int | None = None
    phq9_answers: list[int] | None = None
    gad7_answers: list[int] | None = None
    created_at: datetime
    show_crisis_resources: bool = False
    crisis_resources: list[CrisisResourceResponse] = Field(default_factory=list)
    # Category label only, never message text.
    reason: Literal["self_harm_ideation"] | None = None


class CheckinListResponse(BaseModel):
    checkins: list[CheckinResponse]

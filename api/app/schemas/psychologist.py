"""Request/response models for the psychologist queue and trends."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.services.llm import RiskLevel

ReviewStatus = Literal["new", "acknowledged", "resolved"]


class LinkedPatient(BaseModel):
    id: UUID
    display_name: str | None = None
    region: str | None = None
    share_scope: Literal["summary_only", "full"]


class PatientListResponse(BaseModel):
    patients: list[LinkedPatient]


class TrendPoint(BaseModel):
    mood: int
    phq9_score: int
    gad7_score: int
    created_at: datetime
    note: str | None = None
    phq9_answers: list[int] | None = None
    gad7_answers: list[int] | None = None


class TrendsResponse(BaseModel):
    patient_id: UUID
    share_scope: Literal["summary_only", "full"]
    checkins: list[TrendPoint]


class RiskEventResponse(BaseModel):
    id: UUID
    patient_id: UUID
    message_id: UUID | None = None
    level: RiskLevel
    reason: str = Field(description="Short category label, never message text.")
    status: ReviewStatus
    created_at: datetime
    reviewed_by: UUID | None = None
    reviewed_at: datetime | None = None
    content: str | None = Field(
        default=None,
        description="Message text only when share_scope='full'; otherwise null.",
    )


class RiskEventListResponse(BaseModel):
    events: list[RiskEventResponse]


class RiskEventReviewRequest(BaseModel):
    status: Literal["acknowledged", "resolved"]

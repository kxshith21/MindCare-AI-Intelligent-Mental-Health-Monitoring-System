"""Request/response models for patient chat.

No field describes risk as a score or diagnosis. `risk_level` is a triage label
for a human reviewer.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.services.llm import Emotion, RiskLevel


class ChatMessageRequest(BaseModel):
    conversation_id: UUID | None = None
    content: str = Field(min_length=1, max_length=2000)


class CrisisResourceResponse(BaseModel):
    name: str
    contact: str
    detail: str
    last_verified: str


class ChatMessageResponse(BaseModel):
    conversation_id: UUID
    reply: str
    emotion: Emotion
    themes: list[str]
    risk_level: RiskLevel
    show_crisis_resources: bool
    crisis_resources: list[CrisisResourceResponse]


class ConversationSummary(BaseModel):
    id: UUID
    created_at: datetime


class ConversationListResponse(BaseModel):
    conversations: list[ConversationSummary]


class MessageResponse(BaseModel):
    id: UUID
    sender: Literal["user", "assistant"]
    content: str
    created_at: datetime
    prompt_version: str | None = None
    model: str | None = None


class MessageListResponse(BaseModel):
    conversation_id: UUID
    messages: list[MessageResponse]

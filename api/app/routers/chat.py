"""Patient chat endpoints.

Ordering is deliberate: store the user's message, gather context, run BOTH
signals, choose the higher level, store the assistant reply with prompt/model
metadata, then create a risk event when elevated/high. Any LLM failure still
returns a safe reply and crisis resources when the rules say so.
"""

from __future__ import annotations

import logging
import time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import CurrentUser, get_access_token, require_role
from app.core.config import get_settings
from app.schemas.chat import (
    ChatMessageRequest,
    ChatMessageResponse,
    ConversationListResponse,
    MessageListResponse,
)
from app.services import risk_rules, supabase_data
from app.services.crisis_resources import get_crisis_resources
from app.services.llm import (
    ChatAnalysis,
    RiskCategory,
    RiskLevel,
    analyze_chat,
    build_system_prompt,
    final_reply,
    get_llm_client,
)
from app.services.rate_limit import RateLimitExceeded, chat_message_limiter
from app.services.supabase_data import SupabaseDataError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])

patient_only = require_role("patient")


def _data_error(exc: SupabaseDataError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.post("/message", response_model=ChatMessageResponse)
async def post_message(
    payload: ChatMessageRequest,
    user: CurrentUser = Depends(patient_only),
    token: str = Depends(get_access_token),
) -> ChatMessageResponse:
    started = time.monotonic()
    settings = get_settings()

    try:
        chat_message_limiter.check(user.user_id)
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail="Too many messages. Please wait a moment before trying again.",
        ) from exc

    # Region lookup is best-effort: unknown/null always falls back to DEFAULT
    # crisis resources and must never block a reply.
    try:
        region = await supabase_data.get_profile_region(settings, token, user.user_id)
    except SupabaseDataError:
        region = None

    try:
        if payload.conversation_id:
            conversation_id = str(payload.conversation_id)
            if not await supabase_data.verify_conversation_owner(
                settings, token, conversation_id, user.user_id
            ):
                raise HTTPException(status_code=404, detail="Conversation not found.")
        else:
            conversation_id = await supabase_data.create_conversation(
                settings, token, user.user_id
            )

        user_message_id = await supabase_data.insert_user_message(
            settings, token, conversation_id, user.user_id, payload.content
        )
        recent = await supabase_data.list_recent_messages(settings, token, conversation_id)
    except SupabaseDataError as exc:
        raise _data_error(exc) from exc

    context = [
        {
            "role": "assistant" if row.get("sender") == "assistant" else "user",
            "content": str(row.get("content", "")),
        }
        for row in recent
        if row.get("content")
    ]
    user_texts = [
        str(row["content"])
        for row in recent
        if row.get("sender") == "user" and row.get("content")
    ]
    rules_result = risk_rules.evaluate_conversation(user_texts)

    schema = ChatAnalysis.model_json_schema()
    system = build_system_prompt(schema, settings.chat_prompt_version)
    outcome = await analyze_chat(
        get_llm_client(settings),
        system,
        context,
        schema,
        retries=settings.llm_max_retries,
    )

    analysis = outcome.analysis
    llm_level: RiskLevel | None = analysis.risk_level if analysis else None
    llm_category: RiskCategory | None = analysis.risk_category if analysis else None

    # Final risk = max(LLM, rules). A failed LLM contributes no signal.
    if llm_level is None:
        final_level = rules_result.level
        final_category: RiskCategory = rules_result.category
    else:
        final_level = risk_rules.max_level(llm_level, rules_result.level)
        # Prefer the rules category when it is at least as high: the rules
        # engine is independent and cannot be lowered by prompt injection.
        if rules_result.flagged and rules_result.level == final_level:
            final_category = rules_result.category
        else:
            final_category = (
                llm_category if llm_category and llm_category != "none" else "other"
            )

    if final_level == "low":
        final_category = "none"

    reply = final_reply(final_level, analysis.reply if analysis else None)

    assistant_message_id = ""
    try:
        assistant_message_id = await supabase_data.insert_assistant_message(
            settings,
            conversation_id=conversation_id,
            patient_id=user.user_id,
            content=reply,
            prompt_version=settings.chat_prompt_version,
            model=settings.llm_model,
        )
    except SupabaseDataError:
        logger.warning("chat.assistant_store_failed conversation_id=%s", conversation_id)

    if final_level != "low":
        try:
            await supabase_data.insert_risk_event(
                settings,
                patient_id=user.user_id,
                message_id=user_message_id,
                level=final_level,
                reason=final_category,
            )
        except SupabaseDataError:
            logger.warning(
                "chat.risk_event_store_failed conversation_id=%s level=%s",
                conversation_id,
                final_level,
            )

    show_resources = final_level != "low"
    resources = get_crisis_resources(region) if show_resources else []

    logger.info(
        "chat.message conversation_id=%s user_message_id=%s assistant_message_id=%s "
        "llm=%s rules=%s final=%s matched_rules=%s latency_ms=%s",
        conversation_id,
        user_message_id,
        assistant_message_id or "-",
        llm_level or outcome.error_category or "none",
        rules_result.level,
        final_level,
        ",".join(rules_result.matched_rules) or "-",
        int((time.monotonic() - started) * 1000),
    )

    return ChatMessageResponse(
        conversation_id=UUID(conversation_id),
        reply=reply,
        emotion=analysis.emotion if analysis else "neutral",
        themes=analysis.themes if analysis else [],
        risk_level=final_level,
        show_crisis_resources=show_resources,
        crisis_resources=resources,
    )


@router.get("/conversations", response_model=ConversationListResponse)
async def get_conversations(
    user: CurrentUser = Depends(patient_only),
    token: str = Depends(get_access_token),
) -> ConversationListResponse:
    settings = get_settings()
    try:
        rows = await supabase_data.list_conversations(settings, token, user.user_id)
    except SupabaseDataError as exc:
        raise _data_error(exc) from exc
    return ConversationListResponse(conversations=rows)


@router.get(
    "/conversations/{conversation_id}/messages", response_model=MessageListResponse
)
async def get_messages(
    conversation_id: UUID,
    user: CurrentUser = Depends(patient_only),
    token: str = Depends(get_access_token),
) -> MessageListResponse:
    settings = get_settings()
    cid = str(conversation_id)
    try:
        if not await supabase_data.verify_conversation_owner(
            settings, token, cid, user.user_id
        ):
            raise HTTPException(status_code=404, detail="Conversation not found.")
        rows = await supabase_data.list_messages(settings, token, cid)
    except SupabaseDataError as exc:
        raise _data_error(exc) from exc
    return MessageListResponse(conversation_id=conversation_id, messages=rows)


__all__ = ["router", "chat_message_limiter"]

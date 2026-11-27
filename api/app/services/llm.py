"""Provider-agnostic, fail-safe structured LLM calls.

The default provider is any OpenAI-compatible chat-completions endpoint. With
the shipped base URL this is Groq's OpenAI-compatible API; the key in
``LLM_API_KEY`` is a **Groq** key, not an OpenAI key.

No message content is ever logged. Failures are reduced to short category
labels so the chat router can still run the independent rules engine and return
a safe reply with crisis resources when needed.
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol

import httpx
from pydantic import BaseModel, Field, ValidationError, field_validator

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

Emotion = Literal["sadness", "anxiety", "anger", "fear", "joy", "neutral", "mixed"]
RiskLevel = Literal["low", "elevated", "high"]
RiskCategory = Literal[
    "none",
    "hopelessness",
    "self_harm_ideation",
    "plan_or_means",
    "harm_to_others",
    "acute_distress",
    "other",
]

PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts"
DEFAULT_SYSTEM_PROMPT_VERSION = "chat_system_v1"

_THEME_RE = re.compile(r"^[a-z0-9][a-z0-9_ -]{0,39}$")


class ChatAnalysis(BaseModel):
    """Validated structured output. Anything else is rejected."""

    reply: str = Field(min_length=1, max_length=1200)
    emotion: Emotion
    themes: list[str] = Field(default_factory=list, max_length=5)
    risk_level: RiskLevel
    risk_category: RiskCategory
    confidence: float = Field(ge=0.0, le=1.0)

    @field_validator("reply")
    @classmethod
    def reply_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("reply must not be blank")
        return value.strip()

    @field_validator("themes")
    @classmethod
    def themes_are_short_lowercase_labels(cls, values: list[str]) -> list[str]:
        for value in values:
            if not _THEME_RE.fullmatch(value):
                raise ValueError("themes must be short lowercase labels")
        return values


class LLMClientError(Exception):
    """An LLM failure reduced to a non-sensitive category label."""

    def __init__(self, category: str) -> None:
        self.category = category
        super().__init__(category)


class LLMClient(Protocol):
    """Provider-agnostic interface used by the chat router and tests."""

    async def complete_json(
        self, system: str, messages: list[dict[str, str]], schema: dict
    ) -> dict: ...


@dataclass(frozen=True)
class LLMOutcome:
    """Result of one analysed reply. ``analysis`` is None on any failure."""

    analysis: ChatAnalysis | None
    error_category: str | None = None

    @property
    def ok(self) -> bool:
        return self.analysis is not None


class OpenAICompatibleClient:
    """One real provider: Groq's OpenAI-compatible /chat/completions API."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str = "https://api.groq.com/openai/v1",
        timeout_seconds: float = 15.0,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._timeout = timeout_seconds

    async def complete_json(
        self, system: str, messages: list[dict[str, str]], schema: dict
    ) -> dict:
        if not self._api_key:
            raise LLMClientError("unconfigured")

        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                *[
                    {"role": item["role"], "content": item["content"]}
                    for item in messages
                ],
            ],
            # Groq supports JSON Object Mode on the GPT-OSS models. We still
            # validate locally with ChatAnalysis; this only helps the model.
            "response_format": {"type": "json_object"},
            "temperature": 0.4,
        }

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    self._url,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                )
                response.raise_for_status()
                body = response.json()
                content = body["choices"][0]["message"]["content"]
        except httpx.TimeoutException as exc:
            raise LLMClientError("timeout") from exc
        except httpx.HTTPStatusError as exc:
            raise LLMClientError(f"http_{exc.response.status_code}") from exc
        except httpx.HTTPError as exc:
            raise LLMClientError("transport") from exc
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise LLMClientError("invalid_response") from exc

        if not isinstance(content, str):
            raise LLMClientError("invalid_response")
        return _parse_json_object(content)


class FakeLLMClient:
    """No-network client for tests.

    ``responses`` may contain dicts (valid or invalid), JSON strings, or
    exceptions. After the list is exhausted the last item is repeated, which
    makes rate-limit and retry tests deterministic.
    """

    def __init__(self, responses: list[object] | None = None) -> None:
        self.responses = list(responses or [])
        self.calls: list[dict[str, object]] = []
        self._index = 0

    async def complete_json(
        self, system: str, messages: list[dict[str, str]], schema: dict
    ) -> dict:
        self.calls.append({"system": system, "messages": messages, "schema": schema})
        if not self.responses:
            raise LLMClientError("fake_unconfigured")

        item = self.responses[min(self._index, len(self.responses) - 1)]
        self._index += 1
        if isinstance(item, BaseException):
            raise item
        if isinstance(item, str):
            return _parse_json_object(item)
        if isinstance(item, dict):
            return item
        raise LLMClientError("invalid_response")


def _parse_json_object(content: str) -> dict:
    """Parse a JSON object without ever including content in an error."""
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end <= start:
            raise LLMClientError("invalid_json") from None
        try:
            return json.loads(content[start : end + 1])
        except json.JSONDecodeError:
            raise LLMClientError("invalid_json") from None


def load_system_prompt(version: str = DEFAULT_SYSTEM_PROMPT_VERSION) -> str:
    """Read a versioned prompt from disk; never inline user content."""
    path = PROMPT_DIR / f"{version}.md"
    if not path.is_file():
        raise LLMClientError("prompt_missing")
    return path.read_text(encoding="utf-8")


def build_system_prompt(schema: dict, version: str = DEFAULT_SYSTEM_PROMPT_VERSION) -> str:
    """Append the JSON schema to the versioned system prompt."""
    return (
        load_system_prompt(version)
        + "\n\nOutput schema (JSON Schema):\n"
        + json.dumps(schema, ensure_ascii=False)
    )


async def analyze_chat(
    client: LLMClient,
    system: str,
    messages: list[dict[str, str]],
    schema: dict,
    *,
    retries: int = 1,
) -> LLMOutcome:
    """Call the LLM, validate output, and fail closed to a category label.

    ``retries`` means *additional* attempts after the first one. No raw model
    output or user content is logged on either path.
    """
    last_error = "unknown"
    for attempt in range(retries + 1):
        started = time.monotonic()
        try:
            raw = await client.complete_json(system, messages, schema)
            analysis = ChatAnalysis.model_validate(raw)
            logger.info(
                "llm.complete_json attempt=%s outcome=ok latency_ms=%s",
                attempt + 1,
                int((time.monotonic() - started) * 1000),
            )
            return LLMOutcome(analysis=analysis)
        except LLMClientError as exc:
            last_error = exc.category
        except ValidationError:
            last_error = "invalid_output"
        except (ValueError, TypeError):
            last_error = "invalid_output"
        except Exception:  # pragma: no cover - provider-specific surprises
            last_error = "provider_error"

        logger.info(
            "llm.complete_json attempt=%s outcome=%s latency_ms=%s",
            attempt + 1,
            last_error,
            int((time.monotonic() - started) * 1000),
        )

    return LLMOutcome(analysis=None, error_category=last_error)


_client_cache: dict[tuple[str, str, str, float], LLMClient] = {}


def get_llm_client(settings: Settings | None = None) -> LLMClient:
    """Return the configured client. Tests replace this function directly."""
    settings = settings or get_settings()
    if settings.llm_provider == "fake":
        return FakeLLMClient()

    key = (
        settings.llm_provider,
        settings.llm_model,
        settings.llm_base_url,
        settings.llm_timeout_seconds,
    )
    client = _client_cache.get(key)
    if client is None:
        client = OpenAICompatibleClient(
            api_key=settings.llm_api_key,
            model=settings.llm_model,
            base_url=settings.llm_base_url,
            timeout_seconds=settings.llm_timeout_seconds,
        )
        _client_cache[key] = client
    return client


def reset_llm_client_cache() -> None:
    """Clear cached clients (used by tests)."""
    _client_cache.clear()


# Safe replies used when the model is unavailable or the final level is high.
# They intentionally contain no diagnosis, no promise of safety, and no means.
FALLBACK_LOW_REPLY = (
    "I'm here with you. I'm sorry this is hard right now — if you'd like, "
    "tell me a little more about what feels heaviest today."
)
FALLBACK_ELEVATED_REPLY = (
    "I'm really glad you told me. You don't have to carry this alone. "
    "Please reach out to someone you trust, and use the crisis resources below "
    "if you need support right now. Would you like to tell me what happened?"
)
FALLBACK_HIGH_REPLY = (
    "I'm really sorry this feels so heavy right now. Please reach out to a "
    "trusted person and a crisis service below now; if you might act on these "
    "thoughts, contact local emergency services. You don't have to face this "
    "moment by yourself."
)
HIGH_RISK_LEAD = (
    "I'm really sorry this feels so heavy right now. Your safety matters. "
    "Please reach out to a trusted person and a crisis service below now; if "
    "you might act on these thoughts, contact local emergency services."
)


def final_reply(level: RiskLevel, model_reply: str | None) -> str:
    """Choose a safe reply after the rules engine has set the final level."""
    if level == "high":
        return f"{HIGH_RISK_LEAD} {model_reply}".strip() if model_reply else FALLBACK_HIGH_REPLY
    if model_reply:
        return model_reply
    return FALLBACK_ELEVATED_REPLY if level == "elevated" else FALLBACK_LOW_REPLY

"""Application configuration — all values come from environment variables."""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Env-driven settings. See .env.example for the full list."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )

    environment: str = "development"

    # Supabase Auth (JWT verification)
    supabase_url: str = ""
    supabase_jwks_url: str = ""
    # Service role key — server-side only, used by /auth/psychologist-signup.
    # Never sent to the browser and never logged.
    supabase_service_role_key: str = ""

    # CORS for the Next.js dev server / deployed web app
    cors_origins: str = "http://localhost:3000"

    # LLM service layer. "openai" means any OpenAI-compatible /chat/completions
    # endpoint; with the Groq base URL below this sends the Groq key, not an
    # OpenAI key. "fake" is the no-network provider used by tests.
    llm_provider: Literal["openai", "groq", "fake"] = "openai"
    llm_api_key: str = ""
    llm_model: str = "openai/gpt-oss-20b"
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_timeout_seconds: float = 15.0
    llm_max_retries: int = 1
    chat_prompt_version: str = "chat_system_v1"

    @field_validator("supabase_url", "llm_base_url")
    @classmethod
    def strip_trailing_slash(cls, v: str) -> str:
        return v.rstrip("/")

    @field_validator("llm_timeout_seconds")
    @classmethod
    def positive_timeout(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("llm_timeout_seconds must be positive")
        return v

    @field_validator("llm_max_retries")
    @classmethod
    def non_negative_retries(cls, v: int) -> int:
        if v < 0:
            raise ValueError("llm_max_retries cannot be negative")
        return v

    @property
    def jwks_url(self) -> str:
        """Supabase exposes its JWKS under the auth API."""
        if self.supabase_jwks_url:
            return self.supabase_jwks_url
        return f"{self.supabase_url}/auth/v1/.well-known/jwks.json"

    @property
    def token_issuer(self) -> str:
        """Expected `iss` claim of Supabase access tokens."""
        return f"{self.supabase_url}/auth/v1"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

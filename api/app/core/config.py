"""Application configuration — all values come from environment variables."""

from functools import lru_cache

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

    # CORS for the Next.js dev server / deployed web app
    cors_origins: str = "http://localhost:3000"

    # LLM service layer (wired up in Phase 3)
    llm_provider: str = "openai"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"

    @field_validator("supabase_url")
    @classmethod
    def strip_trailing_slash(cls, v: str) -> str:
        return v.rstrip("/")

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

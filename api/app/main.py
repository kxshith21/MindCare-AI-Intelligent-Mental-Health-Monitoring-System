"""FastAPI application factory and entry point.

Run locally (from /api):
  uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers import health


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="MindCare AI API",
        version="0.1.0",
        description=(
            "Backend for MindCare AI: mood check-ins, supportive AI chat, "
            "and consent-based progress sharing. Not a crisis service."
        ),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    return app


app = create_app()

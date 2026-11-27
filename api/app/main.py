"""FastAPI application factory and entry point.

Run locally (from /api):
  uvicorn app.main:app --reload --port 8000
"""

import logging
import time
from collections.abc import Awaitable, Callable
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.logging_config import configure_logging
from app.routers import (
    account,
    auth,
    chat,
    checkins,
    clinician_notes,
    health,
    psychologist,
)

request_logger = logging.getLogger("app.requests")


def _safe_path(request: Request) -> str:
    """Route-like path with path params redacted; query strings are never read."""
    if not request.scope.get("endpoint"):
        return "<unmatched>"
    path = str(request.scope.get("path", "<unmatched>"))
    for name, value in request.scope.get("path_params", {}).items():
        if value is None:
            continue
        text = str(value)
        if text:
            path = path.replace(text, "{" + name + "}")
    return path


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()

    app = FastAPI(
        title="MindCare AI API",
        version="0.1.0",
        description=(
            "Backend for MindCare AI: mood check-ins, supportive AI chat, "
            "and consent-based progress sharing. Not a crisis service."
        ),
    )

    @app.middleware("http")
    async def log_request(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        started = time.perf_counter()
        request_id = uuid4().hex
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-Id"] = request_id
            return response
        finally:
            request_logger.info(
                "request.completed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": _safe_path(request),
                    "status": status_code,
                    "latency_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(chat.router)
    app.include_router(checkins.router)
    app.include_router(psychologist.router)
    app.include_router(clinician_notes.router)
    app.include_router(account.router)
    return app


app = create_app()

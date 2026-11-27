"""Minimal structured logging for the API.

Log lines are JSON objects with metadata only. Never add query strings, headers,
tokens, message bodies or exception text here — those must not be logged.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

_RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__)
_MARKER = "_mindcare_json_logging"


class JsonFormatter(logging.Formatter):
    """Render a record as one JSON line, including any explicit ``extra`` fields."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        # Deliberately ignore exc_info/exc_text: exception bodies are not logged.
        return json.dumps(payload, default=str, ensure_ascii=False)


def configure_logging(level: int = logging.INFO) -> None:
    """Attach one JSON handler to the app logger; safe to call more than once."""
    app_logger = logging.getLogger("app")
    if getattr(app_logger, _MARKER, False):
        return

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    app_logger.addHandler(handler)
    app_logger.setLevel(level)
    setattr(app_logger, _MARKER, True)

"""Structured request logging tests — metadata only, never request contents."""

from __future__ import annotations

import json
import logging
import sys

from fastapi.testclient import TestClient

from app.core.logging_config import JsonFormatter
from app.main import app


def test_structured_request_log(caplog) -> None:
    with caplog.at_level(logging.INFO, logger="app.requests"):
        with TestClient(app) as client:
            response = client.get(
                "/openapi.json?token=super-secret-query-value",
                headers={"Authorization": "Bearer super-secret-header-token"},
            )

    assert response.status_code == 200
    records = [
        record
        for record in caplog.records
        if record.name == "app.requests" and record.getMessage() == "request.completed"
    ]
    assert len(records) == 1
    payload = json.loads(JsonFormatter().format(records[0]))
    assert payload["request_id"] == response.headers["X-Request-Id"]
    assert payload["method"] == "GET"
    assert payload["path"] == "/openapi.json"
    assert payload["status"] == 200
    assert isinstance(payload["latency_ms"], (int, float))
    assert payload["latency_ms"] >= 0

    text = json.dumps(payload)
    assert "super-secret-query-value" not in text
    assert "super-secret-header-token" not in text
    assert "?" not in payload["path"]


def test_json_formatter_omits_exception_text() -> None:
    try:
        raise ValueError("sensitive-exception-body")
    except ValueError:
        record = logging.LogRecord(
            "app.test",
            logging.ERROR,
            __file__,
            0,
            "request.failed",
            (),
            sys.exc_info(),
        )

    assert "sensitive-exception-body" not in JsonFormatter().format(record)

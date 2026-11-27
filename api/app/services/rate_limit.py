"""Simple in-memory per-user rate limiter for /chat/message.

This is process-local by design for Phase 3. A shared store (e.g. Redis or
Supabase Edge rate limits) is required for multi-instance deployments — see
docs/TODO.md.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class RateLimitExceeded(Exception):
    """Raised when a user has sent too many messages in the window."""


class InMemoryRateLimiter:
    """Fixed-window limiter keyed by user id."""

    def __init__(self, limit: int = 20, window_seconds: float = 60.0) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.limit:
                raise RateLimitExceeded
            events.append(now)

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


chat_message_limiter = InMemoryRateLimiter(limit=20, window_seconds=60.0)

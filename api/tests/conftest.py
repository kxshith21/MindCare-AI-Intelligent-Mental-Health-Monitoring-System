"""Test configuration — set env before the app is imported."""

import os

# Force test values: a local api/.env (or an empty SUPABASE_URL in the shell)
# must never leak into token verification tests. pydantic-settings ignores
# empty env vars, so setdefault() is not enough here.
os.environ["SUPABASE_URL"] = "https://test-project.supabase.co"
os.environ["CORS_ORIGINS"] = "http://localhost:3000"

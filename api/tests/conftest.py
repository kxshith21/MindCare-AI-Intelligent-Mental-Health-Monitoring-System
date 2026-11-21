"""Test configuration — set env before the app is imported."""

import os

os.environ.setdefault("SUPABASE_URL", "https://test-project.supabase.co")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")

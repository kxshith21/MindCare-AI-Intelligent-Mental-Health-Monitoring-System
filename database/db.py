"""SQLite database operations for chat history and analytics."""

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime

# Path to SQLite database file
if os.environ.get("VERCEL"):
    DB_DIR = "/tmp"
else:
    DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "database")

DB_PATH = os.path.join(DB_DIR, "mental_health.db")


def get_connection():
    """Return a connection with row factory for dict-like access."""
    if os.environ.get("VERCEL"):
        # Auto-copy seeded DB to /tmp if it doesn't exist yet
        if not os.path.exists(DB_PATH):
            import shutil
            orig_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "database", "mental_health.db")
            if os.path.exists(orig_path):
                shutil.copy(orig_path, DB_PATH)
    else:
        os.makedirs(DB_DIR, exist_ok=True)
        
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_database():
    """Create conversations table if it does not exist."""
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_message TEXT NOT NULL,
                detected_emotion TEXT NOT NULL,
                emotion_score REAL NOT NULL,
                suicide_risk_score REAL NOT NULL,
                bot_response TEXT NOT NULL,
                emergency_flag INTEGER DEFAULT 0,
                timestamp TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_timestamp
            ON conversations(timestamp)
            """
        )


def insert_conversation(
    user_message,
    detected_emotion,
    emotion_score,
    suicide_risk_score,
    bot_response,
    emergency_flag=0,
):
    """Store a single chat exchange and return the new row id."""
    timestamp = datetime.utcnow().isoformat()
    with get_db() as conn:
        cursor = conn.execute(
            """
            INSERT INTO conversations (
                user_message, detected_emotion, emotion_score,
                suicide_risk_score, bot_response, emergency_flag, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_message,
                detected_emotion,
                emotion_score,
                suicide_risk_score,
                bot_response,
                1 if emergency_flag else 0,
                timestamp,
            ),
        )
        return cursor.lastrowid


def get_recent_conversations(limit=20):
    """Fetch most recent conversations for dashboard logs."""
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, user_message, detected_emotion, emotion_score,
                   suicide_risk_score, bot_response, emergency_flag, timestamp
            FROM conversations
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]


def get_emergency_alerts(limit=10):
    """Fetch conversations flagged as high-risk emergencies."""
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, user_message, suicide_risk_score, timestamp
            FROM conversations
            WHERE emergency_flag = 1
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]


def get_analytics_data():
    """Aggregate data for dashboard charts and wellness score."""
    with get_db() as conn:
        emotion_dist = conn.execute(
            """
            SELECT detected_emotion, COUNT(*) as count
            FROM conversations
            GROUP BY detected_emotion
            """
        ).fetchall()

        risk_timeline = conn.execute(
            """
            SELECT date(timestamp) as day,
                   AVG(suicide_risk_score) as avg_risk,
                   MAX(suicide_risk_score) as max_risk,
                   COUNT(*) as message_count
            FROM conversations
            GROUP BY date(timestamp)
            ORDER BY day DESC
            LIMIT 14
            """
        ).fetchall()

        weekly_emotions = conn.execute(
            """
            SELECT date(timestamp) as day, detected_emotion, COUNT(*) as count
            FROM conversations
            WHERE timestamp >= datetime('now', '-7 days')
            GROUP BY date(timestamp), detected_emotion
            ORDER BY day ASC
            """
        ).fetchall()

        totals = conn.execute(
            """
            SELECT
                COUNT(*) as total_messages,
                AVG(emotion_score) as avg_emotion_confidence,
                AVG(suicide_risk_score) as avg_risk,
                SUM(emergency_flag) as emergency_count
            FROM conversations
            """
        ).fetchone()

        dominant = None
        if emotion_dist:
            top = max(emotion_dist, key=lambda r: r["count"])
            dominant = dict(top)

        return {
            "emotion_distribution": [dict(r) for r in emotion_dist],
            "risk_timeline": [dict(r) for r in risk_timeline],
            "weekly_emotions": [dict(r) for r in weekly_emotions],
            "totals": dict(totals) if totals else {},
            "dominant_emotion": dominant,
        }


def clean_stored_disclaimers():
    """Remove legacy disclaimer text from saved bot replies in SQLite."""
    from utils.response_generator import strip_disclaimer

    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, bot_response FROM conversations"
        ).fetchall()
        updated = 0
        for row in rows:
            cleaned = strip_disclaimer(row["bot_response"])
            if cleaned != row["bot_response"]:
                conn.execute(
                    "UPDATE conversations SET bot_response = ? WHERE id = ?",
                    (cleaned, row["id"]),
                )
                updated += 1
        return updated

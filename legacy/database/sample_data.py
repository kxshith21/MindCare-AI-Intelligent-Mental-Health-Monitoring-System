"""Insert sample conversations for dashboard demo on first run."""

from datetime import datetime, timedelta
import random

from database.db import get_db, init_database

EMOTIONS = ["sadness", "joy", "fear", "anger", "neutral"]
SAMPLE_MESSAGES = [
    ("I feel really down today.", "sadness", 0.82, 0.15),
    ("Work has been stressful.", "fear", 0.71, 0.22),
    ("I had a good walk this morning!", "joy", 0.88, 0.05),
    ("I'm frustrated with everything.", "anger", 0.76, 0.18),
    ("Just checking in.", "neutral", 0.65, 0.08),
    ("I can't sleep and worry a lot.", "fear", 0.79, 0.35),
    ("Talking helps me feel lighter.", "joy", 0.72, 0.06),
    ("I feel lonely sometimes.", "sadness", 0.85, 0.28),
]

RESPONSES = {
    "sadness": "I'm here for you. Want to talk more about it?",
    "joy": "That's wonderful to hear! What's been going well?",
    "fear": "It's okay to feel anxious. You're not alone in this.",
    "anger": "Your feelings are valid. Would it help to unpack what's bothering you?",
    "neutral": "Thank you for sharing. How are you feeling right now?",
}


def seed_sample_data():
    """Insert sample rows if the database is empty."""
    init_database()
    with get_db() as conn:
        count = conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
        if count > 0:
            return 0

        base_time = datetime.utcnow() - timedelta(days=6)
        inserted = 0
        for i, (msg, emotion, score, risk) in enumerate(SAMPLE_MESSAGES):
            ts = (base_time + timedelta(hours=i * 8)).isoformat()
            conn.execute(
                """
                INSERT INTO conversations (
                    user_message, detected_emotion, emotion_score,
                    suicide_risk_score, bot_response, emergency_flag, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    msg,
                    emotion,
                    score,
                    risk,
                    RESPONSES[emotion],
                    1 if risk > 0.7 else 0,
                    ts,
                ),
            )
            inserted += 1

        # Extra random entries for richer charts
        for day in range(7):
            for _ in range(random.randint(1, 3)):
                emotion = random.choice(EMOTIONS)
                ts = (base_time + timedelta(days=day, hours=random.randint(0, 20))).isoformat()
                risk = round(random.uniform(0.05, 0.45), 2)
                conn.execute(
                    """
                    INSERT INTO conversations (
                        user_message, detected_emotion, emotion_score,
                        suicide_risk_score, bot_response, emergency_flag, timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        f"Sample message ({emotion})",
                        emotion,
                        round(random.uniform(0.6, 0.95), 2),
                        risk,
                        RESPONSES[emotion],
                        0,
                        ts,
                    ),
                )
                inserted += 1

        return inserted

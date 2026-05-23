"""Suicide and high-risk mental distress detection."""

import re

# High-risk phrases (case-insensitive matching)
HIGH_RISK_PHRASES = [
    r"kill\s+myself",
    r"end\s+my\s+life",
    r"want\s+to\s+die",
    r"wish\s+i\s+was\s+dead",
    r"suicide",
    r"self[\s-]?harm",
    r"cut\s+myself",
    r"no\s+reason\s+to\s+live",
    r"better\s+off\s+dead",
]

MEDIUM_RISK_PHRASES = [
    r"hopeless",
    r"nobody\s+cares\s+about\s+me",
    r"can'?t\s+go\s+on",
    r"give\s+up",
    r"worthless",
    r"no\s+point",
    r"don'?t\s+want\s+to\s+live",
    r"alone\s+forever",
    r"hate\s+myself",
]

# Risk threshold for emergency alerts (0.0 - 1.0)
RISK_THRESHOLD = 0.65

# Emotions that increase distress weight
DISTRESS_EMOTIONS = {"sadness", "fear", "anger"}


def _count_phrase_matches(text, patterns):
    """Count how many patterns match in the text."""
    text_lower = text.lower()
    matches = 0
    for pattern in patterns:
        if re.search(pattern, text_lower):
            matches += 1
    return matches


def calculate_risk_score(user_message, detected_emotion=None, emotion_score=0.0):
    """
    Calculate suicide risk score from keywords, emotion, and distress signals.
    Returns float between 0.0 and 1.0.
    """
    if not user_message or not user_message.strip():
        return 0.0

    high_matches = _count_phrase_matches(user_message, HIGH_RISK_PHRASES)
    medium_matches = _count_phrase_matches(user_message, MEDIUM_RISK_PHRASES)

    # Base score from keyword analysis
    score = min(1.0, high_matches * 0.45 + medium_matches * 0.2)

    # Boost from emotional distress
    if detected_emotion in DISTRESS_EMOTIONS:
        score += 0.1 * (emotion_score or 0.5)

    # Exclamation and extreme language hints
    if len(user_message) > 200 and detected_emotion in DISTRESS_EMOTIONS:
        score += 0.05

    # Optional MentalBERT boost (set USE_MENTALBERT=true)
    try:
        from utils.mentalbert_optional import mentalbert_risk_boost

        score += mentalbert_risk_boost(user_message)
    except ImportError:
        pass

    return round(min(1.0, score), 3)


def is_high_risk(risk_score):
    """Return True if risk score exceeds emergency threshold."""
    return risk_score >= RISK_THRESHOLD


def get_risk_level(risk_score):
    """Human-readable risk level label."""
    if risk_score >= RISK_THRESHOLD:
        return "high"
    if risk_score >= 0.35:
        return "medium"
    if risk_score >= 0.15:
        return "low"
    return "minimal"

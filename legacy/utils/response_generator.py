"""Natural, calm conversational responses — like a supportive listener."""

import random
import re

# Legacy disclaimer patterns (stripped from all bot replies)
_DISCLAIMER_STRIP_PATTERNS = [
    re.compile(
        r"\s*[—\-–]\s*\(?\s*This chatbot is not a replacement for professional mental healthcare\.?\s*\)?",
        re.IGNORECASE,
    ),
    re.compile(
        r"\s*\(?\s*This chatbot is not a replacement for professional mental healthcare\.?\s*\)?",
        re.IGNORECASE,
    ),
]


def strip_disclaimer(text):
    """Remove disclaimer from bot text (new or old stored messages)."""
    if not text:
        return text
    cleaned = text
    for pattern in _DISCLAIMER_STRIP_PATTERNS:
        cleaned = pattern.sub("", cleaned)
    return cleaned.strip()

EMOTION_ALIASES = {
    "sadness": "sadness",
    "sad": "sadness",
    "anger": "anger",
    "angry": "anger",
    "fear": "fear",
    "fearful": "fear",
    "joy": "joy",
    "happy": "joy",
    "love": "joy",
    "surprise": "neutral",
    "disgust": "anger",
    "neutral": "neutral",
}

# Topic hints from the user's message
TOPIC_PATTERNS = {
    "work": r"\b(work|job|boss|colleague|office|shift|deadline|fired|hired)\b",
    "school": r"\b(school|college|exam|study|class|homework|teacher|university)\b",
    "relationship": r"\b(partner|boyfriend|girlfriend|husband|wife|breakup|divorce|relationship|dating)\b",
    "family": r"\b(mom|dad|mother|father|parent|sibling|brother|sister|family)\b",
    "lonely": r"\b(lonely|alone|isolated|no one|nobody)\b",
    "sleep": r"\b(sleep|insomnia|tired|exhausted|can'?t rest|night)\b",
    "health": r"\b(sick|ill|pain|hospital|doctor|health)\b",
}

# Calm openers by emotion — sounds like someone actually listening
OPENERS_BY_EMOTION = {
    "sadness": [
        "I hear you.",
        "I'm really glad you told me.",
        "That sounds really hard.",
        "I'm here with you.",
    ],
    "anger": [
        "I hear you.",
        "Yeah, that would get to anyone.",
        "You had every right to feel upset about that.",
    ],
    "fear": [
        "I hear you.",
        "That sounds really stressful.",
        "Take a breath — I'm right here.",
    ],
    "joy": [
        "That's amazing!",
        "I'm so happy for you!",
        "Love hearing that!",
        "What a good moment.",
    ],
    "neutral": [
        "Thanks for sharing that.",
        "I'm listening.",
        "Tell me more if you want.",
    ],
}

# Gentle follow-ups (not clinical)
FOLLOW_UPS = [
    "What part of this feels heaviest right now?",
    "Do you want to tell me a bit more about it?",
    "How long has it been feeling like this?",
    "What would feel even a little bit easier today?",
    "I'm here — we can just talk, no rush.",
]

HIGH_RISK_RESPONSE = (
    "I'm really worried about you, and I care about what you're going through. "
    "You don't have to handle this alone. If you can, please reach out to someone you trust right now — "
    "or call or text 988 in the US (Suicide & Crisis Lifeline). "
    "If you're in immediate danger, please call emergency services. "
    "I'm still here if you want to keep talking."
)

# Varied cores per emotion — warm, human, short
EMOTION_CORES = {
    "sadness": [
        "It's okay to not be okay sometimes. You don't have to pretend you're fine with me.",
        "Sadness can sit heavy for a while — that doesn't mean you're weak.",
        "I'm sorry you're going through this. You deserve kindness, especially from yourself.",
    ],
    "anger": [
        "Anger often shows up when something important to you was crossed. That's valid.",
        "You had a reason to feel upset. We can unpack it slowly if you want.",
        "It's alright to feel fired up. Let's figure out what's underneath it together.",
    ],
    "fear": [
        "When everything feels uncertain, your mind tries to protect you — even if it feels exhausting.",
        "Anxiety is loud, but you're still here, still talking. That takes courage.",
        "Let's take this one small step at a time. You don't have to solve it all tonight.",
    ],
    "joy": [
        "I love hearing that — tell me more, I want to celebrate it with you.",
        "Those good moments matter. Hold onto them when you can.",
        "That's really nice. What made it feel special for you?",
    ],
    "neutral": [
        "Sometimes we're just getting through the day, and that's enough.",
        "No pressure to have it all figured out. We can just chat.",
        "I'm here either way — whether it's a big thing or a small thing on your mind.",
    ],
}

TOPIC_LINES = {
    "work": "Work stress can follow you home and make everything feel louder.",
    "school": "School pressure piles up fast — it's a lot for anyone to carry.",
    "relationship": "Relationships touch the heart — when they hurt, everything else can feel harder too.",
    "family": "Family stuff runs deep. It's okay if your feelings about it are complicated.",
    "lonely": "Feeling alone is painful. I'm glad you're not completely alone right now — I'm here with you.",
    "sleep": "When you're not sleeping, everything hits harder. Rest matters, and it's hard when it won't come.",
    "health": "When your body isn't cooperating, it's draining on the mind too.",
}


def normalize_emotion(label):
    if not label:
        return "neutral"
    return EMOTION_ALIASES.get(label.lower().strip(), "neutral")


def _detect_topics(text):
    """Return topic keys mentioned in the message."""
    lower = text.lower()
    found = []
    for topic, pattern in TOPIC_PATTERNS.items():
        if re.search(pattern, lower):
            found.append(topic)
    return found


def _reflect_phrase(user_message):
    """
    Mirror a short piece of what they said — feels personal, not robotic.
    """
    msg = user_message.strip()
    if len(msg) < 8:
        return None

    lower = msg.lower()

    # Simple feeling reflections
    feeling_map = [
        (r"\b(anxious|anxiety|worried|worry|nervous|panic)\b", "sounds like anxiety has been really present for you"),
        (r"\b(sad|depressed|down|cry|crying|heartbroken)\b", "sounds like you've been carrying some deep sadness"),
        (r"\b(angry|mad|furious|annoyed|frustrated)\b", "sounds like something left you feeling really frustrated"),
        (r"\b(happy|glad|good|great|relieved)\b", "sounds like something actually went well for you"),
        (r"\b(tired|exhausted|burned out|burnt out)\b", "sounds like you're running on empty"),
        (r"\b(scared|afraid|fear)\b", "sounds like fear has been showing up a lot"),
        (r"\b(lonely|alone)\b", "sounds like loneliness has been weighing on you"),
        (r"\b(stressed|stress|overwhelmed)\b", "sounds like life has felt pretty overwhelming"),
    ]
    for pattern, reflection in feeling_map:
        if re.search(pattern, lower):
            return reflection[0].upper() + reflection[1:] + "."

    # Use first sentence for a personal touch (skip for very happy short msgs)
    if re.search(r"\b(happy|great|promoted|excited|wonderful|amazing)\b", lower):
        return None

    first = re.split(r"[.!?]\s+", msg)[0].strip()
    if 12 <= len(first) <= 100:
        if len(first) <= 60:
            return f"So {first.lower().rstrip('.')} — I get why that would stick with you."
        return "What you shared tells me this has been sitting with you for a while."

    return None


def _pick_follow_up(user_message, emotion):
    """Choose a follow-up that fits the message length and emotion."""
    short_msg = len(user_message.split()) < 6
    if short_msg:
        return random.choice([
            "What's on your mind?",
            "Want to say a little more?",
            "I'm here — what's going on?",
        ])
    if emotion == "joy":
        return random.choice([
            "What made today feel better?",
            "I'd love to hear more about that.",
        ])
    return random.choice(FOLLOW_UPS)


def generate_response(
    detected_emotion,
    risk_score=0.0,
    is_emergency=False,
    user_message="",
):
    """
    Build a calm, human reply that listens first, then supports.
    """
    if is_emergency or risk_score >= 0.65:
        return strip_disclaimer(HIGH_RISK_RESPONSE)

    emotion = normalize_emotion(detected_emotion)
    parts = []

    # 1. Acknowledge them (varied opener matched to mood)
    openers = OPENERS_BY_EMOTION.get(emotion, OPENERS_BY_EMOTION["neutral"])
    parts.append(random.choice(openers))

    # 2. Reflect what they said when possible
    reflection = _reflect_phrase(user_message)
    if reflection:
        parts.append(reflection)

    # 3. Topic-specific empathy
    topics = _detect_topics(user_message)
    if topics:
        parts.append(TOPIC_LINES.get(random.choice(topics), ""))

    # 4. Emotion-appropriate support (one line, conversational)
    parts.append(random.choice(EMOTION_CORES.get(emotion, EMOTION_CORES["neutral"])))

    # 5. Gentle invitation to continue
    parts.append(_pick_follow_up(user_message, emotion))

    # Join with spaces — reads like natural paragraphs in chat
    reply = " ".join(p for p in parts if p and p.strip())

    # Avoid overly long walls of text
    if len(reply) > 480:
        reply = " ".join(parts[:4]) + " " + _pick_follow_up(user_message, emotion)

    return strip_disclaimer(reply)

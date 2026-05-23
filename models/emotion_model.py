"""Hugging Face emotion detection with lazy loading for low memory usage."""

import logging

logger = logging.getLogger(__name__)

# Model identifier on Hugging Face Hub
MODEL_NAME = "j-hartmann/emotion-english-distilroberta-base"

# Singleton pipeline instance (loaded on first predict)
_pipeline = None
_load_failed = False

# Hartmann model labels -> our five emotions
LABEL_MAP = {
    "anger": "anger",
    "disgust": "anger",
    "fear": "fear",
    "joy": "joy",
    "neutral": "neutral",
    "sadness": "sadness",
    "surprise": "neutral",
}


def _load_pipeline():
    """Lazy-load the transformers text-classification pipeline."""
    global _pipeline, _load_failed
    if _pipeline is not None:
        return _pipeline
    if _load_failed:
        return None

    try:
        from transformers import pipeline

        logger.info("Loading emotion model: %s (first request may take a minute)", MODEL_NAME)
        _pipeline = pipeline(
            "text-classification",
            model=MODEL_NAME,
            top_k=None,
            device=-1,  # CPU for easy local deployment
        )
        logger.info("Emotion model loaded successfully.")
        return _pipeline
    except Exception as exc:
        logger.warning("Could not load HF model, using fallback: %s", exc)
        _load_failed = True
        return None


def predict_emotion(text):
    """
    Detect emotion from user text.
    Returns dict: {emotion, score, all_scores}
    """
    if not text or not text.strip():
        return {"emotion": "neutral", "score": 0.5, "all_scores": {}}

    pipe = _load_pipeline()
    if pipe is None:
        return _fallback_emotion(text)

    try:
        results = pipe(text[:512])[0]
        if not results:
            return _fallback_emotion(text)

        # Results are list of {label, score}
        best = max(results, key=lambda x: x["score"])
        raw_label = best["label"].lower()
        emotion = LABEL_MAP.get(raw_label, "neutral")

        all_scores = {}
        for item in results:
            mapped = LABEL_MAP.get(item["label"].lower(), "neutral")
            all_scores[mapped] = max(all_scores.get(mapped, 0), item["score"])

        return {
            "emotion": emotion,
            "score": round(float(best["score"]), 3),
            "all_scores": {k: round(v, 3) for k, v in all_scores.items()},
        }
    except Exception as exc:
        logger.warning("Emotion prediction failed: %s", exc)
        return _fallback_emotion(text)


def _fallback_emotion(text):
    """Keyword-based fallback when model is unavailable."""
    text_lower = text.lower()
    keywords = {
        "sadness": ["sad", "depressed", "lonely", "cry", "hopeless", "down"],
        "anger": ["angry", "mad", "furious", "hate", "annoyed"],
        "fear": ["scared", "anxious", "worried", "panic", "nervous", "afraid"],
        "joy": ["happy", "great", "excited", "wonderful", "good", "grateful"],
    }
    scores = {e: 0.0 for e in ["sadness", "anger", "fear", "joy", "neutral"]}
    for emotion, words in keywords.items():
        for w in words:
            if w in text_lower:
                scores[emotion] += 0.25

    best_emotion = max(scores, key=scores.get)
    if scores[best_emotion] == 0:
        best_emotion = "neutral"
        best_score = 0.5
    else:
        best_score = min(0.85, scores[best_emotion])

    return {
        "emotion": best_emotion,
        "score": round(best_score, 3),
        "all_scores": scores,
    }

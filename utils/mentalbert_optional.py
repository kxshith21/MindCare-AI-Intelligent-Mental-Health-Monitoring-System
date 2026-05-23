"""
Optional MentalBERT integration for enhanced suicide risk scoring.

Enable by setting USE_MENTALBERT=true and installing the model dependencies.
Falls back to keyword-based scoring when disabled or unavailable.
"""

import logging
import os

logger = logging.getLogger(__name__)

USE_MENTALBERT = os.environ.get("USE_MENTALBERT", "false").lower() == "true"
MENTALBERT_MODEL = "mental/mental-bert-base-uncased"

_classifier = None


def _load_classifier():
    """Lazy-load optional MentalBERT classifier."""
    global _classifier
    if _classifier is not None:
        return _classifier
    try:
        from transformers import pipeline

        _classifier = pipeline(
            "text-classification",
            model=MENTALBERT_MODEL,
            device=-1,
        )
        return _classifier
    except Exception as exc:
        logger.warning("MentalBERT unavailable: %s", exc)
        return None


def mentalbert_risk_boost(text):
    """
    Return additional risk boost (0.0 - 0.3) from MentalBERT if enabled.
  Otherwise returns 0.0.
    """
    if not USE_MENTALBERT or not text:
        return 0.0

    clf = _load_classifier()
    if clf is None:
        return 0.0

    try:
        result = clf(text[:512])[0]
        # Heuristic: low confidence positive label may indicate distress context
        score = float(result.get("score", 0))
        label = str(result.get("label", "")).lower()
        if "stress" in label or "negative" in label or label == "label_1":
            return min(0.3, score * 0.3)
    except Exception as exc:
        logger.debug("MentalBERT inference skipped: %s", exc)

    return 0.0

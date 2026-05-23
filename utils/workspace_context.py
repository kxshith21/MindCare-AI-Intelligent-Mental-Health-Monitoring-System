"""Shared context for integrated workspace (chat + dashboard)."""

from database.db import (
    get_analytics_data,
    get_emergency_alerts,
    get_recent_conversations,
)
def _calculate_wellness_score(totals):
    if not totals or not totals.get("total_messages"):
        return 75
    avg_risk = totals.get("avg_risk") or 0
    total = totals.get("total_messages") or 1
    emergencies = totals.get("emergency_count") or 0
    emergency_rate = emergencies / total
    score = 100 - (avg_risk * 40) - (emergency_rate * 50)
    return max(0, min(100, round(score)))


def get_workspace_context():
    """Build template context for the unified workspace page."""
    analytics = get_analytics_data()
    wellness = _calculate_wellness_score(analytics.get("totals"))
    alerts = get_emergency_alerts(limit=10)
    recent = get_recent_conversations(limit=12)
    dominant = analytics.get("dominant_emotion") or {}

    return {
        "wellness_score": wellness,
        "emergency_alerts": alerts,
        "recent_conversations": recent,
        "alert_count": len(alerts),
        "dominant_emotion": dominant.get("detected_emotion", "neutral"),
        "active_nav": "workspace",
    }

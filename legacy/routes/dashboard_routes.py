"""Dashboard and analytics routes."""

from flask import Blueprint, jsonify, redirect, render_template, url_for

from database.db import (
    get_analytics_data,
    get_emergency_alerts,
    get_recent_conversations,
)
dashboard_bp = Blueprint("dashboard", __name__)


def _calculate_wellness_score(totals):
    """
    Mental wellness score 0-100 based on avg risk and emergency rate.
    Lower risk and fewer emergencies = higher score.
    """
    if not totals or not totals.get("total_messages"):
        return 75

    avg_risk = totals.get("avg_risk") or 0
    total = totals.get("total_messages") or 1
    emergencies = totals.get("emergency_count") or 0
    emergency_rate = emergencies / total

    # Weighted formula: start at 100, subtract risk and emergency penalties
    score = 100 - (avg_risk * 40) - (emergency_rate * 50)
    return max(0, min(100, round(score)))


@dashboard_bp.route("/dashboard")
def dashboard_page():
    """Redirect to integrated workspace analytics section."""
    return redirect(url_for("chat.workspace_page", _anchor="fullAnalytics"))


@dashboard_bp.route("/analytics")
def analytics_api():
    """JSON endpoint for dashboard charts."""
    analytics = get_analytics_data()
    wellness = _calculate_wellness_score(analytics.get("totals"))

    dominant = analytics.get("dominant_emotion") or {}
    return jsonify(
        {
            "emotion_distribution": analytics["emotion_distribution"],
            "risk_timeline": analytics["risk_timeline"],
            "weekly_emotions": analytics["weekly_emotions"],
            "totals": analytics["totals"],
            "wellness_score": wellness,
            "dominant_emotion": dominant.get("detected_emotion", "neutral"),
            "dominant_emotion_count": dominant.get("count", 0),
            "recent_conversations": get_recent_conversations(limit=20),
            "emergency_alerts": get_emergency_alerts(limit=10),
        }
    )

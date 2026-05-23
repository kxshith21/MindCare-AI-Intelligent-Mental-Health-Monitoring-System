"""Chat and prediction API routes."""

from flask import Blueprint, jsonify, redirect, render_template, request, url_for

from alerts.email_alert import send_emergency_alert
from database.db import insert_conversation
from models.emotion_model import predict_emotion
from utils.response_generator import generate_response, strip_disclaimer
from utils.risk_analyzer import calculate_risk_score, get_risk_level, is_high_risk

chat_bp = Blueprint("chat", __name__)


@chat_bp.route("/")
def index():
    """Landing page."""
    return render_template("landing.html")


@chat_bp.route("/workspace")
@chat_bp.route("/chat")
def workspace_page():
    """Integrated chat + dashboard (main app screen)."""
    from utils.workspace_context import get_workspace_context
    return render_template("workspace.html", **get_workspace_context())


@chat_bp.route("/predict", methods=["POST"])
def predict():
    """
    Process user message: detect emotion, risk, generate response, store in DB.
    """
    data = request.get_json(silent=True) or {}
    user_message = (data.get("message") or "").strip()

    if not user_message:
        return jsonify({"error": "Message is required"}), 400

    # Emotion detection via Hugging Face (lazy-loaded)
    emotion_result = predict_emotion(user_message)
    detected_emotion = emotion_result["emotion"]
    emotion_score = emotion_result["score"]

    # Suicide / high-risk analysis
    risk_score = calculate_risk_score(
        user_message, detected_emotion, emotion_score
    )
    emergency = is_high_risk(risk_score)
    risk_level = get_risk_level(risk_score)

    # Supportive response
    bot_response = strip_disclaimer(
        generate_response(
            detected_emotion,
            risk_score=risk_score,
            is_emergency=emergency,
            user_message=user_message,
        )
    )

    # Persist to SQLite
    conversation_id = insert_conversation(
        user_message=user_message,
        detected_emotion=detected_emotion,
        emotion_score=emotion_score,
        suicide_risk_score=risk_score,
        bot_response=bot_response,
        emergency_flag=emergency,
    )

    # Trigger alert for high-risk
    alert_result = None
    if emergency:
        alert_result = send_emergency_alert(
            user_message, risk_score, conversation_id
        )

    return jsonify(
        {
            "success": True,
            "conversation_id": conversation_id,
            "detected_emotion": detected_emotion,
            "emotion_score": emotion_score,
            "suicide_risk_score": risk_score,
            "risk_level": risk_level,
            "emergency": emergency,
            "bot_response": bot_response,
            "alert_sent": alert_result.get("sent") if alert_result else False,
        }
    )

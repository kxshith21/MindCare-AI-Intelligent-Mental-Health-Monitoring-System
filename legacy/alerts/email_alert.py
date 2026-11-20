"""Emergency email alert logic (prepared for production SMTP integration)."""

import logging
import os
from datetime import datetime

logger = logging.getLogger(__name__)

# Configure via environment variables for production
ALERT_EMAIL_TO = os.environ.get("ALERT_EMAIL_TO", "admin@example.com")
ALERT_EMAIL_FROM = os.environ.get("ALERT_EMAIL_FROM", "alerts@mentalhealth-ai.local")
SMTP_ENABLED = os.environ.get("SMTP_ENABLED", "false").lower() == "true"


def prepare_alert_payload(user_message, risk_score, conversation_id=None):
    """Build alert payload for storage or email dispatch."""
    return {
        "conversation_id": conversation_id,
        "risk_score": risk_score,
        "user_message_preview": (user_message or "")[:200],
        "timestamp": datetime.utcnow().isoformat(),
        "recipient": ALERT_EMAIL_TO,
        "subject": "[URGENT] Mental Health Chatbot - High Risk Alert",
    }


def send_emergency_alert(user_message, risk_score, conversation_id=None):
    """
    Send or log emergency alert.
    When SMTP_ENABLED=false, logs alert for admin dashboard pickup.
    """
    payload = prepare_alert_payload(user_message, risk_score, conversation_id)

    if not SMTP_ENABLED:
        logger.critical(
            "EMERGENCY ALERT (email disabled): risk=%.2f id=%s msg=%s",
            risk_score,
            conversation_id,
            payload["user_message_preview"],
        )
        return {"sent": False, "logged": True, "payload": payload}

    try:
        return _send_smtp_email(payload)
    except Exception as exc:
        logger.error("Failed to send alert email: %s", exc)
        return {"sent": False, "error": str(exc), "payload": payload}


def _send_smtp_email(payload):
    """Optional SMTP send — enable with SMTP_ENABLED=true and env vars."""
    import smtplib
    from email.mime.text import MIMEText

    smtp_host = os.environ.get("SMTP_HOST", "localhost")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")

    body = (
        f"High-risk conversation detected.\n\n"
        f"Risk Score: {payload['risk_score']}\n"
        f"Time: {payload['timestamp']}\n"
        f"Conversation ID: {payload['conversation_id']}\n\n"
        f"Message preview:\n{payload['user_message_preview']}\n\n"
        f"Please review the admin dashboard immediately."
    )

    msg = MIMEText(body)
    msg["Subject"] = payload["subject"]
    msg["From"] = ALERT_EMAIL_FROM
    msg["To"] = payload["recipient"]

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        if smtp_user and smtp_pass:
            server.login(smtp_user, smtp_pass)
        server.sendmail(ALERT_EMAIL_FROM, [payload["recipient"]], msg.as_string())

    logger.info("Emergency alert email sent to %s", payload["recipient"])
    return {"sent": True, "payload": payload}

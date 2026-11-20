"""
AI Mental Health Chatbot - Flask Application Entry Point

Run locally:
  Windows: double-click run.bat  OR  .\\run.ps1
  Manual:  python app.py  (from this folder, with venv activated)

Then open http://127.0.0.1:5000/workspace
"""

import logging
import os
import sys
import webbrowser
from pathlib import Path

# Ensure imports work even if terminal cwd is not the project folder
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
os.chdir(PROJECT_ROOT)

try:
    from flask import Flask
except ImportError:
    print("\n[ERROR] Flask is not installed.\n")
    print("Fix: open a terminal IN this folder and run:")
    print("  python -m venv venv")
    print("  .\\venv\\Scripts\\activate")
    print("  pip install flask")
    print("\nOr double-click run.bat (installs dependencies automatically).\n")
    sys.exit(1)

from database.db import clean_stored_disclaimers, init_database
from database.sample_data import seed_sample_data
from routes.chat_routes import chat_bp
from routes.dashboard_routes import dashboard_bp

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def create_app():
    """Application factory for modular Flask setup."""
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-mental-health-key")
    app.config["JSON_SORT_KEYS"] = False

    # Register blueprints
    app.register_blueprint(chat_bp)
    app.register_blueprint(dashboard_bp)

    # Initialize database and optional sample data
    with app.app_context():
        init_database()
        removed = clean_stored_disclaimers()
        if removed:
            logger.info("Cleaned disclaimer from %d saved chat replies.", removed)
        if os.environ.get("SEED_SAMPLE_DATA", "true").lower() == "true":
            count = seed_sample_data()
            if count:
                logger.info("Inserted %d sample conversations for demo.", count)

    @app.context_processor
    def inject_globals():
        alert_count = 0
        try:
            from database.db import get_emergency_alerts
            alert_count = len(get_emergency_alerts(limit=20))
        except Exception:
            pass
        return {"app_name": "MindCare AI", "alert_count": alert_count}

    return app


app = create_app()


if __name__ == "__main__":
    # Use 5001 by default — port 5000 often has stale old Flask instances
    port = int(os.environ.get("PORT", 5001))
    # Debug off by default — reloader breaks often on Windows / OneDrive folders
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    url = f"http://127.0.0.1:{port}/workspace"

    logger.info("Starting MindCare AI")
    logger.info("  Workspace: http://127.0.0.1:%s/workspace", port)
    logger.info("  Chat:      http://127.0.0.1:%s/chat", port)
    logger.info("  Dashboard: http://127.0.0.1:%s/dashboard", port)
    logger.info("Keep this window open while using the app. Press Ctrl+C to stop.")

    if os.environ.get("OPEN_BROWSER", "true").lower() == "true":
        try:
            webbrowser.open(url)
        except Exception:
            pass

    app.run(
        host="127.0.0.1",
        port=port,
        debug=debug,
        use_reloader=False,
    )

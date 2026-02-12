"""
Minimal Flask app for the Claude Code Monitor dashboard.

Serves the real-time monitoring API (REST + WebSocket) and static dashboard.
Run: python app.py  →  http://localhost:5000
Dashboard: http://localhost:5000/static/monitor.html
"""

from flask import Flask
from flask_socketio import SocketIO

from monitor.monitor_routes import (
    create_monitor_blueprint,
    init_socketio_events,
)
from monitor.monitor_service import MonitorService

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.secret_key = "dev-secret-key"  # Use env in production

socketio = SocketIO(app, cors_allowed_origins="*")
monitor_service = MonitorService()
monitor_blueprint = create_monitor_blueprint(monitor_service, socketio)
app.register_blueprint(monitor_blueprint)
init_socketio_events()


@app.route("/health")
def health():
    from datetime import datetime
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.route("/")
def index():
    return {"message": "Grupp Ett Monitor", "dashboard": "/static/monitor.html"}


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)

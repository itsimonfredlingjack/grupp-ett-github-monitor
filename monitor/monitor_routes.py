"""
Monitoring API routes for real-time Claude Code workflow monitoring.

Provides REST endpoints and WebSocket support for streaming workflow state updates
to connected dashboard clients.
"""

from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_socketio import emit

# This will be injected from the main app
monitor_service = None
socketio = None


def create_monitor_blueprint(service, socket_io):
    """
    Create the monitoring blueprint with injected dependencies.

    Args:
        service: MonitorService instance
        socket_io: Flask-SocketIO instance
    """
    global monitor_service, socketio
    monitor_service = service
    socketio = socket_io

    blueprint = Blueprint("monitor", __name__, url_prefix="/api/monitor")

    @blueprint.route("/state", methods=["POST"])
    def update_state():
        """
        Receive and process a state update from the monitoring wrapper.

        Request JSON:
            {
                "node": "claude|jira|github|jules|actions",
                "state": "active|inactive",
                "message": "status message"
            }

        Returns:
            JSON response with success status and current state
        """
        try:
            data = request.get_json()

            if not data:
                err = {"success": False, "error": "No JSON data provided"}
                return jsonify(err), 400

            node = data.get("node", "").lower()
            state = data.get("state", "active").lower()
            message = data.get("message", "")

            # Validate node
            if node not in monitor_service.VALID_NODES:
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": f"Invalid node: {node}. "
                            f"Must be one of {monitor_service.VALID_NODES}",
                        }
                    ),
                    400,
                )

            # Update service
            monitor_service.update_node(node, state, message)

            # Get updated state
            current_state = monitor_service.get_state()

            # Broadcast to all connected WebSocket clients
            socketio.emit(
                "state_update",
                current_state,
                namespace="/monitor",
                skip_sid=None,
            )

            return jsonify({"success": True, "current_state": current_state}), 200

        except Exception as e:
            return (
                jsonify({"success": False, "error": f"Server error: {str(e)}"}),
                500,
            )

    @blueprint.route("/state", methods=["GET"])
    def get_state():
        """
        Get the current monitoring state.

        Returns:
            JSON response with current workflow state
        """
        try:
            state = monitor_service.get_state()
            return jsonify(state), 200
        except Exception as e:
            return (
                jsonify({"success": False, "error": f"Server error: {str(e)}"}),
                500,
            )

    @blueprint.route("/reset", methods=["POST"])
    def reset_monitoring():
        """
        Reset all monitoring state.

        Returns:
            JSON response confirming reset
        """
        try:
            monitor_service.reset()
            state = monitor_service.get_state()

            # Broadcast reset to all connected clients
            socketio.emit("state_update", state, namespace="/monitor", skip_sid=None)

            return (
                jsonify(
                    {
                        "success": True,
                        "message": "Monitoring state reset",
                        "current_state": state,
                    }
                ),
                200,
            )
        except Exception as e:
            return (
                jsonify({"success": False, "error": f"Server error: {str(e)}"}),
                500,
            )

    @blueprint.route("/task", methods=["POST"])
    def update_task():
        """
        Update task information.

        Request JSON (standard):
            { "title": "...", "status": "idle|running|completed|failed", "start_time": "..." }

        Request JSON (hook compatibility):
            { "action": "start", "task_id": "...", "title": "..." } or { "action": "complete" }
        """
        try:
            data = request.get_json()

            if not data:
                err = {"success": False, "error": "No JSON data provided"}
                return jsonify(err), 400

            action = data.get("action")
            if action == "start":
                title = data.get("title", "") or f"Task {data.get('task_id', '')}"
                monitor_service.set_task_info(
                    title, "running", datetime.utcnow().isoformat() + "Z"
                )
            elif action == "complete":
                info = monitor_service.get_task_info()
                monitor_service.set_task_info(
                    info.get("title", ""), "completed", info.get("start_time")
                )
            else:
                title = data.get("title", "")
                status = data.get("status", "")
                start_time = data.get("start_time")
                if status == "running" and not start_time:
                    start_time = datetime.utcnow().isoformat() + "Z"
                monitor_service.set_task_info(title, status, start_time)

            state = monitor_service.get_state()
            socketio.emit("state_update", state, namespace="/monitor", skip_sid=None)
            return jsonify({"success": True, "current_state": state}), 200

        except Exception as e:
            return (
                jsonify({"success": False, "error": f"Server error: {str(e)}"}),
                500,
            )

    return blueprint


def init_socketio_events():
    """Initialize SocketIO event handlers for the monitoring namespace."""

    @socketio.on("connect", namespace="/monitor")
    def handle_connect():
        """Handle new client connection - send current state immediately."""
        try:
            state = monitor_service.get_state()
            emit("state_update", state)
        except Exception as e:
            print(f"Error on WebSocket connect: {str(e)}")

    @socketio.on("disconnect", namespace="/monitor")
    def handle_disconnect():
        """Handle client disconnection."""
        pass

    @socketio.on("request_state", namespace="/monitor")
    def handle_request_state():
        """Handle client request for current state."""
        try:
            state = monitor_service.get_state()
            emit("state_update", state)
        except Exception as e:
            print(f"Error on state request: {str(e)}")

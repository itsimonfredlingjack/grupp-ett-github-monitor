#!/usr/bin/env python3
"""
Monitor Client — Sends real-time updates to the Agentic Loop Monitor.

Supports both local Flask server and remote Cloudflare Worker.
Set MONITOR_URL to your Worker endpoint for cloud mode:
  export MONITOR_URL=https://grupp-ett-monitor-api.<account>.workers.dev

The Ralph high-five animation triggers when Claude node becomes active!
"""

import json
import os
import urllib.request
import urllib.error
from typing import Optional

# Configuration — supports both env var names for backwards compat
MONITOR_URL = os.environ.get(
    "MONITOR_URL",
    os.environ.get("MONITOR_API_URL", "http://localhost:5000"),
)
MONITOR_ENABLED = os.environ.get("MONITOR_ENABLED", "1") == "1"
API_SECRET = os.environ.get("MONITOR_API_SECRET", "")

# Node constants
NODE_JIRA = "jira"
NODE_CLAUDE = "claude"
NODE_GITHUB = "github"
NODE_JULES = "jules"
NODE_ACTIONS = "actions"


def _headers() -> dict[str, str]:
    h = {"Content-Type": "application/json"}
    if API_SECRET:
        h["Authorization"] = f"Bearer {API_SECRET}"
    return h


def _post(path: str, payload: dict, timeout: float = 2.0) -> bool:
    """POST JSON to monitor API. Fails silently."""
    if not MONITOR_ENABLED:
        return False

    url = f"{MONITOR_URL.rstrip('/')}{path}"
    data = json.dumps(payload).encode("utf-8")

    try:
        req = urllib.request.Request(
            url, data=data, headers=_headers(), method="POST"
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def send_update(
    node: str,
    state: str = "active",
    message: str = "",
    timeout: float = 2.0,
) -> bool:
    """Send a node state update to the monitor."""
    return _post(
        "/api/monitor/state",
        {"node": node, "state": state, "message": message},
        timeout,
    )


def start_task(task_id: str, title: str, timeout: float = 2.0) -> bool:
    """Signal that a new task is starting."""
    return _post(
        "/api/monitor/task",
        {"action": "start", "task_id": task_id, "title": title},
        timeout,
    )


def complete_task(timeout: float = 2.0) -> bool:
    """Signal that the current task is complete."""
    return _post("/api/monitor/task", {"action": "complete"}, timeout)


def detect_phase_from_tool(
    tool_name: str, tool_input: dict
) -> Optional[tuple[str, str]]:
    """Detect which phase the agent is in based on the tool being used."""
    if tool_name == "Bash":
        command = tool_input.get("command", "")

        if any(cmd in command for cmd in ["git push", "git commit", "gh pr"]):
            return (NODE_GITHUB, f"Git: {command[:50]}...")
        if any(cmd in command for cmd in ["pytest", "npm test", "ruff check"]):
            return (NODE_ACTIONS, f"Testing: {command[:50]}...")
        if "jira" in command.lower():
            return (NODE_JIRA, "Fetching from Jira...")

    elif tool_name in ("Edit", "Write"):
        file_path = tool_input.get("file_path", "")
        return (NODE_CLAUDE, f"Editing: {file_path.split('/')[-1]}")

    elif tool_name == "Read":
        file_path = tool_input.get("file_path", "")
        if file_path:
            return (NODE_CLAUDE, f"Reading: {file_path.split('/')[-1]}")

    return None


# Quick activation shortcuts
def activate_jira(message: str = "Fetching ticket...") -> bool:
    return send_update(NODE_JIRA, "active", message)


def activate_claude(message: str = "Coding...") -> bool:
    return send_update(NODE_CLAUDE, "active", message)


def activate_github(message: str = "Pushing changes...") -> bool:
    return send_update(NODE_GITHUB, "active", message)


def activate_jules(message: str = "Code review...") -> bool:
    return send_update(NODE_JULES, "active", message)


def activate_actions(message: str = "Running CI/CD...") -> bool:
    return send_update(NODE_ACTIONS, "active", message)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        node = sys.argv[1]
        message = sys.argv[2] if len(sys.argv) > 2 else "Test update"
        result = send_update(node, "active", message)
        print(f"Sent to {MONITOR_URL}: node={node} → {'OK' if result else 'FAILED'}")
    else:
        print(f"Monitor client targeting: {MONITOR_URL}")
        print(f"Enabled: {MONITOR_ENABLED}")
        print("Usage: python monitor_client.py <node> [message]")
        print("Nodes: jira, claude, github, jules, actions")

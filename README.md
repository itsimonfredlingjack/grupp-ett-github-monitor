# grupp-ett-github-monitor

Real-time monitoring dashboard for the Claude Code / Ralph agentic loop. Tracks workflow nodes (JIRA, CLAUDE, GITHUB, JULES, ACTIONS) and streams updates to a WebSocket-powered UI.

Originally part of [grupp-ett-github](https://github.com/itsimonfredlingjack/grupp-ett-github); this repo contains everything needed to run the monitor standalone or embed it elsewhere.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
python app.py
```

- **API:** http://localhost:5000  
- **Dashboard:** http://localhost:5000/static/monitor.html  
- **Health:** http://localhost:5000/health  

## What’s included

| Path | Description |
|------|-------------|
| `app.py` | Minimal Flask app (monitor API + static files) |
| `monitor/` | Monitor service and REST/WebSocket routes |
| `static/` | `monitor.html` dashboard, Ralph.mp3, background/center images |
| `claude-monitor-wrapper.sh` | Wraps CLI output and POSTs state updates from pattern matching |
| `hooks/` | `monitor_client.py` + `monitor_hook.py` for Claude/Codex pre-tool-use hooks |

## API

- `GET /api/monitor/state` — current state (nodes, event log, task info)
- `POST /api/monitor/state` — update node: `{"node":"claude","state":"active","message":"..."}`
- `POST /api/monitor/task` — set task: `{"title":"...","status":"running"}` or `{"action":"start","task_id":"GE-1","title":"..."}`
- `POST /api/monitor/reset` — reset all state  

WebSocket namespace: `/monitor` (Socket.IO). Events: `state_update`, `request_state`.

## Using the wrapper

```bash
chmod +x claude-monitor-wrapper.sh
./claude-monitor-wrapper.sh echo "Writing to app.py"
# or wrap a real command:
./claude-monitor-wrapper.sh claude "Implement feature X"
```

Wrapper logs: `~/.claude-monitor.log`. Set `MONITOR_API_URL` if the server is not at `http://localhost:5000`.

## Using the hooks (Claude / Codex)

Copy `hooks/monitor_client.py` and `hooks/monitor_hook.py` into your project’s `.claude/hooks/` (or equivalent). Configure the PreToolUse hook to run `python3 .claude/hooks/monitor_hook.py`. Ensure the monitor server is running and set `MONITOR_URL` (e.g. `http://localhost:5000`) if needed. `MONITOR_ENABLED=0` disables sending.

## Deployment

- **Cloudflare Tunnel:** Point a tunnel at `localhost:5000` and use the public URL as the dashboard (e.g. `https://gruppett.fredlingautomation.dev/static/monitor.html`).
- **Production server:** e.g. `gunicorn --worker-class eventlet -w 1 app:app` (Flask-SocketIO needs a single process or sticky sessions).

## License

Same as the parent grupp-ett-github project.

# grupp-ett-github-monitor

Real-time monitoring dashboard for the Claude Code / Ralph agentic loop. Tracks workflow nodes (JIRA, CLAUDE, GITHUB, JULES, ACTIONS) and streams updates to a visual dashboard.

Originally part of [grupp-ett-github](https://github.com/itsimonfredlingjack/grupp-ett-github); this repo contains everything needed to run the monitor standalone.

## Architecture

```
┌─────────────────┐     POST /api/monitor/state     ┌──────────────────────┐
│  Claude Code     │ ──────────────────────────────► │  Cloudflare Worker   │
│  (hooks)         │                                 │  (REST API + KV)     │
└─────────────────┘                                 └──────────┬───────────┘
                                                               │
                                                    GET /api/monitor/state
                                                        (poll every 2s)
                                                               │
                                                    ┌──────────▼───────────┐
                                                    │  Cloudflare Pages    │
                                                    │  (monitor.html)      │
                                                    └──────────────────────┘
```

## Deployment options

### Option A: Cloudflare Workers + Pages (recommended)

Serverless, always-on, free tier. See [DEPLOY_CLOUDFLARE.md](docs/DEPLOY_CLOUDFLARE.md).

```bash
# 1. Deploy Worker (API)
cd worker && npm install && npm run kv:create
# → paste KV namespace ID into wrangler.toml
npm run deploy

# 2. Deploy Pages (dashboard)
npx wrangler pages deploy ./pages --project-name=grupp-ett-monitor

# 3. Point hooks at the Worker
export MONITOR_URL=https://grupp-ett-monitor-api.<you>.workers.dev
```

### Option B: Local Flask (development)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py
# Dashboard: http://localhost:5000/static/monitor.html
```

## What's included

| Path | Description |
|------|-------------|
| `worker/` | Cloudflare Worker (TypeScript) — REST API with KV state |
| `pages/` | Static dashboard for Cloudflare Pages (polling-based) |
| `app.py` | Flask app for local development (SocketIO-based) |
| `monitor/` | Monitor service and routes (Flask) |
| `static/` | Original dashboard + assets (SocketIO version) |
| `hooks/` | `monitor_client.py` + `monitor_hook.py` for Claude Code hooks |
| `claude-monitor-wrapper.sh` | CLI wrapper that POSTs state from pattern matching |

## API

All endpoints are identical between Flask and Worker:

- `GET /api/monitor/state` — current state snapshot
- `POST /api/monitor/state` — update node: `{"node":"claude","state":"active","message":"..."}`
- `POST /api/monitor/task` — set task: `{"action":"start","task_id":"GE-1","title":"..."}`
- `POST /api/monitor/reset` — reset all state
- `GET /health` — health check

## Using the hooks

Copy `hooks/monitor_client.py` and `hooks/monitor_hook.py` into `.claude/hooks/`.

```bash
# Local mode (default)
export MONITOR_URL=http://localhost:5000

# Cloud mode (Cloudflare Worker)
export MONITOR_URL=https://grupp-ett-monitor-api.<you>.workers.dev

# Optional: API secret for write protection
export MONITOR_API_SECRET=your-secret-here

# Disable monitoring
export MONITOR_ENABLED=0
```

## Dashboard query params

The Pages dashboard (`monitor.html`) supports URL params:

- `?api=https://your-worker.workers.dev` — override API endpoint
- `?poll=1000` — polling interval in ms (default: 2000)

Example: `https://grupp-ett-monitor.pages.dev/monitor.html?api=https://grupp-ett-monitor-api.simon.workers.dev`

## License

Same as the parent grupp-ett-github project.

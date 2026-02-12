# Cloudflare Deployment Guide

Deploy the Agentic Loop Monitor as serverless infrastructure on Cloudflare's free tier.

## Prerequisites

- Node.js 18+ and npm
- Cloudflare account (free)
- `wrangler` CLI: `npm install -g wrangler`
- Authenticated: `wrangler login`

## Step 1: Deploy the Worker (API)

```bash
cd worker
npm install

# Create KV namespace
npx wrangler kv namespace create MONITOR_KV
# Output: { binding = "MONITOR_KV", id = "abc123..." }

# Paste the id into wrangler.toml
# [[kv_namespaces]]
# binding = "MONITOR_KV"
# id = "abc123..."   ← HERE

# Deploy
npm run deploy
# → https://grupp-ett-monitor-api.<account>.workers.dev
```

### Optional: API secret

Protect write endpoints with a bearer token:

```bash
npx wrangler secret put API_SECRET
# Enter your secret when prompted
```

Then set `MONITOR_API_SECRET` on the client side too.

## Step 2: Deploy Pages (Dashboard)

```bash
# From repo root
npx wrangler pages deploy ./pages --project-name=grupp-ett-monitor
# → https://grupp-ett-monitor.pages.dev
```

The dashboard polls the Worker API. If Pages and Worker are on different domains, CORS is already configured.

### Connect to your Worker

Open the dashboard with the `?api=` parameter:

```
https://grupp-ett-monitor.pages.dev/monitor.html?api=https://grupp-ett-monitor-api.<account>.workers.dev
```

Or set it as default by editing `pages/monitor.html` line with `API_BASE`.

## Step 3: Configure Claude Code hooks

```bash
# In your .bashrc / .zshrc / .env
export MONITOR_URL=https://grupp-ett-monitor-api.<account>.workers.dev
export MONITOR_API_SECRET=your-secret-if-set

# Test it
python hooks/monitor_client.py claude "Hello from cloud!"
```

## Step 4: Custom domain (optional)

```bash
# Add custom domain to Pages
npx wrangler pages project add-domain grupp-ett-monitor monitor.fredlingautomation.dev

# Add custom domain to Worker (via Cloudflare dashboard)
# Workers → grupp-ett-monitor-api → Settings → Domains & Routes
```

## Architecture

```
Claude Code hooks
  │ POST /api/monitor/state
  ▼
Cloudflare Worker (grupp-ett-monitor-api)
  │ State in KV (key: "monitor:state")
  │ CORS enabled, optional Bearer auth
  │
  │ GET /api/monitor/state (every 2s)
  ▼
Cloudflare Pages (grupp-ett-monitor)
  │ Static HTML + JS + assets
  │ Polls worker API
  ▼
Browser (dashboard)
```

## Free tier limits

| Resource | Free limit | Our usage |
|----------|-----------|-----------|
| Worker requests | 100,000/day | ~43,200/day @ 2s polling |
| KV reads | 100,000/day | ~43,200/day (polling) |
| KV writes | 1,000/day | ~100-500/day (hook updates) |
| Pages deployments | 500/month | ~1-5/month |

KV writes are the tightest constraint. With a busy agent loop doing ~500 tool uses/day, you're well within the 1,000 write limit.

## Troubleshooting

**Dashboard shows "API unreachable":**
- Check Worker is deployed: `curl https://grupp-ett-monitor-api.<you>.workers.dev/health`
- Check `?api=` param points to the right URL
- Check browser console for CORS errors

**Hooks fail silently:**
- Test manually: `python hooks/monitor_client.py claude "test"`
- Check `MONITOR_URL` is set correctly
- Check `MONITOR_ENABLED` is not `0`

**KV write limit exceeded:**
- Reduce hook frequency (only send on node transitions)
- Add debouncing to monitor_client.py
- Upgrade to Workers Paid ($5/mo) for 10M writes/day

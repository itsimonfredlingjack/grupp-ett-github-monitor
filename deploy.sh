#!/usr/bin/env bash
set -euo pipefail

# Grupp Ett Monitor — One-command deploy
# Usage: ./deploy.sh [worker|pages|all]
# Requires: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars (or .env)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-3eb2d623d569284a2e9a19864f74699e}"
PAGES_PROJECT="ralph-monitor"
WORKER_DIR="$SCRIPT_DIR/worker"
PAGES_DIR="$SCRIPT_DIR/pages"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}▸${NC} $1"; }
ok()  { echo -e "${GREEN}✓${NC} $1"; }
err() { echo -e "${RED}✗${NC} $1" >&2; }

# Load .env if present
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    set -a; source "$SCRIPT_DIR/.env"; set +a
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    err "CLOUDFLARE_API_TOKEN not set"
    echo ""
    echo "Set it in .env or environment:"
    echo "  export CLOUDFLARE_API_TOKEN=your_token_here"
    echo ""
    echo "Get a token: https://dash.cloudflare.com/profile/api-tokens"
    echo "  → Create Token → Edit Cloudflare Workers template"
    exit 1
fi

export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"

deploy_worker() {
    log "Deploying Worker API..."
    cd "$WORKER_DIR"
    [[ -d node_modules ]] || npm install --silent
    npx wrangler deploy 2>&1
    ok "Worker deployed → https://grupp-ett-monitor-api.fredlingjacksimon.workers.dev"
}

deploy_pages() {
    log "Deploying Pages dashboard..."
    npx wrangler pages deploy "$PAGES_DIR" --project-name="$PAGES_PROJECT" 2>&1
    ok "Pages deployed → https://ralph-monitor.pages.dev/monitor"
}

TARGET="${1:-all}"

case "$TARGET" in
    worker) deploy_worker ;;
    pages)  deploy_pages ;;
    all)    deploy_worker; echo ""; deploy_pages ;;
    *)      echo "Usage: $0 [worker|pages|all]"; exit 1 ;;
esac

echo ""
ok "Dashboard: https://ralph-monitor.pages.dev/monitor"
ok "Worker API: https://grupp-ett-monitor-api.fredlingjacksimon.workers.dev/health"
echo ""
log "Test: curl -X POST https://grupp-ett-monitor-api.fredlingjacksimon.workers.dev/api/monitor/state -H 'Content-Type: application/json' -d '{\"node\":\"claude\",\"state\":\"active\",\"message\":\"Hello!\"}'"

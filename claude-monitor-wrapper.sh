#!/bin/bash

# Claude Code Monitoring Wrapper
# Intercepts Claude Code output and sends state updates to Flask monitoring API
# Usage: ./claude-monitor-wrapper.sh "your prompt here"

# Configuration
API_URL="${MONITOR_API_URL:-http://localhost:5000/api/monitor/state}"
LOG_FILE="${HOME}/.claude-monitor.log"
TIMEOUT=5  # Timeout for curl requests in seconds

# Color output for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Initialize log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Claude Monitor Wrapper started with args: $*" >> "$LOG_FILE"

# Function to send state update to API
send_state_update() {
    local node=$1
    local message=$2

    local payload=$(cat <<EOF
{
    "node": "$node",
    "state": "active",
    "message": "$message"
}
EOF
)

    # Send to API in background, ignore errors
    timeout $TIMEOUT curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "$payload" > /dev/null 2>&1 &

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sent: node=$node, message=$message" >> "$LOG_FILE"
}

# Pattern matching function to detect node transitions
detect_node() {
    local line=$1

    # Git operations (highest priority)
    if [[ "$line" =~ (git\ commit|git\ push|Committing|github|pushing) ]]; then
        echo "github"
    # Testing operations
    elif [[ "$line" =~ (Running\ tests|pytest|npm\ test|Build|test|Testing) ]]; then
        echo "actions"
    # Writing operations
    elif [[ "$line" =~ (Writing|Writing\ to|Creating|Editing|Edit|Write|edit|create) ]]; then
        echo "claude"
    # Code review
    elif [[ "$line" =~ (Reviewing|Code\ review|review|Review) ]]; then
        echo "jules"
    # Reading/analysis operations (lowest priority)
    elif [[ "$line" =~ (Reading|Analyzing|Fetching|Analyze|Fetch|Reading) ]]; then
        echo "jira"
    else
        echo ""
    fi
}

# Main monitoring loop
# Execute the command passed as arguments and capture output
"$@" 2>&1 | while IFS= read -r line; do
    # Always print the original line (transparent wrapper)
    echo "$line"

    # Skip empty lines
    if [ -z "$line" ]; then
        continue
    fi

    # Detect node from line
    node=$(detect_node "$line")

    # If a node was detected, send update (truncate long messages)
    if [ -n "$node" ]; then
        message="${line:0:200}"  # Limit to 200 chars
        send_state_update "$node" "$message"
    fi
done

# Log completion
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Claude Monitor Wrapper completed" >> "$LOG_FILE"

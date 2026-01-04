#!/bin/bash
# Claude Code Hook - Slack Approval
# Waits for Slack approval results via SSE streaming
#
# Usage:
#   approval-hook.sh --bot-token <token> --app-token <token> --user-id <id> [--port <port>] [--log-level <level>] [--require-screen-lock true|false] [--test]

set -e

# Parse arguments
SLACK_BOT_TOKEN=""
SLACK_APP_TOKEN=""
SLACK_USER_ID=""
APPROVAL_PORT="4698"
LOG_LEVEL="info"
TEST_MODE=""
REQUIRE_SCREEN_LOCK="true"

while [[ $# -gt 0 ]]; do
    case $1 in
        --bot-token|-b) SLACK_BOT_TOKEN="$2"; shift 2 ;;
        --app-token|-a) SLACK_APP_TOKEN="$2"; shift 2 ;;
        --user-id|-u) SLACK_USER_ID="$2"; shift 2 ;;
        --port|-p) APPROVAL_PORT="$2"; shift 2 ;;
        --log-level|-l) LOG_LEVEL="$2"; shift 2 ;;
        --test|-t) TEST_MODE="--test"; shift ;;
        --require-screen-lock) REQUIRE_SCREEN_LOCK="$2"; shift 2 ;;
        *) shift ;;
    esac
done

APPROVAL_URL="http://localhost:${APPROVAL_PORT}/approve"
HEALTH_URL="http://localhost:${APPROVAL_PORT}/health"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
BIN_PATH="$SERVER_DIR/dist/bin/claude-slack-hook"

# Debug logging
DEBUG_LOG="$SERVER_DIR/hook-debug.log"
debug() { echo "[$(date '+%H:%M:%S')] $*" >> "$DEBUG_LOG"; }

# Test mode: execute binary directly and exit
if [[ -n "$TEST_MODE" ]]; then
    if [[ -z "$SLACK_BOT_TOKEN" || -z "$SLACK_APP_TOKEN" || -z "$SLACK_USER_ID" ]]; then
        echo "Usage: $0 --bot-token <token> --app-token <token> --user-id <id> --test"
        exit 1
    fi
    exec "$BIN_PATH" \
        --bot-token "$SLACK_BOT_TOKEN" \
        --app-token "$SLACK_APP_TOKEN" \
        --user-id "$SLACK_USER_ID" \
        --port "$APPROVAL_PORT" \
        --log-level "$LOG_LEVEL" \
        --test
fi

# Read stdin
INPUT=$(cat)
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // "PermissionRequest"')

# Skip processing if screen is not locked (when require-screen-lock is enabled)
is_screen_locked() {
  local state=$(/usr/libexec/PlistBuddy -c "print :IOConsoleUsers:0:CGSSessionScreenIsLocked" /dev/stdin 2>/dev/null <<< "$(ioreg -n Root -d1 -a)")
  [ "$state" = "true" ]
}
if [[ "$REQUIRE_SCREEN_LOCK" == "true" ]]; then
  is_screen_locked || exit 0
fi

# Check if server is running
is_server_running() {
    curl -s --max-time 2 "${HEALTH_URL}" > /dev/null 2>&1
}

# Start server
start_server() {
    [[ ! -x "$BIN_PATH" ]] && {
        debug "Binary not found: $BIN_PATH"
        return 1
    }

    if [[ -z "$SLACK_BOT_TOKEN" || -z "$SLACK_APP_TOKEN" || -z "$SLACK_USER_ID" ]]; then
        debug "Missing required parameters"
        return 1
    fi

    nohup "$BIN_PATH" \
        --bot-token "$SLACK_BOT_TOKEN" \
        --app-token "$SLACK_APP_TOKEN" \
        --user-id "$SLACK_USER_ID" \
        --port "$APPROVAL_PORT" \
        --log-level "$LOG_LEVEL" \
        >> "$SERVER_DIR/server.log" 2>&1 &

    for i in {1..10}; do
        sleep 1
        is_server_running && return 0
    done
    return 1
}

# Output nothing, let Claude Code handle it on its own
fallback() {
    debug "fallback: $1"
    exit 0
}

# Ensure server is running
if ! is_server_running; then
    start_server || fallback "Failed to start server"
fi

debug "=== New request ==="
debug "INPUT: $INPUT"

# Send request and wait for SSE result
RESULT=$(curl -sN \
    -X POST "${APPROVAL_URL}" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream" \
    -d "${INPUT}" 2>&1) || fallback "Connection lost"

debug "RESULT: $RESULT"

# Parse SSE result
FINAL_DATA=$(echo "$RESULT" | grep -A1 '^event: result' | grep '^data:' | sed 's/^data: *//')

debug "FINAL_DATA: $FINAL_DATA"

if [[ -n "$FINAL_DATA" ]] && echo "$FINAL_DATA" | jq -e . > /dev/null 2>&1; then
    debug "Output valid JSON"
    echo "$FINAL_DATA"
else
    debug "Invalid response, falling back"
    fallback "Invalid response"
fi

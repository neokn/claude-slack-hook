#!/bin/bash
# Claude Code Hook - Slack Approval
# 透過 SSE 串流等待 Slack 審批結果
#
# Usage:
#   approval-hook.sh --bot-token <token> --app-token <token> --user-id <id> [--port <port>] [--log-level <level>] [--test]

set -e

# 解析參數
SLACK_BOT_TOKEN=""
SLACK_APP_TOKEN=""
SLACK_USER_ID=""
APPROVAL_PORT="4698"
LOG_LEVEL="info"
TEST_MODE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --bot-token|-b) SLACK_BOT_TOKEN="$2"; shift 2 ;;
        --app-token|-a) SLACK_APP_TOKEN="$2"; shift 2 ;;
        --user-id|-u) SLACK_USER_ID="$2"; shift 2 ;;
        --port|-p) APPROVAL_PORT="$2"; shift 2 ;;
        --log-level|-l) LOG_LEVEL="$2"; shift 2 ;;
        --test|-t) TEST_MODE="--test"; shift ;;
        *) shift ;;
    esac
done

APPROVAL_URL="http://localhost:${APPROVAL_PORT}/approve"
HEALTH_URL="http://localhost:${APPROVAL_PORT}/health"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
BIN_PATH="$SERVER_DIR/dist/bin/claude-slack-hook"

# 調試日誌
DEBUG_LOG="$SERVER_DIR/hook-debug.log"
debug() { echo "[$(date '+%H:%M:%S')] $*" >> "$DEBUG_LOG"; }

# 測試模式：直接執行 binary 並退出
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

# 讀取 stdin
INPUT=$(cat)
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // "PermissionRequest"')

# 螢幕未鎖定時不處理
is_screen_locked() {
  local state=$(/usr/libexec/PlistBuddy -c "print :IOConsoleUsers:0:CGSSessionScreenIsLocked" /dev/stdin 2>/dev/null <<< "$(ioreg -n Root -d1 -a)")
  [ "$state" = "true" ]
}
is_screen_locked || exit 0

# 檢查 server 是否運行
is_server_running() {
    curl -s --max-time 2 "${HEALTH_URL}" > /dev/null 2>&1
}

# 啟動 server
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

# 不輸出任何東西，讓 Claude Code 自己處理
fallback() {
    debug "fallback: $1"
    exit 0
}

# 確保 server 運行
if ! is_server_running; then
    start_server || fallback "無法啟動服務"
fi

debug "=== New request ==="
debug "INPUT: $INPUT"

# 發送請求並等待 SSE 結果
RESULT=$(curl -sN \
    -X POST "${APPROVAL_URL}" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream" \
    -d "${INPUT}" 2>&1) || fallback "連線中斷"

debug "RESULT: $RESULT"

# 解析 SSE 結果
FINAL_DATA=$(echo "$RESULT" | grep -A1 '^event: result' | grep '^data:' | sed 's/^data: *//')

debug "FINAL_DATA: $FINAL_DATA"

if [[ -n "$FINAL_DATA" ]] && echo "$FINAL_DATA" | jq -e . > /dev/null 2>&1; then
    debug "Output valid JSON"
    echo "$FINAL_DATA"
else
    debug "Invalid response, falling back"
    fallback "無效回應"
fi

#!/bin/bash
#
# Context Management Tool Logging Hook
# Triggered on: PostToolUse (after any tool execution)
# Purpose: Log tool calls to context.session_events table
#
# Works alongside memori-record-work.sh (does not replace it)
#

# Non-blocking execution
set +e

# Consume stdin (Claude Code passes event payload via stdin)
EVENT_PAYLOAD="$(cat 2>/dev/null || true)"

# Environment setup
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "$CLAUDE_PROJECT_DIR" ]; then
    PROJECT_DIR="$CLAUDE_PROJECT_DIR"
else
    PROJECT_DIR="$(dirname $(dirname "$SCRIPT_DIR"))"
fi

SESSION_STATE_FILE="$HOME/.claude/context_session_state.json"
LOG_FILE="$PROJECT_DIR/.memori/session.log"

# Function to log with timestamp
log() {
    echo "[$(date -Iseconds)] [context] $1" >> "$LOG_FILE" 2>/dev/null
}

# Only log if session is active
if [ ! -f "$SESSION_STATE_FILE" ]; then
    exit 0
fi

# Get tool name from event payload or environment
TOOL_NAME=""
if command -v jq >/dev/null 2>&1 && [ -n "$EVENT_PAYLOAD" ]; then
    TOOL_NAME=$(printf '%s' "$EVENT_PAYLOAD" | jq -r '.tool_name // .tool // empty' 2>/dev/null)
fi
TOOL_NAME="${TOOL_NAME:-${CLAUDE_TOOL_NAME:-${1:-unknown}}}"

# Skip logging for certain read-only tools to reduce noise
case "$TOOL_NAME" in
    Read|Glob|Grep|LS|WebSearch|WebFetch)
        # Skip read-only tools - too noisy
        exit 0
        ;;
esac

log "Logging tool call: $TOOL_NAME"

# Log tool call asynchronously (non-blocking)
(
    cd "$PROJECT_DIR" && \
    .venv/bin/python -m lib.context.hooks log_tool_call "$TOOL_NAME" '{}' 2>/dev/null || true
) &

exit 0

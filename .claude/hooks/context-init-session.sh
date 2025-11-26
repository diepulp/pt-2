#!/bin/bash
#
# Context Management Session Initialization Hook
# Triggered on: UserPromptSubmit (first user prompt)
# Purpose: Initialize session tracking in context.sessions table
#
# Works alongside memori-init-session.sh (does not replace it)
#

set -e

# Consume stdin (Claude Code passes event payload via stdin)
# We don't need the payload, but must consume it to avoid blocking
cat > /dev/null 2>&1 || true

# Environment setup
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "$CLAUDE_PROJECT_DIR" ]; then
    PROJECT_DIR="$CLAUDE_PROJECT_DIR"
else
    PROJECT_DIR="$(dirname $(dirname "$SCRIPT_DIR"))"
fi

SESSION_STATE_FILE="$HOME/.claude/context_session_state.json"
CHATMODE="${CLAUDE_CHATMODE:-main}"
WORKFLOW="${CLAUDE_WORKFLOW:-}"
SKILL="${CLAUDE_SKILL:-}"
LOG_FILE="$PROJECT_DIR/.memori/session.log"

# Create directories if needed
mkdir -p "$HOME/.claude"
mkdir -p "$PROJECT_DIR/.memori"

# Function to log with timestamp
log() {
    echo "[$(date -Iseconds)] [context] $1" >> "$LOG_FILE" 2>/dev/null
}

# Check if context session already initialized
if [ -f "$SESSION_STATE_FILE" ]; then
    # Check if session is recent (within last 4 hours)
    if [ -n "$(find "$SESSION_STATE_FILE" -mmin -240 2>/dev/null)" ]; then
        log "Context session already active (chatmode: $CHATMODE)"
        exit 0
    fi
fi

log "Initializing new context session for chatmode: $CHATMODE"

# Map chatmode to user_id namespace
case "$CHATMODE" in
    architect) USER_ID="pt2_architect" ;;
    service-engineer) USER_ID="service_engineer" ;;
    documenter) USER_ID="pt2_documenter" ;;
    backend-dev) USER_ID="pt2_backend" ;;
    frontend-dev) USER_ID="pt2_frontend" ;;
    reviewer) USER_ID="pt2_reviewer" ;;
    *) USER_ID="pt2_agent" ;;
esac

# Initialize context session via Python CLI
SESSION_ID=$(
    cd "$PROJECT_DIR" && \
    .venv/bin/python -m lib.context.hooks session_start "$CHATMODE" "$USER_ID" "$WORKFLOW" 2>/dev/null
)

if [ -n "$SESSION_ID" ]; then
    log "Context session started: $SESSION_ID (chatmode: $CHATMODE, user: $USER_ID)"
    echo "Session tracking enabled ($CHATMODE)" >&2
else
    log "Context session initialization failed (graceful degradation)"
fi

exit 0

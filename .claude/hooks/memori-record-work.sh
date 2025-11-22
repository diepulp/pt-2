#!/bin/bash
#
# Memori Work Recording Hook
# Triggered on: PostToolUse (after Write/Edit/Bash)
# Purpose: Automatically record agent work to Memori
#

# Non-blocking execution (don't fail if recording fails)
set +e

# Environment setup
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "$CLAUDE_PROJECT_DIR" ]; then
    PROJECT_DIR="$CLAUDE_PROJECT_DIR"
else
    PROJECT_DIR="$(dirname $(dirname "$SCRIPT_DIR"))"
fi

SESSION_FILE="$PROJECT_DIR/.memori/.session_active"
CHATMODE="${CLAUDE_CHATMODE:-main}"
LOG_FILE="$PROJECT_DIR/.memori/session.log"

# Function to log with timestamp
log() {
    echo "[$(date -Iseconds)] $1" >> "$LOG_FILE" 2>/dev/null
}

# Only record if session is active
if [ ! -f "$SESSION_FILE" ]; then
    # Session not initialized - skip recording
    exit 0
fi

# Check if session is unavailable (failed initialization)
if grep -q '"status": "unavailable"' "$SESSION_FILE" 2>/dev/null; then
    # Memori unavailable - skip recording
    exit 0
fi

# Get tool information from arguments
TOOL_NAME="${1:-unknown}"

log "Recording work: tool=$TOOL_NAME, chatmode=$CHATMODE"

# Call Python auto-recording helper (async, non-blocking)
# Pass tool data via stdin if available
(
    python3 "$PROJECT_DIR/lib/memori/hooks/auto_record.py" \
        --tool "$TOOL_NAME" \
        --chatmode "$CHATMODE" \
        --stdin 2>/dev/null || true
) &

# Don't wait for recording to complete (async)
exit 0

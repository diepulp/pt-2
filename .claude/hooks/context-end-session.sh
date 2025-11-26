#!/bin/bash
#
# Context Management Session End Hook
# Triggered on: Manual call or /end-session command
# Purpose: End session and trigger memory generation pipeline
#
# Note: Claude Code doesn't have a built-in session end event.
# This hook can be called manually or via slash command.
#

set -e

# Consume stdin if any
cat > /dev/null 2>&1 || true

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

# Check if session is active
if [ ! -f "$SESSION_STATE_FILE" ]; then
    echo "No active context session to end" >&2
    exit 0
fi

log "Ending context session and triggering memory pipeline"

# End session via Python CLI (triggers memory generation)
cd "$PROJECT_DIR" && \
.venv/bin/python -m lib.context.hooks session_end 2>/dev/null

if [ $? -eq 0 ]; then
    # Clean up session state file
    rm -f "$SESSION_STATE_FILE"
    log "Context session ended successfully"
    echo "Session ended, memories extracted" >&2
else
    log "Context session end failed"
fi

exit 0

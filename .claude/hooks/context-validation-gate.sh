#!/bin/bash
#
# Context Management Validation Gate Hook
# Triggered on: Manual call when validation gate passed
# Purpose: Log validation gate and trigger memory extraction checkpoint
#
# Usage: context-validation-gate.sh <gate_number> [description]
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

# Get arguments
GATE_NUMBER="${1:-1}"
DESCRIPTION="${2:-Validation gate passed}"

# Check if session is active
if [ ! -f "$SESSION_STATE_FILE" ]; then
    log "No active context session for validation gate"
    exit 0
fi

log "Validation gate $GATE_NUMBER passed: $DESCRIPTION"

# Log validation gate via Python CLI (triggers memory extraction)
cd "$PROJECT_DIR" && \
.venv/bin/python -m lib.context.hooks validation_gate "$GATE_NUMBER" "$DESCRIPTION" 2>/dev/null

if [ $? -eq 0 ]; then
    log "Validation gate $GATE_NUMBER recorded, checkpoint created"
    echo "Gate $GATE_NUMBER checkpoint saved" >&2
else
    log "Validation gate logging failed"
fi

exit 0

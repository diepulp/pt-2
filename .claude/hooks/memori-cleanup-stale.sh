#!/bin/bash
#
# Memori Stale Session Cleanup Hook
# Triggered by: Cron job (run hourly or manually)
# Purpose: Finalize sessions that are >2 hours old
#

set -e

# Environment setup
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "$CLAUDE_PROJECT_DIR" ]; then
    PROJECT_DIR="$CLAUDE_PROJECT_DIR"
else
    PROJECT_DIR="$(dirname $(dirname "$SCRIPT_DIR"))"
fi

SESSION_FILE="$PROJECT_DIR/.memori/.session_active"
LOG_FILE="$PROJECT_DIR/.memori/session.log"

# Function to log with timestamp
log() {
    echo "[$(date -Iseconds)] $1" >> "$LOG_FILE"
}

# Check if session file exists
if [ ! -f "$SESSION_FILE" ]; then
    # No active session
    exit 0
fi

# Check if session is unavailable (failed initialization)
if grep -q '"status": "unavailable"' "$SESSION_FILE" 2>/dev/null; then
    # Just clean up the placeholder file
    rm -f "$SESSION_FILE"
    log "Cleaned up unavailable session marker"
    exit 0
fi

# Extract session start time
START_TIME=$(grep -oP '"started_at":\s*"\K[^"]+' "$SESSION_FILE" 2>/dev/null || echo "")

if [ -z "$START_TIME" ]; then
    # Invalid session file - remove it
    log "⚠️  Invalid session file, removing"
    rm -f "$SESSION_FILE"
    exit 0
fi

# Calculate session age in seconds
NOW=$(date +%s)
START=$(date -d "$START_TIME" +%s 2>/dev/null || echo "0")
AGE=$((NOW - START))

# Session age threshold: 2 hours (7200 seconds)
THRESHOLD=7200

log "Session age check: ${AGE}s (threshold: ${THRESHOLD}s)"

# If session is older than threshold, finalize it
if [ $AGE -gt $THRESHOLD ]; then
    log "Finalizing stale session (age: ${AGE}s)"

    # Extract chatmode
    CHATMODE=$(grep -oP '"chatmode":\s*"\K[^"]+' "$SESSION_FILE" 2>/dev/null || echo "main")

    # Call session_hooks.py to finalize
    if python3 "$PROJECT_DIR/lib/memori/session_hooks.py" end --chatmode "$CHATMODE" 2>/dev/null; then
        log "✅ Stale session finalized successfully"
    else
        log "⚠️  Failed to finalize stale session, removing marker anyway"
    fi

    # Remove session file
    rm -f "$SESSION_FILE"
else
    log "Session is active (age: ${AGE}s)"
fi

exit 0

#!/bin/bash
#
# Memori Session Initialization Hook
# Triggered on: UserPromptSubmit (first user prompt)
# Purpose: Automatically initialize Memori for cross-session memory
#

set -e

# Environment setup
# Use CLAUDE_PROJECT_DIR if set, otherwise derive from script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "$CLAUDE_PROJECT_DIR" ]; then
    PROJECT_DIR="$CLAUDE_PROJECT_DIR"
else
    # Script is in .claude/hooks, so project root is two levels up
    PROJECT_DIR="$(dirname $(dirname "$SCRIPT_DIR"))"
fi

SESSION_FILE="$PROJECT_DIR/.memori/.session_active"
CHATMODE="${CLAUDE_CHATMODE:-main}"
LOG_FILE="$PROJECT_DIR/.memori/session.log"

# Create .memori directory if it doesn't exist
mkdir -p "$PROJECT_DIR/.memori"

# Function to log with timestamp
log() {
    echo "[$(date -Iseconds)] $1" >> "$LOG_FILE"
}

# Check if session already initialized
if [ -f "$SESSION_FILE" ]; then
    # Session already active, nothing to do
    log "Session already initialized (chatmode: $CHATMODE)"
    exit 0
fi

log "Initializing new Memori session for chatmode: $CHATMODE"

# Initialize Memori via Python hooks
if python3 "$PROJECT_DIR/lib/memori/session_hooks.py" start --chatmode "$CHATMODE" 2>/dev/null; then
    # Create session state file
    SESSION_ID="session_$(date +%Y%m%d_%H%M%S)"

    cat > "$SESSION_FILE" <<EOF
{
  "session_id": "$SESSION_ID",
  "chatmode": "$CHATMODE",
  "started_at": "$(date -Iseconds)",
  "pid": $$
}
EOF

    log "✅ Memori initialized successfully (session_id: $SESSION_ID)"

    # Non-blocking success notification (optional)
    echo "🧠 Memori memory enabled for $CHATMODE" >&2
else
    # Memori initialization failed - continue without memory (graceful degradation)
    log "⚠️  Memori initialization failed, continuing without memory"

    # Create placeholder file to prevent retry
    echo '{"status": "unavailable"}' > "$SESSION_FILE"
fi

exit 0

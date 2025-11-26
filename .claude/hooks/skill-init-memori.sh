#!/bin/bash
#
# Skill Memory Initialization Hook
# Triggered on: PreToolUse (Skill tool)
# Purpose: Initialize Memori for skill-specific namespace
#

set -e

# Read tool input from stdin
INPUT=$(cat)

# Extract skill name from input
SKILL_NAME=$(echo "$INPUT" | grep -oP '"skill"\s*:\s*"\K[^"]+' || echo "")

if [ -z "$SKILL_NAME" ]; then
    exit 0
fi

# Environment setup
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "$CLAUDE_PROJECT_DIR" ]; then
    PROJECT_DIR="$CLAUDE_PROJECT_DIR"
else
    PROJECT_DIR="$(dirname $(dirname "$SCRIPT_DIR"))"
fi

LOG_FILE="$PROJECT_DIR/.memori/session.log"
mkdir -p "$PROJECT_DIR/.memori"

# Function to log with timestamp
log() {
    echo "[$(date -Iseconds)] [skill] $1" >> "$LOG_FILE" 2>/dev/null
}

log "Skill invoked: $SKILL_NAME"

# Map skill name to namespace
case "$SKILL_NAME" in
    backend-service-builder) USER_ID="skill_backend_service_builder" ;;
    frontend-design) USER_ID="skill_frontend_design" ;;
    lead-architect) USER_ID="skill_lead_architect" ;;
    skill-creator) USER_ID="skill_creator" ;;
    *) USER_ID="skill_${SKILL_NAME//-/_}" ;;  # Default: skill_<name>
esac

# Export for downstream use
export CLAUDE_SKILL="$SKILL_NAME"
export CLAUDE_SKILL_NAMESPACE="$USER_ID"

# Initialize Memori for skill namespace via Python
INIT_RESULT=$(
    cd "$PROJECT_DIR" && \
    .venv/bin/python -c "
from lib.memori import create_memori_client
try:
    client = create_memori_client('skill:$SKILL_NAME')
    client.enable()
    print('enabled')
except Exception as e:
    print(f'error: {e}')
" 2>/dev/null || echo "unavailable"
)

if [ "$INIT_RESULT" = "enabled" ]; then
    log "✅ Memori enabled for skill: $SKILL_NAME (namespace: $USER_ID)"
    echo "🧠 Skill memory: $SKILL_NAME" >&2
else
    log "⚠️  Skill Memori init failed: $INIT_RESULT"
fi

exit 0

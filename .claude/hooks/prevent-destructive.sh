#!/usr/bin/env bash
# =============================================================================
# Destructive Command Guard
# =============================================================================
# Blocks commands that can cause irreversible data loss.
#
# Categories:
#   - File system: rm -rf, shred
#   - Database: supabase db reset, DROP, TRUNCATE
#   - Git: reset --hard, clean -fd, push --force to main
#   - Docker: system prune, volume rm
#
# To bypass (with explicit user approval):
#   1. User must manually run the command outside Claude Code
#   2. Or temporarily disable this hook in settings.local.json
#
# Incident: 2025-12-02 - supabase db reset destroyed memori schema
# =============================================================================
set -euo pipefail

EVENT_PAYLOAD="$(cat)"

if [[ -z "${EVENT_PAYLOAD}" ]]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[prevent-destructive] jq not available; cannot inspect command. Allowing execution." >&2
  exit 0
fi

COMMAND=$(printf '%s' "${EVENT_PAYLOAD}" | jq -r '.tool_input.command // empty')

if [[ -z "${COMMAND}" ]]; then
  exit 0
fi

# Convert to lowercase for case-insensitive matching
COMMAND_LOWER=$(echo "${COMMAND}" | tr '[:upper:]' '[:lower:]')

# =============================================================================
# BLOCKLIST: Patterns that are ALWAYS blocked (regex)
# =============================================================================
declare -a BLOCKLIST=(
  # --- File System Destructive ---
  "rm -rf /"                    # Wipe root
  "rm -rf ~"                    # Wipe home directory
  "rm -rf \\."                  # Wipe current directory
  "rm -rf \\*"                  # Wipe all files
  "rm -rf supabase/"            # Wipe supabase directory (migrations, seed)
  "rm -rf \\.claude/"           # Wipe claude config/hooks
  "rm -rf migrations"           # Wipe migrations
  "shred"                       # Secure delete (unrecoverable)

  # --- Database Destructive (Supabase/PostgreSQL) ---
  "supabase db reset"           # Drops ENTIRE database including all schemas
  "npx supabase db reset"       # Same via npx
  "drop database"               # SQL drop database
  "drop schema"                 # SQL drop schema (memori, context, etc.)
  "drop table"                  # SQL drop table
  "truncate .* cascade"         # Cascade truncate (propagates deletions)

  # --- Git Destructive ---
  "git reset --hard"            # Discards all uncommitted changes
  "git clean -fd"               # Removes all untracked files
  "git push.*--force.*main"     # Force push to main
  "git push.*--force.*master"   # Force push to master
  "git push.*-f.*main"          # Short form force push to main
  "git push.*-f.*master"        # Short form force push to master
  "git branch -D main"          # Delete main branch
  "git branch -D master"        # Delete master branch

  # --- Docker Destructive ---
  "docker system prune -a"      # Remove all unused images, containers, networks
  "docker volume rm"            # Remove volumes (data loss)
  "docker volume prune"         # Remove all unused volumes
)

# =============================================================================
# Check against blocklist
# =============================================================================
for pattern in "${BLOCKLIST[@]}"; do
  if [[ "${COMMAND_LOWER}" =~ ${pattern} ]]; then
    cat <<EOF >&2

╔══════════════════════════════════════════════════════════════════════════════╗
║  ⛔ DESTRUCTIVE COMMAND BLOCKED                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Pattern matched: ${pattern}
║
║  Command: ${COMMAND}
║
║  This command can cause irreversible data loss.
║
║  To proceed:
║    1. Run the command manually in your terminal (outside Claude Code)
║    2. Or disable this hook temporarily in .claude/settings.local.json
║
║  See: .claude/hooks/prevent-destructive.sh for full blocklist
╚══════════════════════════════════════════════════════════════════════════════╝

EOF
    exit 2
  fi
done

# =============================================================================
# WARNLIST: Patterns that show a warning but allow execution
# =============================================================================
declare -a WARNLIST=(
  "truncate"                    # Truncate without cascade (less dangerous)
  "supabase stop"               # Stops services (not destructive, but disruptive)
  "docker rm"                   # Remove container
  "git stash drop"              # Drop stashed changes
  "npm cache clean"             # Clear npm cache
)

for pattern in "${WARNLIST[@]}"; do
  if [[ "${COMMAND_LOWER}" =~ ${pattern} ]]; then
    cat <<EOF >&2
[prevent-destructive] ⚠️  Warning: Potentially disruptive command detected.
Pattern: ${pattern}
Command: ${COMMAND}
Proceeding with caution...
EOF
    # Don't exit - allow execution with warning
    break
  fi
done

exit 0

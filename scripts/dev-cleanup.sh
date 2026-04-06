#!/bin/bash
# Clean up zombie/stopped dev processes, orphaned MCP servers, and free ports
# Safe to run anytime — skips the current Claude session and its children
#
# Usage:
#   ./scripts/dev-cleanup.sh             # kill stale processes
#   ./scripts/dev-cleanup.sh --dry-run   # preview only

set -uo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# --- Identify current Claude session to protect it and its children ---
CURRENT_CLAUDE_PID=""
_pid=$$
while [[ "$_pid" -gt 1 ]]; do
  _cmd=$(ps -o cmd= -p "$_pid" 2>/dev/null || true)
  if [[ "$_cmd" == *claude* ]]; then
    CURRENT_CLAUDE_PID="$_pid"
  fi
  _pid=$(ps -o ppid= -p "$_pid" 2>/dev/null | tr -d ' ')
  [[ -z "$_pid" ]] && break
done

# Build set of PIDs to protect (current Claude + all descendants)
declare -A PROTECTED_PIDS
if [[ -n "$CURRENT_CLAUDE_PID" ]]; then
  PROTECTED_PIDS[$CURRENT_CLAUDE_PID]=1
  # Collect all descendant PIDs recursively
  _collect_descendants() {
    local parent=$1
    for child in $(ps -o pid= --ppid "$parent" 2>/dev/null | tr -d ' '); do
      PROTECTED_PIDS[$child]=1
      _collect_descendants "$child"
    done
  }
  _collect_descendants "$CURRENT_CLAUDE_PID"
fi

killed=0
reclaimed_kb=0

safe_kill() {
  local pid=$1 label=$2
  if [[ -n "${PROTECTED_PIDS[$pid]+x}" ]]; then
    return
  fi
  local rss
  rss=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ')
  rss=${rss:-0}
  if $DRY_RUN; then
    echo "[dry-run] would kill PID $pid ($((rss / 1024)) MB) — $label"
  else
    kill -9 "$pid" 2>/dev/null && echo "killed PID $pid ($((rss / 1024)) MB) — $label" && ((killed++)) && ((reclaimed_kb += rss)) || true
  fi
}

# --- 1. Stopped/zombie next-server and next dev processes ---
for pid in $(ps -eo pid,state,cmd | awk '$2 ~ /[TZ]/ && $0 ~ /next-server|node.*next.*dev/ && $0 !~ /dev-cleanup/ {print $1}'); do
  safe_kill "$pid" "stopped/zombie next process"
done

# --- 2. Stopped npm run dev (catches parent npm processes) ---
for pid in $(ps -eo pid,state,cmd | awk '$2 ~ /[TZ]/ && $0 ~ /npm run dev/ && $0 !~ /dev-cleanup/ {print $1}'); do
  safe_kill "$pid" "stopped npm run dev"
done

# --- 3. Stale Claude sessions (stopped state, not current session) ---
for pid in $(ps -eo pid,state,cmd | awk '$2 == "T" && $0 ~ /claude/ && $0 !~ /dev-cleanup/ {print $1}'); do
  safe_kill "$pid" "stale stopped claude session"
done

# --- 4. Orphaned MCP servers from dead/stopped Claude sessions ---
# MCP servers are children of Claude processes. If their parent Claude is
# stopped (T) or gone, they're orphaned and should be cleaned up.
for pid in $(ps -eo pid,cmd | awk '$0 ~ /chrome-devtools-mcp|playwright-mcp|mcp-remote|mcp-server-sequential|mcp-filesystem-server/ && $0 !~ /dev-cleanup/ {print $1}'); do
  safe_kill "$pid" "orphaned MCP server"
done

# --- 5. Orphaned MCP npm-exec wrappers ---
for pid in $(ps -eo pid,cmd | awk '$0 ~ /npm exec.*(mcp|playwright)/ && $0 !~ /dev-cleanup/ {print $1}'); do
  safe_kill "$pid" "orphaned MCP npm-exec wrapper"
done

# --- 6. Orphaned tsserver instances from dead Claude sessions ---
# Claude Code spawns its own tsserver pair (full + partial semantic).
# VS Code's tsservers are children of the VS Code utility process (parent chain
# includes /usr/share/code/code). Claude's are children of node launched from
# the project's node_modules. After a Claude session dies, these linger at 1+ GB.
for pid in $(ps -eo pid,ppid,cmd | awk '$0 ~ /tsserver.js/ && $0 ~ /node_modules\/typescript/ && $0 !~ /usr\/share\/code/ {print $1}'); do
  # Only kill if not a descendant of the current Claude session
  safe_kill "$pid" "orphaned tsserver (Claude)"
done

# --- 7. Zombie children (parentless after above kills) ---
for pid in $(ps -eo pid,state | awk '$2 == "Z" {print $1}'); do
  safe_kill "$pid" "zombie process"
done

# --- 8. Kill any process listening on ports 3000-3002 ---
if command -v ss &>/dev/null; then
  ss -tlnp 2>/dev/null | grep -E ':300[0-2]\s' | grep -oP 'pid=\K[0-9]+' | sort -u | while read -r pid; do
    safe_kill "$pid" "port squatter (3000-3002)"
  done
fi

# --- 9. Remove stale Next.js lock file ---
if [[ -f .next/dev/lock ]]; then
  if $DRY_RUN; then
    echo "[dry-run] would remove .next/dev/lock"
  else
    rm -f .next/dev/lock
    echo "removed .next/dev/lock"
  fi
fi

echo ""
if $DRY_RUN; then
  echo "Dry run complete — no processes killed"
else
  echo "Dev cleanup complete — killed $killed process(es), reclaimed ~$((reclaimed_kb / 1024)) MB"
fi

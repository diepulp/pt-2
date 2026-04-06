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

<<<<<<< Updated upstream
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
=======
#!/usr/bin/env bash
set -euo pipefail

# dev-cleanup.sh
# Reclaims memory from stale Claude sessions, lingering Next/Turbopack dev servers,
# and obviously orphaned tsserver processes.
#
# Safe defaults:
# - dry run unless you pass --kill
# - skips tsserver processes still attached to an active VS Code / Cursor parent
# - prefers SIGTERM first, escalates to SIGKILL only with --force
#
# Usage:
#   ./scripts/dev-cleanup.sh           # inspect only
#   ./scripts/dev-cleanup.sh --kill    # terminate safe targets
#   ./scripts/dev-cleanup.sh --kill --force
#   ./scripts/dev-cleanup.sh --verbose

DRY_RUN=1
FORCE=0
VERBOSE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --kill) DRY_RUN=0 ;;
    --force) FORCE=1 ;;
    --verbose|-v) VERBOSE=1 ;;
    --help|-h)
      cat <<'EOF'
Usage:
  dev-cleanup.sh [--kill] [--force] [--verbose]

Options:
  --kill     Actually terminate processes. Default is dry run.
  --force    After SIGTERM, send SIGKILL if process survives.
  --verbose  Print extra diagnostics.
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
  shift
done

log() { printf '%s\n' "$*"; }
vlog() { [[ "$VERBOSE" -eq 1 ]] && printf '%s\n' "$*"; }

have_cmd() { command -v "$1" >/dev/null 2>&1; }

rss_mb() {
  local rss_kb="${1:-0}"
  awk -v kb="$rss_kb" 'BEGIN { printf "%.1f", kb/1024 }'
}

proc_exists() {
  local pid="$1"
  [[ -d "/proc/$pid" ]]
}

get_comm() {
  local pid="$1"
  ps -p "$pid" -o comm= 2>/dev/null | awk '{$1=$1; print}'
}

get_cmd() {
  local pid="$1"
  ps -p "$pid" -o args= 2>/dev/null
}

get_stat() {
  local pid="$1"
  ps -p "$pid" -o stat= 2>/dev/null | awk '{$1=$1; print}'
}

get_ppid() {
  local pid="$1"
  ps -p "$pid" -o ppid= 2>/dev/null | awk '{$1=$1; print}'
}

get_pgid() {
  local pid="$1"
  ps -p "$pid" -o pgid= 2>/dev/null | awk '{$1=$1; print}'
}

get_rss_kb() {
  local pid="$1"
  ps -p "$pid" -o rss= 2>/dev/null | awk '{$1=$1; print}'
}

is_vscode_parent_chain() {
  local pid="$1"
  local depth=0
  while [[ -n "$pid" && "$pid" -gt 1 && "$depth" -lt 8 ]]; do
    local comm
    comm="$(get_comm "$pid" | tr '[:upper:]' '[:lower:]')"
    local cmd
    cmd="$(get_cmd "$pid" | tr '[:upper:]' '[:lower:]')"

    if [[ "$comm" =~ code|cursor ]] || [[ "$cmd" =~ /code|/cursor|cursor ]]; then
      return 0
    fi

    pid="$(get_ppid "$pid")"
    depth=$((depth + 1))
  done
  return 1
}

terminate_pid() {
  local pid="$1"
  local reason="$2"
  local rss_kb
  rss_kb="$(get_rss_kb "$pid")"
  local rss_pretty
  rss_pretty="$(rss_mb "${rss_kb:-0}")"
  local stat
  stat="$(get_stat "$pid")"
  local cmd
  cmd="$(get_cmd "$pid")"

  log ""
  log "Target: PID=$pid RSS=${rss_pretty}MB STAT=${stat:-?}"
  log "Reason: $reason"
  log "Cmd:    $cmd"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Action: dry-run only"
    return 0
  fi

  kill -TERM "$pid" 2>/dev/null || true
  sleep 1

  if proc_exists "$pid"; then
    if [[ "$FORCE" -eq 1 ]]; then
      log "Escalating: SIGKILL -> $pid"
      kill -KILL "$pid" 2>/dev/null || true
      sleep 0.5
    else
      log "Still alive after SIGTERM: $pid"
    fi
  else
    log "Terminated: $pid"
  fi
}

terminate_pgid() {
  local pgid="$1"
  local reason="$2"
  log ""
  log "Target process group: PGID=$pgid"
  log "Reason: $reason"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Action: dry-run only"
    return 0
  fi

  kill -TERM "-$pgid" 2>/dev/null || true
  sleep 1

  if ps -eo pgid= | awk '{$1=$1; print}' | grep -qx "$pgid"; then
    if [[ "$FORCE" -eq 1 ]]; then
      log "Escalating: SIGKILL group -> -$pgid"
      kill -KILL "-$pgid" 2>/dev/null || true
      sleep 0.5
    else
      log "Group still alive after SIGTERM: -$pgid"
    fi
  else
    log "Terminated group: -$pgid"
  fi
}

log "=== dev-cleanup ==="
[[ "$DRY_RUN" -eq 1 ]] && log "Mode: dry run" || log "Mode: kill"
[[ "$FORCE" -eq 1 ]] && log "Force: enabled"

# ------------------------------------------------------------
# 1) Stale / stopped Claude sessions
# Heuristic:
# - command contains "claude"
# - state contains T (stopped/backgrounded)
# ------------------------------------------------------------
log ""
log "--- Scanning stale Claude sessions ---"

CLAUDE_FOUND=0
while read -r pid stat rss cmd; do
  [[ -z "${pid:-}" ]] && continue
  CLAUDE_FOUND=1
  terminate_pid "$pid" "stale/stopped Claude session"
done < <(
  ps -eo pid=,stat=,rss=,args= |
    awk '
      {
        pid=$1; stat=$2; rss=$3;
        $1=""; $2=""; $3="";
        sub(/^[[:space:]]+/, "", $0);
        cmd=$0;
        if (cmd ~ /(^|[\/[:space:]])claude([[:space:]]|$)/ && stat ~ /T/) {
          print pid, stat, rss, cmd;
        }
      }
    '
)

[[ "$CLAUDE_FOUND" -eq 0 ]] && log "No stale/stopped Claude sessions found."

# ------------------------------------------------------------
# 2) Lingering Next / Turbopack process groups
# We kill the process GROUP so orphan children/watchers also die.
# ------------------------------------------------------------
log ""
log "--- Scanning lingering Next/Turbopack dev servers ---"

declare -A seen_pgids=()
NEXT_FOUND=0

while read -r pid pgid stat rss cmd; do
  [[ -z "${pid:-}" || -z "${pgid:-}" ]] && continue
  [[ -n "${seen_pgids[$pgid]:-}" ]] && continue
  seen_pgids["$pgid"]=1
  NEXT_FOUND=1
  terminate_pgid "$pgid" "lingering Next/Turbopack dev server group (PID $pid)"
done < <(
  ps -eo pid=,pgid=,stat=,rss=,args= |
    awk '
      {
        pid=$1; pgid=$2; stat=$3; rss=$4;
        $1=""; $2=""; $3=""; $4="";
        sub(/^[[:space:]]+/, "", $0);
        cmd=$0;
        if (cmd ~ /next-server/ || cmd ~ /node.*next.*dev/ || cmd ~ /turbopack/) {
          print pid, pgid, stat, rss, cmd;
        }
      }
    '
)

[[ "$NEXT_FOUND" -eq 0 ]] && log "No lingering Next/Turbopack groups found."

# ------------------------------------------------------------
# 3) Orphan-ish tsserver processes
# Heuristic:
# - command contains tsserver
# - parent chain does NOT include code/cursor
# OR process is enormous (> 800MB) and state suggests it may be unhealthy
#
# We deliberately avoid killing tsserver still tied to an active editor chain.
# ------------------------------------------------------------
log ""
log "--- Scanning tsserver processes ---"

TSS_FOUND=0
while read -r pid ppid stat rss cmd; do
  [[ -z "${pid:-}" ]] && continue
  TSS_FOUND=1

  rss_mb_val="$(rss_mb "$rss")"
  reason=""

  if ! is_vscode_parent_chain "$ppid"; then
    reason="orphaned tsserver (no active VS Code/Cursor parent chain detected)"
    terminate_pid "$pid" "$reason"
    continue
  fi

  # If attached to editor, only flag it, do not kill.
  if awk -v x="$rss_mb_val" 'BEGIN { exit !(x > 800) }'; then
    log ""
    log "Notice: PID=$pid tsserver is large (${rss_mb_val}MB) but attached to editor."
    log "Cmd: $cmd"
    log "Advice: Restart TS Server or reload the editor window instead of killing blindly."
  else
    vlog "Healthy-ish tsserver: PID=$pid RSS=${rss_mb_val}MB"
  fi
done < <(
  ps -eo pid=,ppid=,stat=,rss=,args= |
    awk '
      {
        pid=$1; ppid=$2; stat=$3; rss=$4;
        $1=""; $2=""; $3=""; $4="";
        sub(/^[[:space:]]+/, "", $0);
        cmd=$0;
        if (cmd ~ /tsserver/) {
          print pid, ppid, stat, rss, cmd;
        }
      }
    '
)

[[ "$TSS_FOUND" -eq 0 ]] && log "No tsserver processes found."

log ""
log "--- Post-check top memory consumers ---"
ps -eo pid,ppid,pgid,stat,%mem,rss,cmd --sort=-rss | head -20

log ""
log "Done."
[[ "$DRY_RUN" -eq 1 ]] && log "Re-run with --kill to actually terminate targets."

echo "Dev cleanup complete"
>>>>>>> Stashed changes

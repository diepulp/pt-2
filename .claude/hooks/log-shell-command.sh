#!/usr/bin/env bash
set -euo pipefail

EVENT_PAYLOAD="$(cat)"

if [[ -z "${EVENT_PAYLOAD}" ]]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[log-shell-command] jq not available; skipping audit log." >&2
  exit 0
fi

COMMAND=$(printf '%s' "${EVENT_PAYLOAD}" | jq -r '.tool_input.command // empty')

if [[ -z "${COMMAND}" ]]; then
  exit 0
fi

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_DIR="${PROJECT_ROOT}/.agent"
LOG_FILE="${LOG_DIR}/tool-usage.log"

mkdir -p "${LOG_DIR}"

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '%s\tshell.exec\t%s\n' "${TIMESTAMP}" "${COMMAND}" >> "${LOG_FILE}"

echo "[log-shell-command] Recorded shell command in ${LOG_FILE}."

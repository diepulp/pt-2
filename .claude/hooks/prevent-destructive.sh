#!/usr/bin/env bash
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

declare -a BLOCKLIST=(
  "rm -rf /"
  "rm -rf \\."
  "rm -rf \\*"
  "git reset --hard"
  "git clean -fd"
  "psql .* drop table"
  "drop table"
  "drop schema"
)

for pattern in "${BLOCKLIST[@]}"; do
  if [[ "${COMMAND}" =~ ${pattern} ]]; then
    cat <<EOF >&2
[prevent-destructive] Command blocked by hook.
Pattern: ${pattern}
Command: ${COMMAND}
Request explicit approval or adjust the command.
EOF
    exit 1
  fi
done

exit 0

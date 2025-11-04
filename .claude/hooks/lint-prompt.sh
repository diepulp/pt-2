#!/usr/bin/env bash
set -euo pipefail

EVENT_PAYLOAD="$(cat)"

if [[ -z "${EVENT_PAYLOAD}" ]]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[lint-prompt] jq not available; skipping prompt lint." >&2
  exit 0
fi

PROMPT_CONTENT=$(printf '%s' "${EVENT_PAYLOAD}" | jq -r '.prompt // .user_prompt // empty')

if [[ -z "${PROMPT_CONTENT}" ]]; then
  exit 0
fi

if ! grep -qE '^#' <<<"${PROMPT_CONTENT}"; then
  cat <<'EOF' >&2
[lint-prompt] Prompt rejected: missing Markdown heading. Follow the Markdown prompt engineering template (include top-level headings).
EOF
  exit 1
fi

if ! grep -qE '(^- |\n- )' <<<"${PROMPT_CONTENT}"; then
  cat <<'EOF' >&2
[lint-prompt] Prompt rejected: include at least one bullet list to enumerate constraints or steps per the template.
EOF
  exit 1
fi

if ! grep -qi 'stop' <<<"${PROMPT_CONTENT}"; then
  cat <<'EOF' >&2
[lint-prompt] Prompt rejected: include an explicit STOP gate callout.
EOF
  exit 1
fi

echo "[lint-prompt] Prompt validated against template expectations."

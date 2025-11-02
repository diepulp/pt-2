#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
APPROVAL_FILE="${PROJECT_ROOT}/.agent/approval.log"
PLAN_FILE="${PROJECT_ROOT}/.agent/last-plan.json"

if [[ ! -f "${PLAN_FILE}" ]]; then
  echo "[require-approval] No plan recorded at ${PLAN_FILE}. Generate a PatchPlan before attempting to write." >&2
  exit 1
fi

if [[ ! -f "${APPROVAL_FILE}" ]]; then
  cat <<EOF >&2
[require-approval] STOP gate enforced.
Create ${APPROVAL_FILE} containing a line that starts with "APPROVED:" and includes reviewer name + timestamp.
Example:
  APPROVED: Jane Doe @ 2025-11-02T18:42Z
EOF
  exit 1
fi

if ! grep -E "^APPROVED:" "${APPROVAL_FILE}" >/dev/null; then
  echo "[require-approval] Approval log found but missing 'APPROVED:' entry. Please update ${APPROVAL_FILE}." >&2
  exit 1
fi

echo "[require-approval] Approval detected; proceeding with write/edit tool."
exit 0

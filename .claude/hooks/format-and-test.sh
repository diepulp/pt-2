#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "${PROJECT_ROOT}"

run_if_exists() {
  local script="$1"
  if npm run | grep -qE "^  ${script}"; then
    echo "[format-and-test] npm run ${script}"
    npm run "${script}"
  else
    echo "[format-and-test] Skipping npm run ${script} (script not defined)"
  fi
}

if [[ -f "package.json" ]]; then
  run_if_exists lint
  run_if_exists typecheck
  # Prefer coverage target when available
  if npm run | grep -qE "^  test:coverage"; then
    npm run test:coverage
  else
    run_if_exists test
  fi
else
  echo "[format-and-test] No package.json found; skipping npm checks."
fi

echo "[format-and-test] Hooks complete."

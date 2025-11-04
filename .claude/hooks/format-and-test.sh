#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "${PROJECT_ROOT}"

run_first_available() {
  local label="$1"
  shift
  for script in "$@"; do
    if npm run | grep -qE "^  ${script}\$"; then
      echo "[format-and-test] npm run ${script}"
      npm run "${script}"
      return
    fi
  done
  echo "[format-and-test] Skipping ${label} (no matching npm script)" >&2
}

if [[ -f "package.json" ]]; then
  run_first_available "lint" "lint:check" "lint"
  run_first_available "type-check" "type-check" "typecheck"
  if npm run | grep -qE "^  test:coverage\$"; then
    echo "[format-and-test] npm run test:coverage"
    npm run test:coverage
  else
    run_first_available "tests" "test:ci" "test"
  fi
else
  echo "[format-and-test] No package.json found; skipping npm checks."
fi

echo "[format-and-test] Hooks complete."

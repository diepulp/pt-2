#!/usr/bin/env bash
set -uo pipefail

# ============================================================================
# SEC-007 Security Gate Runner
# Executes all 9 security assertion scripts and reports a summary.
#
# Usage:
#   ./run_all_gates.sh                  # defaults: psql via localhost:54322
#   ./run_all_gates.sh --db-url URL     # override psql connection string
#   ./run_all_gates.sh --container NAME # override docker container name
#
# Requires:
#   - Supabase local stack running (supabase start)
#   - psql on PATH OR docker on PATH (auto-detects)
#
# Exit codes:
#   0 = all gates passed
#   1 = one or more gates failed
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_pt-2}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-url)  DB_URL="$2"; shift 2 ;;
    --container) CONTAINER="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

export SUPABASE_DB_CONTAINER="$CONTAINER"

# Detect SQL execution method: prefer psql, fall back to docker exec
if command -v psql &>/dev/null; then
  USE_DOCKER=false
else
  if docker exec "$CONTAINER" psql --version &>/dev/null 2>&1; then
    USE_DOCKER=true
    echo "NOTE: psql not on PATH, using docker exec ${CONTAINER}"
  else
    echo "ERROR: Neither psql nor docker container '${CONTAINER}' available."
    exit 1
  fi
fi

# Gate definitions: type|file|description
GATES=(
  "sql|01_permissive_true_check.sql|SEC-001 Permissive TRUE check"
  "sql|02_overload_ambiguity_check.sql|SEC-002 Overload ambiguity check"
  "sql|03_identity_param_check.sql|SEC-003 Identity parameter check"
  "sql|04_public_execute_check.sql|SEC-004 Public EXECUTE check"
  "sql|05_deprecated_context_check.sql|SEC-005 Deprecated context check (rpc_* only)"
  "sql|06_context_first_line_check.sql|SEC-006 Context first-line check"
  "sql|07_dashboard_rpc_context_acceptance.sql|SEC-007 Dashboard RPC acceptance"
  "sql|08_deprecated_function_body_check.sql|SEC-008 Deprecated function body check"
  "sql|adr040_identity_provenance.test.sql|ADR-040 Identity provenance enforcement"
  "sql|09_search_path_body_check.sql|SEC-009 Search path / body consistency"
)

PASS_COUNT=0
FAIL_COUNT=0
RESULTS=()

echo "========================================"
echo "  SEC-007 Security Gate Runner"
echo "========================================"
echo "DB:        ${DB_URL%%@*}@***"
echo "Container: ${CONTAINER}"
echo "Gates:     ${#GATES[@]}"
echo "----------------------------------------"

for gate in "${GATES[@]}"; do
  IFS='|' read -r gate_type gate_file gate_desc <<< "$gate"
  gate_path="${SCRIPT_DIR}/${gate_file}"

  if [[ ! -f "$gate_path" ]]; then
    echo "SKIP: ${gate_desc} (file not found: ${gate_file})"
    RESULTS+=("SKIP  ${gate_desc}")
    continue
  fi

  # Run the gate (all gates are SQL; runner handles psql vs docker exec)
  if [[ "$USE_DOCKER" == "true" ]]; then
    OUTPUT=$(docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$gate_path" 2>&1 | tail -20)
    EXIT_CODE=${PIPESTATUS[0]}
  else
    OUTPUT=$(psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "$gate_path" 2>&1 | tail -20)
    EXIT_CODE=${PIPESTATUS[0]}
  fi

  if [[ $EXIT_CODE -eq 0 ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    RESULTS+=("PASS  ${gate_desc}")
    # Print only the PASS/NOTICE line to keep output minimal
    PASS_LINE=$(echo "$OUTPUT" | grep -iE '(PASS|NOTICE:.*PASS)' | head -1 || true)
    if [[ -n "$PASS_LINE" ]]; then
      echo "$PASS_LINE"
    else
      echo "PASS: ${gate_desc}"
    fi
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    RESULTS+=("FAIL  ${gate_desc}")
    echo "FAIL: ${gate_desc}"
    # Show failure detail (capped at 10 lines)
    echo "$OUTPUT" | tail -10 | sed 's/^/  > /'
  fi
done

# Summary
echo ""
echo "========================================"
echo "  Summary: ${PASS_COUNT} passed, ${FAIL_COUNT} failed"
echo "========================================"
for r in "${RESULTS[@]}"; do
  echo "  ${r}"
done
echo "========================================"

if [[ $FAIL_COUNT -gt 0 ]]; then
  echo ""
  echo "BLOCKED: ${FAIL_COUNT} security gate(s) failed. PR cannot merge."
  exit 1
fi

echo ""
echo "All ${PASS_COUNT} security gates passed."
exit 0

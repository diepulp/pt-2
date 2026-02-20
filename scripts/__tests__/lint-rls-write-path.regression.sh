#!/usr/bin/env bash
# =============================================================================
# Regression Test: RLS Write-Path Lint (PRD-034 WS3)
#
# Creates a synthetic violation file, runs the lint script, verifies it exits
# non-zero, then cleans up.
#
# Usage: bash scripts/__tests__/lint-rls-write-path.regression.sh
# Exit:  0 = regression test passed, 1 = lint failed to detect violation
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LINT_SCRIPT="$PROJECT_ROOT/scripts/lint-rls-write-path.sh"
CONFIG_FILE="$PROJECT_ROOT/config/rls-category-a-tables.json"

# --- Pre-check ---
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "SKIP: Category A config not found (run npm run generate:category-a first)"
  exit 0
fi

if [[ ! -f "$LINT_SCRIPT" ]]; then
  echo "FAIL: Lint script not found at $LINT_SCRIPT"
  exit 1
fi

# Read first Category A table name from config
FIRST_TABLE=$(python3 -c "
import json
with open('$CONFIG_FILE') as f:
    config = json.load(f)
tables = config.get('categoryA', [])
print(tables[0] if tables else '')
" 2>&1)

if [[ -z "$FIRST_TABLE" ]]; then
  echo "SKIP: No tables in Category A config"
  exit 0
fi

# --- Create synthetic violation ---
VIOLATION_FILE="$PROJECT_ROOT/app/_synthetic_rls_violation_test.ts"

cat > "$VIOLATION_FILE" << EOF
// Synthetic violation for regression testing
export async function syntheticViolation(ctx: { supabase: any }) {
  const { data } = await ctx.supabase.from('${FIRST_TABLE}').insert({ first_name: 'test' }).select().single();
  return data;
}
EOF

echo "Created synthetic violation file: $VIOLATION_FILE"
echo "Testing lint detection against table: $FIRST_TABLE"

# --- Run lint and expect failure ---
LINT_EXIT=0
bash "$LINT_SCRIPT" > /dev/null 2>&1 || LINT_EXIT=$?

# --- Cleanup ---
rm -f "$VIOLATION_FILE"
echo "Cleaned up synthetic violation file"

# --- Verify ---
if [[ $LINT_EXIT -eq 1 ]]; then
  echo ""
  echo "PASS: Lint correctly detected synthetic violation (exit code $LINT_EXIT)"
  exit 0
elif [[ $LINT_EXIT -eq 0 ]]; then
  echo ""
  echo "FAIL: Lint did NOT detect synthetic violation (exit code 0)"
  echo "Expected non-zero exit for .from('${FIRST_TABLE}').insert() in app/"
  exit 1
else
  echo ""
  echo "WARN: Lint exited with unexpected code $LINT_EXIT (expected 1)"
  echo "This may indicate a config error. Check: $CONFIG_FILE"
  exit 1
fi

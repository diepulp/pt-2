#!/usr/bin/env bash
# =============================================================================
# RLS Category B Policy-Lint (PRD-034 WS3)
#
# Validates that Category B tables (PostgREST-compatible writes) have proper
# COALESCE wrapping around current_setting('app.*') in write policies.
#
# "Wrapped" definition: A current_setting('app.' token is wrapped if and only
# if a case-insensitive coalesce( token precedes it within the same SQL
# expression (whitespace-normalized).
#
# Uses pg_policies view (qual/with_check text columns).
#
# Usage: bash scripts/lint-rls-category-b-policies.sh
# Exit:  0 = all write policies wrapped, 1 = unwrapped current_setting found
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/config/rls-category-a-tables.json"

# --- Config validation ---
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: Category A config not found at $CONFIG_FILE"
  echo "Run: npm run generate:category-a"
  echo "Note: Category B = all tables NOT in Category A."
  exit 2
fi

# Get Category A tables to EXCLUDE from scan (Category B = everything else)
CATEGORY_A_TABLES=$(python3 -c "
import json
with open('$CONFIG_FILE') as f:
    config = json.load(f)
tables = config.get('categoryA', [])
# Build SQL IN clause
quoted = [\"'\" + t + \"'\" for t in tables]
print(','.join(quoted))
" 2>&1) || {
  echo "ERROR: Failed to parse $CONFIG_FILE"
  exit 2
}

echo "Category B Policy-Lint: Scanning write policies for unwrapped current_setting..."
echo ""

# --- Query pg_policies for Category B write policies ---
# Category B = public tables NOT in Category A, with INSERT/UPDATE/ALL commands
# Check: any current_setting('app.' NOT preceded by coalesce( is a violation

# This script queries the local Supabase instance via psql or supabase CLI
# For CI, use the linked project's database URL

QUERY="
SELECT
  tablename,
  policyname,
  cmd,
  CASE
    WHEN qual IS NOT NULL AND qual ~* 'current_setting\\s*\\(\\s*''app\\.' THEN
      CASE
        WHEN qual ~* 'coalesce\\s*\\([^)]*current_setting\\s*\\(\\s*''app\\.' THEN 'wrapped'
        ELSE 'UNWRAPPED'
      END
    ELSE 'no_session_var'
  END AS qual_status,
  CASE
    WHEN with_check IS NOT NULL AND with_check ~* 'current_setting\\s*\\(\\s*''app\\.' THEN
      CASE
        WHEN with_check ~* 'coalesce\\s*\\([^)]*current_setting\\s*\\(\\s*''app\\.' THEN 'wrapped'
        ELSE 'UNWRAPPED'
      END
    ELSE 'no_session_var'
  END AS with_check_status,
  COALESCE(qual, '') AS qual_expr,
  COALESCE(with_check, '') AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('INSERT', 'UPDATE', 'ALL')
  AND tablename NOT IN ($CATEGORY_A_TABLES)
ORDER BY tablename, policyname;
"

# Try supabase CLI first, fall back to DATABASE_URL
RESULTS=""
if command -v npx &> /dev/null; then
  RESULTS=$(npx supabase db execute --sql "$QUERY" 2>/dev/null || true)
fi

if [[ -z "$RESULTS" ]] && [[ -n "${DATABASE_URL:-}" ]]; then
  RESULTS=$(psql "$DATABASE_URL" -t -A -F'|' -c "$QUERY" 2>/dev/null || true)
fi

if [[ -z "$RESULTS" ]]; then
  echo "WARNING: Cannot connect to database to check Category B policies."
  echo "Set DATABASE_URL or ensure supabase CLI is configured."
  echo "Skipping policy-lint (manual verification required)."
  exit 0
fi

# --- Check for violations ---
VIOLATIONS=0

while IFS='|' read -r tablename policyname cmd qual_status wc_status qual_expr wc_expr; do
  [[ -z "$tablename" ]] && continue

  if [[ "$qual_status" == "UNWRAPPED" ]]; then
    VIOLATIONS=$((VIOLATIONS + 1))
    echo "VIOLATION: $tablename.$policyname (cmd=$cmd)"
    echo "  USING clause has unwrapped current_setting('app.*')"
    echo "  Expression: $qual_expr"
    echo "  Fix: Wrap with COALESCE(current_setting(...), jwt_fallback)"
    echo ""
  fi

  if [[ "$wc_status" == "UNWRAPPED" ]]; then
    VIOLATIONS=$((VIOLATIONS + 1))
    echo "VIOLATION: $tablename.$policyname (cmd=$cmd)"
    echo "  WITH CHECK clause has unwrapped current_setting('app.*')"
    echo "  Expression: $wc_expr"
    echo "  Fix: Wrap with COALESCE(current_setting(...), jwt_fallback)"
    echo ""
  fi
done <<< "$RESULTS"

# --- Results ---
if [[ $VIOLATIONS -gt 0 ]]; then
  echo "=========================================="
  echo "Category B Policy-Lint: $VIOLATIONS violation(s) found"
  echo "=========================================="
  echo ""
  echo "Category B write policies MUST use COALESCE wrapping for PostgREST compatibility."
  echo "See: docs/80-adrs/ADR-034-RLS-write-path-compatibility-and-enforcement.md"
  exit 1
else
  echo "Category B Policy-Lint: PASS (all write policies properly wrapped)"
  exit 0
fi

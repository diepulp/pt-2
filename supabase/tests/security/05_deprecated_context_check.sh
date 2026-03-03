#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# SEC-005: Deprecated Context Check
# Checks that no rpc_* function in the database still uses the deprecated
# set_rls_context() call. The authoritative function is set_rls_context_from_staff().
# set_rls_context_internal() is also acceptable (used internally by the from_staff wrapper).
#
# This queries pg_proc prosrc for the LATEST compiled function bodies,
# not raw migration files, so it reflects the actual deployed state.
# ============================================================================

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_pt-2}"
VIOLATIONS=""
VIOLATION_COUNT=0

# Query pg_proc for all rpc_* functions whose body contains "set_rls_context("
# but NOT "set_rls_context_from_staff" or "set_rls_context_internal"
# We use a SQL query that does the filtering server-side for accuracy.
RESULT=$(docker exec "$CONTAINER" psql -U postgres -d postgres -t -A -F '|' -c "
  SELECT p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname LIKE 'rpc_%'
    AND p.prosrc ILIKE '%set_rls_context(%'
    AND p.prosrc NOT ILIKE '%set_rls_context_from_staff%'
    AND p.prosrc NOT ILIKE '%set_rls_context_internal%'
  ORDER BY p.proname;
" 2>&1) || true

# Also catch functions that call set_rls_context( alongside set_rls_context_from_staff
# (i.e., they have BOTH — the deprecated call should still not be present)
RESULT_BOTH=$(docker exec "$CONTAINER" psql -U postgres -d postgres -t -A -F '|' -c "
  SELECT p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname LIKE 'rpc_%'
    AND p.prosrc ~ 'set_rls_context\s*\('
    AND p.prosrc !~ 'set_rls_context_(from_staff|internal)\s*\('
  ORDER BY p.proname;
" 2>&1) || true

# Combine and deduplicate (grep -v may return exit 1 when no lines match)
ALL_VIOLATIONS=$(echo -e "${RESULT}\n${RESULT_BOTH}" | grep -v '^$' | sort -u || true)

if [[ -n "$ALL_VIOLATIONS" ]]; then
  VIOLATION_COUNT=$(echo "$ALL_VIOLATIONS" | wc -l)
  echo "FAIL: Found ${VIOLATION_COUNT} rpc_* function(s) using deprecated set_rls_context():"
  while IFS= read -r func; do
    echo "  - ${func}"
  done <<< "$ALL_VIOLATIONS"
  exit 1
fi

echo "PASS: No rpc_* functions use deprecated set_rls_context()"
exit 0

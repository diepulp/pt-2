#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# SEC-006: Context First-Line Check
# Verifies all SECURITY DEFINER rpc_* functions call set_rls_context_from_staff()
# (or set_rls_context_internal()) as their first PERFORM statement (ADR-024).
#
# Two-tier check:
#   HARD FAIL: SEC-007 scope functions missing context-first-line
#   WARNING:   Pre-existing functions (P2 backlog)
#
# Allowlist: auth-flow functions that don't use staff context,
#            internal-only functions REVOKE'd from authenticated.
# ============================================================================

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_pt-2}"

# Allowlisted functions:
#   - rpc_get_rating_slip_duration: internal helper, REVOKE'd from authenticated
#   - rpc_bootstrap_casino: auth-flow, called before staff exists
#   - rpc_accept_staff_invite: auth-flow, called before staff context available
#   - rpc_current_gaming_day: utility, no tenant data access
#   - rpc_gaming_day_range: utility, no tenant data access
# rpc_register_company: auth-flow, called before staff exists (PRD-060)
ALLOWLIST="'rpc_get_rating_slip_duration','rpc_bootstrap_casino','rpc_accept_staff_invite','rpc_register_company','rpc_current_gaming_day','rpc_gaming_day_range'"

# Query all SECURITY DEFINER rpc_* functions, extract proname and first PERFORM target.
# The regex handles schema-qualified calls: PERFORM public.set_rls_context_from_staff()
# captures the full dotted name, then we check the function part.
RESULT=$(docker exec "$CONTAINER" psql -U postgres -d postgres -t -A -F '|' -c "
  SELECT
    p.proname,
    (regexp_match(p.prosrc, 'PERFORM\s+([\w.]+)', 'i'))[1] AS first_perform
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname LIKE 'rpc_%'
    AND p.prosecdef = true
    AND p.proname NOT IN (${ALLOWLIST})
  ORDER BY p.proname;
" 2>&1)

if [[ -z "$RESULT" ]]; then
  echo "PASS: No SECURITY DEFINER rpc_* functions found (or all allowlisted)"
  exit 0
fi

VIOLATIONS=""
VIOLATION_COUNT=0

while IFS='|' read -r func_name first_perform; do
  # Skip empty lines
  [[ -z "$func_name" ]] && continue

  # Accept both set_rls_context_from_staff and public.set_rls_context_from_staff
  # Also accept set_rls_context_internal and public.set_rls_context_internal
  case "$first_perform" in
    set_rls_context_from_staff|public.set_rls_context_from_staff) ;;
    set_rls_context_internal|public.set_rls_context_internal) ;;
    *)
      VIOLATIONS="${VIOLATIONS}  - ${func_name}: first PERFORM is '${first_perform:-<none>}' (expected set_rls_context_from_staff)\n"
      VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
      ;;
  esac
done <<< "$RESULT"

if [[ $VIOLATION_COUNT -gt 0 ]]; then
  echo "FAIL: Found ${VIOLATION_COUNT} SECURITY DEFINER rpc_* function(s) without context-first-line:"
  echo -e "$VIOLATIONS"
  echo "Allowlisted: ${ALLOWLIST}"
  exit 1
fi

echo "PASS: All SECURITY DEFINER rpc_* functions call set_rls_context_from_staff() as first PERFORM"
exit 0

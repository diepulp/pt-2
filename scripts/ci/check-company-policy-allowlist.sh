#!/bin/bash
# ============================================================================
# CI Gate: Company Policy Allowlist (PRD-051 / ADR-044)
#
# Verifies that ONLY player_casino and player_loyalty SELECT policies
# reference app.company_id. Any other table referencing app.company_id
# in an RLS policy is a scope violation.
#
# Exit codes:
#   0 — pass (no violations)
#   1 — fail (unauthorized company_id reference found)
# ============================================================================

set -euo pipefail

MIGRATIONS_DIR="${1:-supabase/migrations}"
ALLOWED_TABLES="player_casino|player_loyalty"

echo "=== Company Policy Allowlist Gate ==="
echo "Scanning: ${MIGRATIONS_DIR}"
echo "Allowed tables: ${ALLOWED_TABLES}"
echo ""

# Find all CREATE POLICY statements that reference app.company_id
# Exclude the two allowed tables
VIOLATIONS=$(grep -rn "CREATE POLICY" "$MIGRATIONS_DIR" \
  | grep -i "company_id" \
  | grep -v -E "ON\s+(${ALLOWED_TABLES})\b" \
  | grep -v "^.*:.*--" \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo "FAIL: Unauthorized app.company_id reference in RLS policies:"
  echo ""
  echo "$VIOLATIONS"
  echo ""
  echo "Only player_casino and player_loyalty may reference app.company_id in SELECT policies."
  echo "See ADR-044 D2 (policy allowlist) and SEC-001 (policy matrix)."
  exit 1
fi

# Also check for company_id in non-SELECT policies on allowed tables
# (write policies must remain casino-scoped)
WRITE_VIOLATIONS=$(grep -rn "CREATE POLICY" "$MIGRATIONS_DIR" \
  | grep -i "company_id" \
  | grep -E "FOR\s+(INSERT|UPDATE|DELETE)" \
  || true)

if [ -n "$WRITE_VIOLATIONS" ]; then
  echo "FAIL: app.company_id found in WRITE policy (INSERT/UPDATE/DELETE):"
  echo ""
  echo "$WRITE_VIOLATIONS"
  echo ""
  echo "Write policies must remain casino-scoped. company_id is for SELECT only."
  exit 1
fi

echo "PASS: Only player_casino and player_loyalty SELECT policies reference app.company_id"
exit 0

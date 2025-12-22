#!/bin/sh
# ==============================================================================
# RPC Self-Injection Pattern Lint
# ==============================================================================
# Version: 1.0.0
# Date: 2025-12-21
# References:
#   - PRD-015: ADR-015 Phase 1A Remediation
#   - ADR-015: RLS Connection Pooling Strategy (Hybrid Pattern C)
#   - ISSUE-5FE4A689: RPC self-injection systematic gap
#
# Enforces that all RPC functions include the self-injection pattern to
# prevent context loss in Supabase's transaction mode connection pooling.
#
# RULE: If a migration creates/modifies an RPC function (CREATE OR REPLACE FUNCTION rpc_*),
#       it MUST call set_rls_context() for ADR-015 Phase 1A compliance.
#
# This prevents future regressions where RPCs are created without the
# self-injection pattern, causing context loss across pooled connections.
# ==============================================================================

echo "🔍 Checking RPC self-injection pattern compliance..."
echo ""

# Get all staged SQL migration files
MIGRATION_FILES=$(git diff --cached --name-only | grep 'supabase/migrations/.*\.sql$' || true)

if [ -z "$MIGRATION_FILES" ]; then
  echo "✅ No migrations staged"
  exit 0
fi

VIOLATIONS_FOUND=0

# ==============================================================================
# Check: RPC functions must include set_rls_context call
# ==============================================================================
for FILE in $MIGRATION_FILES; do
  # Skip if file doesn't exist (deletion)
  if [ ! -f "$FILE" ]; then
    continue
  fi

  # Check if file contains RPC function definitions
  # Pattern: CREATE OR REPLACE FUNCTION rpc_* (case insensitive)
  RPC_COUNT=$(grep -icE 'CREATE\s+OR\s+REPLACE\s+FUNCTION\s+rpc_' "$FILE" || true)

  if [ "$RPC_COUNT" -gt 0 ]; then
    # RPC function(s) found - verify set_rls_context call exists
    CONTEXT_CALL=$(grep -icE 'PERFORM\s+set_rls_context\s*\(' "$FILE" || true)

    if [ "$CONTEXT_CALL" -eq 0 ]; then
      echo "❌ RPC SELF-INJECTION VIOLATION: $FILE"
      echo ""
      echo "   Found $RPC_COUNT RPC function(s) but NO set_rls_context call"
      echo ""
      echo "   WHY THIS IS REQUIRED:"
      echo "   • Supabase transaction pooling (port 6543) reuses connections"
      echo "   • SET LOCAL context is lost between transactions"
      echo "   • RPC must inject context in same transaction as operation"
      echo ""
      echo "   REQUIRED PATTERN (ADR-015 Phase 1A):"
      echo "   ────────────────────────────────────────────────────────────"
      echo "   CREATE OR REPLACE FUNCTION rpc_your_function("
      echo "     p_casino_id uuid,"
      echo "     ..."
      echo "   ) ..."
      echo "   BEGIN"
      echo "     -- Extract staff role for self-injection"
      echo "     v_context_staff_role := COALESCE("
      echo "       NULLIF(current_setting('app.staff_role', true), ''),"
      echo "       (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text"
      echo "     );"
      echo ""
      echo "     -- Self-inject context (REQUIRED)"
      echo "     PERFORM set_rls_context("
      echo "       COALESCE("
      echo "         NULLIF(current_setting('app.actor_id', true), '')::uuid,"
      echo "         (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid"
      echo "       ),"
      echo "       p_casino_id,"
      echo "       v_context_staff_role"
      echo "     );"
      echo "     ..."
      echo "   END;"
      echo "   ────────────────────────────────────────────────────────────"
      echo ""
      echo "   REFERENCE: See supabase/migrations/*_prd015_*_self_injection.sql"
      echo ""
      VIOLATIONS_FOUND=$((VIOLATIONS_FOUND + 1))
    else
      echo "✅ $FILE: $RPC_COUNT RPC function(s) with set_rls_context"
    fi
  fi
done

# ==============================================================================
# Summary
# ==============================================================================
if [ "$VIOLATIONS_FOUND" -gt 0 ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ COMMIT BLOCKED: $VIOLATIONS_FOUND migration(s) violate RPC self-injection rule"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "REQUIRED ACTION:"
  echo "  1. Add PERFORM set_rls_context(...) call to each RPC function"
  echo "  2. Place call at START of function body (before any other logic)"
  echo "  3. Follow ADR-015 Phase 1A pattern (see reference migrations)"
  echo ""
  echo "WHY: Prevents context loss in Supabase transaction pooling (ISSUE-5FE4A689)"
  echo ""
  exit 1
fi

echo ""
echo "✅ All RPC functions follow self-injection pattern"
exit 0

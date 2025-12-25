#!/bin/sh
# ==============================================================================
# RPC Self-Injection Pattern Lint
# ==============================================================================
# Version: 1.1.0
# Date: 2025-12-25
# References:
#   - PRD-015: ADR-015 Phase 1A Remediation
#   - ADR-015: RLS Connection Pooling Strategy (Hybrid Pattern C)
#   - ADR-018: SEC-006 Security Hardening (casino_id validation)
#   - ISSUE-5FE4A689: RPC self-injection systematic gap
#
# Enforces that all RPC functions include the self-injection pattern to
# prevent context loss in Supabase's transaction mode connection pooling.
#
# RULES:
# 1. If a migration creates/modifies an RPC function (CREATE OR REPLACE FUNCTION rpc_*),
#    it MUST call set_rls_context() for ADR-015 Phase 1A compliance.
# 2. SECURITY DEFINER RPCs with p_casino_id parameter MUST include
#    casino_id mismatch validation (ADR-018 Template 5).
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
# Check 1: RPC functions must include set_rls_context call
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

WARNINGS_FOUND=0

# ==============================================================================
# Check 2: SECURITY DEFINER RPCs with p_casino_id must validate casino scope
# ADR-018 Template 5: Prevent caller-provided casino_id bypass attacks
# ==============================================================================
for FILE in $MIGRATION_FILES; do
  # Skip if file doesn't exist (deletion)
  if [ ! -f "$FILE" ]; then
    continue
  fi

  # Check if file contains SECURITY DEFINER RPC functions with p_casino_id parameter
  # This is the high-risk pattern that needs validation
  HAS_SECURITY_DEFINER=$(grep -icE 'SECURITY\s+DEFINER' "$FILE" || true)
  HAS_P_CASINO_ID=$(grep -icE 'p_casino_id\s+uuid' "$FILE" || true)

  if [ "$HAS_SECURITY_DEFINER" -gt 0 ] && [ "$HAS_P_CASINO_ID" -gt 0 ]; then
    # SECURITY DEFINER with p_casino_id found - verify casino_id mismatch validation exists
    # Pattern: IF p_casino_id IS DISTINCT FROM v_context_casino_id
    HAS_CASINO_VALIDATION=$(grep -icE 'p_casino_id\s+IS\s+DISTINCT\s+FROM\s+v_context_casino_id' "$FILE" || true)

    if [ "$HAS_CASINO_VALIDATION" -eq 0 ]; then
      echo "⚠️  ADR-018 WARNING: $FILE"
      echo ""
      echo "   SECURITY DEFINER RPC with p_casino_id parameter but NO casino_id mismatch validation"
      echo ""
      echo "   WHY THIS IS CRITICAL:"
      echo "   • SECURITY DEFINER runs with function owner's privileges"
      echo "   • Attacker could pass ANY casino_id and bypass RLS"
      echo "   • Must validate p_casino_id matches authenticated user's casino"
      echo ""
      echo "   REQUIRED PATTERN (ADR-018 Template 5):"
      echo "   ────────────────────────────────────────────────────────────"
      echo "   v_context_casino_id := COALESCE("
      echo "     NULLIF(current_setting('app.casino_id', true), '')::uuid,"
      echo "     (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid"
      echo "   );"
      echo ""
      echo "   IF v_context_casino_id IS NULL THEN"
      echo "     RAISE EXCEPTION 'RLS context not set: app.casino_id is required';"
      echo "   END IF;"
      echo ""
      echo "   IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN"
      echo "     RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',"
      echo "       p_casino_id, v_context_casino_id;"
      echo "   END IF;"
      echo "   ────────────────────────────────────────────────────────────"
      echo ""
      echo "   REFERENCE: supabase/migrations/*_sec006_rls_hardening.sql"
      echo ""
      WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
    else
      echo "✅ $FILE: SECURITY DEFINER RPC with casino_id validation"
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

if [ "$WARNINGS_FOUND" -gt 0 ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "⚠️  WARNINGS: $WARNINGS_FOUND migration(s) may lack casino_id validation (ADR-018)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "RECOMMENDED ACTION:"
  echo "  1. Review warnings above for SECURITY DEFINER RPCs"
  echo "  2. Add Template 5 casino_id mismatch validation if missing"
  echo "  3. Warnings don't block commit, but should be addressed before merge"
  echo ""
  echo "WHY: Prevents casino_id bypass attacks in privileged functions (ADR-018)"
  echo ""
  # Warnings don't block commit - violations do
fi

echo ""
echo "✅ All RPC functions follow self-injection pattern"
exit 0

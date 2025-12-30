#!/bin/sh
# ==============================================================================
# RPC Self-Injection Pattern Lint
# ==============================================================================
# Version: 2.0.0
# Date: 2025-12-29
# References:
#   - ADR-024: RLS Context Self-Injection Remediation (PREFERRED)
#   - PRD-015: ADR-015 Phase 1A Remediation (legacy)
#   - ADR-015: RLS Connection Pooling Strategy (Hybrid Pattern C)
#   - ADR-018: SEC-006 Security Hardening (casino_id validation)
#   - ISSUE-5FE4A689: RPC self-injection systematic gap
#
# Enforces that all RPC functions include the self-injection pattern to
# prevent context loss in Supabase's transaction mode connection pooling.
#
# RULES:
# 1. If a migration creates/modifies an RPC function (CREATE OR REPLACE FUNCTION rpc_*),
#    it MUST call EITHER:
#    - set_rls_context_from_staff() (ADR-024 PREFERRED - no spoofable params)
#    - set_rls_context() (ADR-015 legacy - accepts params)
# 2. SECURITY DEFINER RPCs with p_casino_id parameter MUST include
#    casino_id mismatch validation (ADR-018 Template 5) - UNLESS using ADR-024 pattern
#    which derives casino_id authoritatively.
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
# Check 1: RPC functions must include context injection call
# Accepts EITHER:
#   - set_rls_context_from_staff() (ADR-024 PREFERRED)
#   - set_rls_context() (ADR-015 legacy)
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
    # RPC function(s) found - verify context injection call exists
    # ADR-024 pattern (PREFERRED): set_rls_context_from_staff()
    CONTEXT_CALL_ADR024=$(grep -icE 'PERFORM\s+set_rls_context_from_staff\s*\(' "$FILE" || true)
    # ADR-015 legacy pattern: set_rls_context(actor_id, casino_id, role)
    CONTEXT_CALL_LEGACY=$(grep -icE 'PERFORM\s+set_rls_context\s*\(' "$FILE" || true)

    TOTAL_CONTEXT_CALLS=$((CONTEXT_CALL_ADR024 + CONTEXT_CALL_LEGACY))

    if [ "$TOTAL_CONTEXT_CALLS" -eq 0 ]; then
      echo "❌ RPC SELF-INJECTION VIOLATION: $FILE"
      echo ""
      echo "   Found $RPC_COUNT RPC function(s) but NO context injection call"
      echo ""
      echo "   WHY THIS IS REQUIRED:"
      echo "   • Supabase transaction pooling (port 6543) reuses connections"
      echo "   • SET LOCAL context is lost between transactions"
      echo "   • RPC must inject context in same transaction as operation"
      echo ""
      echo "   REQUIRED PATTERN (ADR-024 PREFERRED):"
      echo "   ────────────────────────────────────────────────────────────"
      echo "   CREATE OR REPLACE FUNCTION rpc_your_function(...) ..."
      echo "   BEGIN"
      echo "     -- Authoritative context injection (no spoofable params)"
      echo "     PERFORM set_rls_context_from_staff();"
      echo "     ..."
      echo "   END;"
      echo "   ────────────────────────────────────────────────────────────"
      echo ""
      echo "   ALTERNATIVE (ADR-015 Legacy - accepts params):"
      echo "   ────────────────────────────────────────────────────────────"
      echo "     PERFORM set_rls_context(actor_id, casino_id, staff_role);"
      echo "   ────────────────────────────────────────────────────────────"
      echo ""
      echo "   REFERENCE:"
      echo "   • ADR-024: docs/80-adrs/ADR-024_DECISIONS.md (preferred)"
      echo "   • ADR-015: supabase/migrations/*_prd015_*_self_injection.sql"
      echo ""
      VIOLATIONS_FOUND=$((VIOLATIONS_FOUND + 1))
    else
      if [ "$CONTEXT_CALL_ADR024" -gt 0 ]; then
        echo "✅ $FILE: $RPC_COUNT RPC function(s) with set_rls_context_from_staff (ADR-024)"
      else
        echo "✅ $FILE: $RPC_COUNT RPC function(s) with set_rls_context (ADR-015 legacy)"
      fi
    fi
  fi
done

WARNINGS_FOUND=0

# ==============================================================================
# Check 2: SECURITY DEFINER RPCs with p_casino_id must validate casino scope
# ADR-018 Template 5: Prevent caller-provided casino_id bypass attacks
# NOTE: RPCs using ADR-024 set_rls_context_from_staff() are exempt since
#       casino_id is derived authoritatively from staff table, not from params.
# NOTE: The context injection functions themselves (set_rls_context*) are exempt
#       since they ARE the validation layer.
# ==============================================================================
for FILE in $MIGRATION_FILES; do
  # Skip if file doesn't exist (deletion)
  if [ ! -f "$FILE" ]; then
    continue
  fi

  # Skip if this file defines the context injection functions themselves
  # These functions ARE the validation layer and can't call themselves
  IS_CONTEXT_FUNCTION_DEF=$(grep -icE 'CREATE.*FUNCTION.*set_rls_context' "$FILE" || true)
  if [ "$IS_CONTEXT_FUNCTION_DEF" -gt 0 ]; then
    echo "✅ $FILE: Context injection function definition (exempt from self-call check)"
    continue
  fi

  # Check if file contains SECURITY DEFINER RPC functions with p_casino_id parameter
  # This is the high-risk pattern that needs validation
  HAS_SECURITY_DEFINER=$(grep -icE 'SECURITY\s+DEFINER' "$FILE" || true)
  HAS_P_CASINO_ID=$(grep -icE 'p_casino_id\s+uuid' "$FILE" || true)

  if [ "$HAS_SECURITY_DEFINER" -gt 0 ] && [ "$HAS_P_CASINO_ID" -gt 0 ]; then
    # Check if using ADR-024 pattern (exempt from p_casino_id validation)
    HAS_ADR024_PATTERN=$(grep -icE 'PERFORM\s+set_rls_context_from_staff\s*\(' "$FILE" || true)

    if [ "$HAS_ADR024_PATTERN" -gt 0 ]; then
      # ADR-024 pattern: casino_id is derived authoritatively, not from p_casino_id
      echo "✅ $FILE: SECURITY DEFINER RPC with set_rls_context_from_staff (ADR-024 - authoritative context)"
    else
      # Legacy pattern: must validate p_casino_id against context
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
        echo "   PREFERRED SOLUTION (ADR-024):"
        echo "   ────────────────────────────────────────────────────────────"
        echo "     PERFORM set_rls_context_from_staff();  -- Derives casino_id authoritatively"
        echo "   ────────────────────────────────────────────────────────────"
        echo ""
        echo "   ALTERNATIVE (ADR-018 Template 5 - legacy pattern):"
        echo "   ────────────────────────────────────────────────────────────"
        echo "   v_context_casino_id := COALESCE("
        echo "     NULLIF(current_setting('app.casino_id', true), '')::uuid,"
        echo "     (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid"
        echo "   );"
        echo ""
        echo "   IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN"
        echo "     RAISE EXCEPTION 'casino_id mismatch';"
        echo "   END IF;"
        echo "   ────────────────────────────────────────────────────────────"
        echo ""
        echo "   REFERENCE:"
        echo "   • ADR-024: docs/80-adrs/ADR-024_DECISIONS.md (preferred)"
        echo "   • ADR-018: supabase/migrations/*_sec006_rls_hardening.sql"
        echo ""
        WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
      else
        echo "✅ $FILE: SECURITY DEFINER RPC with casino_id validation (ADR-018 legacy)"
      fi
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

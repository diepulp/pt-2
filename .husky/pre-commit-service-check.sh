#!/bin/sh
# Service Layer Anti-Pattern Detection
# PRD §3.3 + SRM Canonical Standards

echo "🔍 Checking service layer for anti-patterns..."

VIOLATIONS_FOUND=0

# ==============================================================================
# Check 1: ReturnType inference (PRD §3.3)
# ==============================================================================
RETURNTYPE_VIOLATIONS=$(git diff --cached --name-only | grep "^services/" | xargs grep -l "ReturnType<typeof.*Service" 2>/dev/null || true)

if [ -n "$RETURNTYPE_VIOLATIONS" ]; then
  echo ""
  echo "❌ ANTI-PATTERN DETECTED: ReturnType inference in service files"
  echo ""
  echo "Files with violations:"
  echo "$RETURNTYPE_VIOLATIONS" | while read -r file; do
    echo "  - $file"
    grep -n "ReturnType<typeof" "$file" | head -3
  done
  echo ""
  echo "PRD §3.3 Violation: ReturnType<typeof createXService> is banned."
  echo "Fix: Define explicit interface instead:"
  echo ""
  echo "  export interface YourService {"
  echo "    methodName(args): Promise<Result>;"
  echo "  }"
  echo ""
  VIOLATIONS_FOUND=1
fi

# ==============================================================================
# Check 2: Manual DTO interfaces (SRM Canonical Standard)
# ==============================================================================
MANUAL_DTO_VIOLATIONS=$(git diff --cached --name-only | grep "^services/.*\.ts$" | xargs grep -l "export interface.*DTO" 2>/dev/null || true)

if [ -n "$MANUAL_DTO_VIOLATIONS" ]; then
  echo ""
  echo "❌ ANTI-PATTERN DETECTED: Manual DTO interfaces in service files"
  echo ""
  echo "Files with violations:"
  echo "$MANUAL_DTO_VIOLATIONS" | while read -r file; do
    echo "  - $file"
    grep -n "export interface.*DTO" "$file" | head -3
  done
  echo ""
  echo "SRM Canonical Violation: Manual DTO interfaces cause schema drift."
  echo "Fix: Use type aliases derived from Database types:"
  echo ""
  echo "  ❌ WRONG:"
  echo "  export interface PlayerCreateDTO {"
  echo "    first_name: string;"
  echo "    last_name: string;"
  echo "  }"
  echo ""
  echo "  ✅ CORRECT:"
  echo "  export type PlayerCreateDTO = Pick<"
  echo "    Database['public']['Tables']['player']['Insert'],"
  echo "    'first_name' | 'last_name'"
  echo "  >;"
  echo ""
  echo "  ✅ ALSO CORRECT (for updates):"
  echo "  export type PlayerUpdateDTO = Partial<"
  echo "    Omit<Database['public']['Tables']['player']['Insert'], 'id' | 'created_at'>"
  echo "  >;"
  echo ""
  VIOLATIONS_FOUND=1
fi

# ==============================================================================
# Check 3: Direct table inserts to RPC-managed tables
# ==============================================================================
STAGED_FILES=$(git diff --cached --name-only | grep "^services/.*\.ts$" || true)

if [ -n "$STAGED_FILES" ]; then
  # Check for direct inserts to player_financial_transaction
  FINANCE_VIOLATIONS=$(echo "$STAGED_FILES" | xargs grep -l "\.from.*player_financial_transaction.*\.insert" 2>/dev/null || true)

  if [ -n "$FINANCE_VIOLATIONS" ]; then
    echo ""
    echo "❌ ANTI-PATTERN DETECTED: Direct insert to player_financial_transaction"
    echo ""
    echo "Files with violations:"
    echo "$FINANCE_VIOLATIONS" | while read -r file; do
      echo "  - $file"
      grep -n "\.from.*player_financial_transaction.*\.insert" "$file" | head -3
    done
    echo ""
    echo "SRM Canonical Violation: player_financial_transaction requires RPC."
    echo "Fix: Use rpc_create_financial_txn instead:"
    echo ""
    echo "  ❌ WRONG:"
    echo "  await supabase.from('player_financial_transaction').insert({ ... })"
    echo ""
    echo "  ✅ CORRECT:"
    echo "  await supabase.rpc('rpc_create_financial_txn', {"
    echo "    p_casino_id: casinoId,"
    echo "    p_player_id: playerId,"
    echo "    p_amount: amount,"
    echo "    // gaming_day is auto-calculated by trigger"
    echo "  })"
    echo ""
    echo "  OR use helper:"
    echo "  import { createFinancialTransaction } from '@/lib/finance';"
    echo ""
    VIOLATIONS_FOUND=1
  fi
fi

# ==============================================================================
# Summary
# ==============================================================================
if [ $VIOLATIONS_FOUND -eq 1 ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ PRE-COMMIT FAILED: Fix anti-patterns above before committing"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "References:"
  echo "  - PRD §3.3: docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md"
  echo "  - SRM v3.0.2: docs/bounded-context-integrity/phase-D/srm-patch/SERVICE_RESPONSIBILITY_MATRIX.md"
  echo "  - Service Template: docs/patterns/SERVICE_TEMPLATE.md"
  echo ""
  exit 1
fi

echo "✅ All service layer checks passed"
exit 0

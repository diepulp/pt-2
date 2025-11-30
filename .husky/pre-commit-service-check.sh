#!/bin/sh
# ==============================================================================
# Service Layer Anti-Pattern Detection (Pattern-Aware)
# ==============================================================================
# Version: 2.1.0
# Date: 2025-11-28
# References:
#   - SLAD: docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md
#   - SRM: docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
#   - Anti-Patterns: docs/70-governance/ANTI_PATTERN_CATALOG.md
#   - Workflow: docs/20-architecture/specs/WORKFLOW-PRD-002-parallel-execution.md
#
# This script runs BEFORE lint-staged. Additional AST-based checks run via ESLint:
#   - V1: no-dto-type-assertions (services/**/*.ts) - Prevents `as` casting
#   - V2: no-service-result-return (services/**/*.ts) - ADR-012 compliance
#   - V4: no-header-casino-context (app/api/**/*.ts) - Security enforcement
# ==============================================================================

echo "🔍 Checking service layer for anti-patterns..."
echo ""

VIOLATIONS_FOUND=0

# ==============================================================================
# Pattern Classification (SLAD §314-352, SRM §57-60)
# ==============================================================================
# Pattern A (Contract-First): Manual interfaces ALLOWED, mappers.ts REQUIRED
PATTERN_A_SERVICES="loyalty|finance|mtl|table-context"

# Pattern B (Canonical CRUD): Manual interfaces BANNED, Pick/Omit REQUIRED
PATTERN_B_SERVICES="player|visit|casino|floor-layout"

# Pattern C (Hybrid): Per-DTO basis
PATTERN_C_SERVICES="rating-slip"

# Get staged service files
STAGED_SERVICE_FILES=$(git diff --cached --name-only | grep "^services/.*\.ts$" || true)

# ==============================================================================
# Check 1: ReturnType inference (SLAD §1224-1226, Anti-Patterns §13-26)
# ==============================================================================
if [ -n "$STAGED_SERVICE_FILES" ]; then
  RETURNTYPE_VIOLATIONS=$(echo "$STAGED_SERVICE_FILES" | xargs grep -l "ReturnType<typeof.*Service" 2>/dev/null || true)

  if [ -n "$RETURNTYPE_VIOLATIONS" ]; then
    echo "❌ ANTI-PATTERN: ReturnType inference in service files"
    echo ""
    echo "Files with violations:"
    echo "$RETURNTYPE_VIOLATIONS" | while read -r file; do
      echo "  - $file"
      grep -n "ReturnType<typeof" "$file" 2>/dev/null | head -3 | sed 's/^/    /'
    done
    echo ""
    echo "Fix: Define explicit interface instead:"
    echo "  export interface YourService {"
    echo "    methodName(args): Promise<Result>;"
    echo "  }"
    echo ""
    echo "Reference: SLAD §1224-1226, Anti-Patterns §13-26"
    echo ""
    VIOLATIONS_FOUND=1
  fi
fi

# ==============================================================================
# Check 2: Pattern B - Manual DTO interfaces BANNED (SLAD §440-479)
# Exception: RPC response interfaces are allowed (annotated with "RPC response" in JSDoc)
# ==============================================================================
if [ -n "$STAGED_SERVICE_FILES" ]; then
  PATTERN_B_FILES=$(echo "$STAGED_SERVICE_FILES" | grep -E "^services/($PATTERN_B_SERVICES)/" || true)
  PATTERN_B_DTO_VIOLATIONS=""

  for file in $PATTERN_B_FILES; do
    # Find interfaces with DTO suffix
    if grep -q "export interface.*DTO" "$file" 2>/dev/null; then
      # Check each interface - exclude those preceded by RPC response JSDoc
      # Get line numbers of interface declarations
      INTERFACE_LINES=$(grep -n "export interface.*DTO" "$file" 2>/dev/null | cut -d: -f1)

      for line in $INTERFACE_LINES; do
        # Check if preceding lines (within 5 lines) contain "RPC response"
        START_LINE=$((line - 5))
        if [ $START_LINE -lt 1 ]; then START_LINE=1; fi

        # Extract context and check for RPC response annotation
        CONTEXT=$(sed -n "${START_LINE},${line}p" "$file")
        if ! echo "$CONTEXT" | grep -qi "RPC response"; then
          # This interface is NOT an RPC response - it's a violation
          VIOLATION_LINE=$(sed -n "${line}p" "$file")
          PATTERN_B_DTO_VIOLATIONS="$PATTERN_B_DTO_VIOLATIONS
  - $file
    ${line}:${VIOLATION_LINE}"
        fi
      done
    fi
  done

  if [ -n "$PATTERN_B_DTO_VIOLATIONS" ]; then
    echo "❌ ANTI-PATTERN: Manual DTO interfaces in Pattern B (Canonical CRUD) services"
    echo ""
    echo "Pattern B services (Player, Visit, Casino, FloorLayout) MUST use type aliases:"
    echo ""
    echo "Files with violations:$PATTERN_B_DTO_VIOLATIONS"
    echo ""
    echo "Fix: Use type aliases derived from Database types:"
    echo ""
    echo "  ❌ WRONG:"
    echo "  export interface PlayerCreateDTO {"
    echo "    first_name: string;"
    echo "  }"
    echo ""
    echo "  ✅ CORRECT:"
    echo "  export type PlayerCreateDTO = Pick<"
    echo "    Database['public']['Tables']['player']['Insert'],"
    echo "    'first_name'"
    echo "  >;"
    echo ""
    echo "Exception: RPC response interfaces are allowed with JSDoc annotation:"
    echo "  /** Gaming day computation RPC response ... */"
    echo "  export interface GamingDayDTO { ... }"
    echo ""
    echo "Reference: SLAD §440-479, SRM §57-60"
    echo ""
    VIOLATIONS_FOUND=1
  fi
fi

# ==============================================================================
# Check 3: Pattern A - mappers.ts REQUIRED when dtos.ts exists (SLAD §321-325)
# ==============================================================================
for service in loyalty finance mtl table-context; do
  SERVICE_PATH="services/$service"
  STAGED_DTOS=$(echo "$STAGED_SERVICE_FILES" | grep "^$SERVICE_PATH/dtos.ts$" || true)

  if [ -n "$STAGED_DTOS" ]; then
    if [ ! -f "$SERVICE_PATH/mappers.ts" ]; then
      echo "❌ ANTI-PATTERN: Pattern A service '$service' has dtos.ts but missing mappers.ts"
      echo ""
      echo "Pattern A (Contract-First) services REQUIRE mappers.ts for compile-time checkpoint."
      echo ""
      echo "Fix: Create $SERVICE_PATH/mappers.ts with transformation functions:"
      echo ""
      echo "  import type { Database } from '@/types/database.types';"
      echo "  import type { YourDTO } from './dtos';"
      echo ""
      echo "  type DbRow = Database['public']['Tables']['your_table']['Row'];"
      echo ""
      echo "  export function toYourDTO(row: DbRow): YourDTO {"
      echo "    return {"
      echo "      // Map fields explicitly"
      echo "    };"
      echo "  }"
      echo ""
      echo "Reference: SLAD §321-325, §384-418"
      echo ""
      VIOLATIONS_FOUND=1
    fi
  fi
done

# ==============================================================================
# Check 4: Class-based services BANNED (SLAD §1239-1242, Anti-Patterns §80-96)
# ==============================================================================
if [ -n "$STAGED_SERVICE_FILES" ]; then
  CLASS_VIOLATIONS=$(echo "$STAGED_SERVICE_FILES" | xargs grep -l "export class.*Service" 2>/dev/null || true)

  if [ -n "$CLASS_VIOLATIONS" ]; then
    echo "❌ ANTI-PATTERN: Class-based services detected"
    echo ""
    echo "Files with violations:"
    echo "$CLASS_VIOLATIONS" | while read -r file; do
      echo "  - $file"
      grep -n "export class.*Service" "$file" 2>/dev/null | head -3 | sed 's/^/    /'
    done
    echo ""
    echo "Fix: Use functional factory pattern:"
    echo ""
    echo "  ❌ WRONG:"
    echo "  export class PlayerService {"
    echo "    constructor(private supabase: SupabaseClient) {}"
    echo "  }"
    echo ""
    echo "  ✅ CORRECT:"
    echo "  export interface PlayerService { ... }"
    echo "  export function createPlayerService("
    echo "    supabase: SupabaseClient<Database>"
    echo "  ): PlayerService { ... }"
    echo ""
    echo "Reference: SLAD §1239-1242, Anti-Patterns §80-96"
    echo ""
    VIOLATIONS_FOUND=1
  fi
fi

# ==============================================================================
# Check 5: Untyped Supabase client BANNED (SLAD §1228-1229, Anti-Patterns §28-38)
# ==============================================================================
if [ -n "$STAGED_SERVICE_FILES" ]; then
  UNTYPED_VIOLATIONS=$(echo "$STAGED_SERVICE_FILES" | xargs grep -l "supabase:[[:space:]]*any" 2>/dev/null || true)

  if [ -n "$UNTYPED_VIOLATIONS" ]; then
    echo "❌ ANTI-PATTERN: Untyped Supabase client (supabase: any)"
    echo ""
    echo "Files with violations:"
    echo "$UNTYPED_VIOLATIONS" | while read -r file; do
      echo "  - $file"
      grep -n "supabase:[[:space:]]*any" "$file" 2>/dev/null | head -3 | sed 's/^/    /'
    done
    echo ""
    echo "Fix: Use typed Supabase client:"
    echo ""
    echo "  ❌ WRONG:"
    echo "  function createService(supabase: any) { ... }"
    echo ""
    echo "  ✅ CORRECT:"
    echo "  function createService("
    echo "    supabase: SupabaseClient<Database>"
    echo "  ): ServiceInterface { ... }"
    echo ""
    echo "Reference: SLAD §1228-1229, Anti-Patterns §28-38"
    echo ""
    VIOLATIONS_FOUND=1
  fi
fi

# ==============================================================================
# Check 6: RPC-Managed Tables - Direct Insert BANNED (SRM §1605-1609)
# ==============================================================================
if [ -n "$STAGED_SERVICE_FILES" ]; then
  # player_financial_transaction
  FINANCE_VIOLATIONS=$(echo "$STAGED_SERVICE_FILES" | xargs grep -l "\.from(['\"]player_financial_transaction['\"]).*\.insert" 2>/dev/null || true)

  if [ -n "$FINANCE_VIOLATIONS" ]; then
    echo "❌ ANTI-PATTERN: Direct insert to player_financial_transaction"
    echo ""
    echo "Files with violations:"
    echo "$FINANCE_VIOLATIONS" | while read -r file; do
      echo "  - $file"
    done
    echo ""
    echo "Fix: Use rpc_create_financial_txn RPC:"
    echo ""
    echo "  ❌ WRONG:"
    echo "  await supabase.from('player_financial_transaction').insert({ ... })"
    echo ""
    echo "  ✅ CORRECT:"
    echo "  await supabase.rpc('rpc_create_financial_txn', {"
    echo "    p_casino_id, p_player_id, p_amount, ..."
    echo "  })"
    echo ""
    echo "Reference: SRM §1605-1609, SLAD §1138-1152"
    echo ""
    VIOLATIONS_FOUND=1
  fi

  # loyalty_ledger without idempotency
  LOYALTY_VIOLATIONS=$(echo "$STAGED_SERVICE_FILES" | xargs grep -l "\.from(['\"]loyalty_ledger['\"]).*\.insert" 2>/dev/null || true)

  if [ -n "$LOYALTY_VIOLATIONS" ]; then
    echo "⚠️  WARNING: Direct insert to loyalty_ledger detected"
    echo ""
    echo "Files to verify:"
    echo "$LOYALTY_VIOLATIONS" | while read -r file; do
      echo "  - $file"
    done
    echo ""
    echo "Ensure idempotency_key is included in insert:"
    echo ""
    echo "  await supabase.from('loyalty_ledger').insert({"
    echo "    ...data,"
    echo "    idempotency_key: opts?.idempotencyKey  // REQUIRED"
    echo "  })"
    echo ""
    echo "Reference: SRM §1605-1609"
    echo ""
    # Not blocking, but warning
  fi

  # mtl_entry without idempotency
  MTL_VIOLATIONS=$(echo "$STAGED_SERVICE_FILES" | xargs grep -l "\.from(['\"]mtl_entry['\"]).*\.insert" 2>/dev/null || true)

  if [ -n "$MTL_VIOLATIONS" ]; then
    echo "⚠️  WARNING: Direct insert to mtl_entry detected"
    echo ""
    echo "Files to verify:"
    echo "$MTL_VIOLATIONS" | while read -r file; do
      echo "  - $file"
    done
    echo ""
    echo "Ensure idempotency_key is included in insert."
    echo "Reference: SRM §1605-1609"
    echo ""
  fi
fi

# ==============================================================================
# Check 7: Global Singletons BANNED (Anti-Patterns §98-117)
# ==============================================================================
if [ -n "$STAGED_SERVICE_FILES" ]; then
  SINGLETON_VIOLATIONS=$(echo "$STAGED_SERVICE_FILES" | xargs grep -l "const.*Service[[:space:]]*=[[:space:]]*create.*Service(" 2>/dev/null || true)

  if [ -n "$SINGLETON_VIOLATIONS" ]; then
    echo "❌ ANTI-PATTERN: Global service singleton detected"
    echo ""
    echo "Files with violations:"
    echo "$SINGLETON_VIOLATIONS" | while read -r file; do
      echo "  - $file"
      grep -n "const.*Service.*=.*create.*Service" "$file" 2>/dev/null | head -3 | sed 's/^/    /'
    done
    echo ""
    echo "Fix: Create services at call site, not as module-level constants:"
    echo ""
    echo "  ❌ WRONG:"
    echo "  const playerService = createPlayerService(globalSupabase);"
    echo "  export default playerService;"
    echo ""
    echo "  ✅ CORRECT:"
    echo "  // In server action or route handler:"
    echo "  const supabase = await createClient();"
    echo "  const service = createPlayerService(supabase);"
    echo ""
    echo "Reference: Anti-Patterns §98-117"
    echo ""
    VIOLATIONS_FOUND=1
  fi
fi

# ==============================================================================
# Check 8: console.* in production paths BANNED (Anti-Patterns §686-705)
# ==============================================================================
if [ -n "$STAGED_SERVICE_FILES" ]; then
  CONSOLE_VIOLATIONS=$(echo "$STAGED_SERVICE_FILES" | xargs grep -l "console\.\(log\|error\|warn\|debug\|info\)" 2>/dev/null || true)

  if [ -n "$CONSOLE_VIOLATIONS" ]; then
    echo "❌ ANTI-PATTERN: console.* in service files"
    echo ""
    echo "Files with violations:"
    echo "$CONSOLE_VIOLATIONS" | while read -r file; do
      echo "  - $file"
      grep -n "console\." "$file" 2>/dev/null | head -5 | sed 's/^/    /'
    done
    echo ""
    echo "Fix: Use structured logging via telemetry helpers"
    echo "Reference: Anti-Patterns §686-705"
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
  echo "  - SLAD: docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md"
  echo "  - SRM: docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md"
  echo "  - Anti-Patterns: docs/70-governance/ANTI_PATTERN_CATALOG.md"
  echo ""
  echo "DTO Pattern Quick Reference:"
  echo "  Pattern A (Loyalty, Finance, MTL, TableContext): interface OK, mappers.ts REQUIRED"
  echo "  Pattern B (Player, Visit, Casino, FloorLayout): interface BANNED, use type + Pick/Omit"
  echo "  Pattern C (RatingSlip): Hybrid - per-DTO basis"
  echo ""
  exit 1
fi

echo "✅ All service layer checks passed"
exit 0

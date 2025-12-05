#!/bin/sh
# ==============================================================================
# Service Layer Anti-Pattern Detection (Pattern-Aware)
# ==============================================================================
# Version: 2.4.0
# Date: 2025-12-03
# References:
#   - SLAD: docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md
#   - SRM: docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
#   - Anti-Patterns: docs/70-governance/ANTI_PATTERN_CATALOG.md
#   - ADR-013: docs/80-adrs/ADR-013-zod-validation-schemas.md (Zod schemas)
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
PATTERN_A_SERVICES="loyalty|finance|mtl"

# Pattern B (Canonical CRUD): Manual interfaces BANNED, Pick/Omit REQUIRED
PATTERN_B_SERVICES="player|visit|casino|floor-layout"

# Pattern C (Hybrid): Per-DTO basis (interface OR type allowed per DTO)
# NOTE: Hybrid does NOT exempt from dtos.ts requirement - all DTOs must be in dtos.ts
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
for service in loyalty finance mtl; do
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
# Check 8: Inline DTOs BANNED - Must be in dtos.ts (SLAD §315-319)
# ==============================================================================
# DTOs must live in dedicated dtos.ts files, not inline in feature files.
# This applies to ALL patterns (A, B, C) - Hybrid does NOT exempt from this rule.
if [ -n "$STAGED_SERVICE_FILES" ]; then
  INLINE_DTO_VIOLATIONS=""

  for file in $STAGED_SERVICE_FILES; do
    # Skip dtos.ts files (that's where DTOs should be)
    if echo "$file" | grep -q "/dtos\.ts$"; then
      continue
    fi

    # Skip keys.ts files (filter types are allowed there)
    if echo "$file" | grep -q "/keys\.ts$"; then
      continue
    fi

    # Skip test files
    if echo "$file" | grep -q "\.test\.ts$\|\.spec\.ts$"; then
      continue
    fi

    # Skip mappers.ts (internal type aliases allowed)
    if echo "$file" | grep -q "/mappers\.ts$"; then
      continue
    fi

    # Skip schemas.ts (Zod-inferred types are valid co-location)
    if echo "$file" | grep -q "/schemas\.ts$"; then
      continue
    fi

    # Skip type-guards.ts (runtime type guards may need co-located types)
    if echo "$file" | grep -q "/type-guards\.ts$"; then
      continue
    fi

    # Check for DTO-like exports (interface or type with DTO/Input/Response/Params suffix)
    DTO_PATTERNS=$(grep -nE "^export (interface|type) [A-Z][a-zA-Z]*(DTO|Input|Response|Params|Create|Update)[^=]*[={]" "$file" 2>/dev/null || true)

    if [ -n "$DTO_PATTERNS" ]; then
      INLINE_DTO_VIOLATIONS="$INLINE_DTO_VIOLATIONS
  - $file"
      echo "$DTO_PATTERNS" | head -5 | while read -r line; do
        INLINE_DTO_VIOLATIONS="$INLINE_DTO_VIOLATIONS
    $line"
      done
    fi
  done

  if [ -n "$INLINE_DTO_VIOLATIONS" ]; then
    echo "❌ ANTI-PATTERN: Inline DTOs detected (must be in dtos.ts)"
    echo ""
    echo "DTOs MUST be centralized in services/{domain}/dtos.ts files."
    echo "This applies to ALL patterns including Hybrid (Pattern C)."
    echo ""
    echo "Files with violations:$INLINE_DTO_VIOLATIONS"
    echo ""
    echo "Fix: Move DTOs to dedicated dtos.ts file:"
    echo ""
    echo "  ❌ WRONG (in lifecycle.ts, crud.ts, etc.):"
    echo "  export interface StartRatingSlipInput {"
    echo "    playerId: string;"
    echo "  }"
    echo ""
    echo "  ✅ CORRECT (in dtos.ts):"
    echo "  // services/rating-slip/dtos.ts"
    echo "  export interface StartRatingSlipInput {"
    echo "    playerId: string;"
    echo "  }"
    echo ""
    echo "  // services/rating-slip/lifecycle.ts"
    echo "  import type { StartRatingSlipInput } from './dtos';"
    echo ""
    echo "Reference: SLAD §315-319, DTO_CANONICAL_STANDARD.md"
    echo ""
    VIOLATIONS_FOUND=1
  fi
fi

# ==============================================================================
# Check 9: Required File Structure (SLAD §308-350, ADR-013)
# ==============================================================================
# Pattern B services MUST have: dtos.ts, selects.ts, keys.ts, http.ts, index.ts, crud.ts
# HTTP boundary services MUST also have: schemas.ts (ADR-013)
# This check runs when ANY file in a Pattern B service is staged
if [ -n "$STAGED_SERVICE_FILES" ]; then
  PATTERN_B_SERVICES_LIST="player visit casino floor-layout"
  REQUIRED_FILES_B="dtos.ts selects.ts keys.ts http.ts index.ts crud.ts"
  # HTTP boundary services need schemas.ts (ADR-013)
  HTTP_BOUNDARY_SERVICES="player visit casino"

  FILE_STRUCTURE_VIOLATIONS=""
  SCHEMA_VIOLATIONS=""

  for service in $PATTERN_B_SERVICES_LIST; do
    SERVICE_PATH="services/$service"

    # Check if any file in this service is staged
    STAGED_IN_SERVICE=$(echo "$STAGED_SERVICE_FILES" | grep "^$SERVICE_PATH/" || true)

    if [ -n "$STAGED_IN_SERVICE" ] && [ -d "$SERVICE_PATH" ]; then
      MISSING_FILES=""
      for required_file in $REQUIRED_FILES_B; do
        if [ ! -f "$SERVICE_PATH/$required_file" ]; then
          MISSING_FILES="$MISSING_FILES $required_file"
        fi
      done

      if [ -n "$MISSING_FILES" ]; then
        FILE_STRUCTURE_VIOLATIONS="$FILE_STRUCTURE_VIOLATIONS
  - $SERVICE_PATH: MISSING$MISSING_FILES"
      fi

      # Check schemas.ts for HTTP boundary services (ADR-013)
      if echo "$HTTP_BOUNDARY_SERVICES" | grep -qw "$service"; then
        if [ ! -f "$SERVICE_PATH/schemas.ts" ]; then
          SCHEMA_VIOLATIONS="$SCHEMA_VIOLATIONS
  - $SERVICE_PATH: MISSING schemas.ts (ADR-013 REQUIRED for HTTP boundary)"
        fi
      fi
    fi
  done

  if [ -n "$FILE_STRUCTURE_VIOLATIONS" ]; then
    echo "❌ ANTI-PATTERN: Pattern B service missing required files (SLAD §308-350)"
    echo ""
    echo "Pattern B services (Player, Visit, Casino, FloorLayout) REQUIRE:"
    echo "  dtos.ts, selects.ts, keys.ts, http.ts, index.ts, crud.ts"
    echo ""
    echo "Services with violations:$FILE_STRUCTURE_VIOLATIONS"
    echo ""
    echo "Fix: Create missing files following SLAD §308-350 patterns."
    echo ""
    echo "Reference: SLAD §308-350, §429-471"
    echo ""
    VIOLATIONS_FOUND=1
  fi

  if [ -n "$SCHEMA_VIOLATIONS" ]; then
    echo "❌ ANTI-PATTERN: HTTP boundary service missing schemas.ts (ADR-013)"
    echo ""
    echo "Services with HTTP Route Handlers REQUIRE schemas.ts for Zod validation."
    echo ""
    echo "Services with violations:$SCHEMA_VIOLATIONS"
    echo ""
    echo "Fix: Create services/{domain}/schemas.ts with Zod validation schemas:"
    echo ""
    echo "  // services/{domain}/schemas.ts"
    echo "  import { z } from 'zod';"
    echo ""
    echo "  export const createXSchema = z.object({ ... });"
    echo "  export type CreateXInput = z.infer<typeof createXSchema>;"
    echo ""
    echo "Reference: ADR-013 (Zod Validation Schemas Standard)"
    echo ""
    VIOLATIONS_FOUND=1
  fi
fi

# ==============================================================================
# Check 10: console.* in production paths BANNED (Anti-Patterns §686-705)
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
# Check 11: Type assertions in crud.ts BANNED (SLAD §327-359)
# ==============================================================================
# Pattern B services with crud.ts MUST use mappers.ts instead of `as` casting.
# Allowed: `as const`, `as 'literal'` (string literal narrowing)
# Banned: `as TypeName`, `as TypeName[]` (bypasses type safety)
if [ -n "$STAGED_SERVICE_FILES" ]; then
  CRUD_FILES=$(echo "$STAGED_SERVICE_FILES" | grep "/crud\.ts$" || true)
  AS_CASTING_VIOLATIONS=""

  for file in $CRUD_FILES; do
    # Find lines with 'as' followed by a type name (capital letter)
    # Exclude: 'as const', 'as 'literal'', 'as "literal"', 'as unknown'
    VIOLATIONS=$(grep -nE "[[:space:]]as[[:space:]]+[A-Z]" "$file" 2>/dev/null | grep -v "as const" || true)

    if [ -n "$VIOLATIONS" ]; then
      AS_CASTING_VIOLATIONS="$AS_CASTING_VIOLATIONS
  - $file"
      echo "$VIOLATIONS" | head -5 | while read -r line; do
        AS_CASTING_VIOLATIONS="$AS_CASTING_VIOLATIONS
    $line"
      done
    fi
  done

  if [ -n "$AS_CASTING_VIOLATIONS" ]; then
    echo "❌ ANTI-PATTERN: Type assertions (as) in crud.ts files (SLAD §327-359)"
    echo ""
    echo "Pattern B services with crud.ts MUST use mappers.ts for type-safe transformations."
    echo "Type assertions bypass compile-time safety and hide schema evolution bugs."
    echo ""
    echo "Files with violations:$AS_CASTING_VIOLATIONS"
    echo ""
    echo "Fix: Create/use mappers.ts with explicit transformation functions:"
    echo ""
    echo "  ❌ WRONG (in crud.ts):"
    echo "  const { data } = await supabase.from('player').select(PLAYER_SELECT);"
    echo "  return data as PlayerDTO[];  // V1 VIOLATION"
    echo ""
    echo "  ✅ CORRECT:"
    echo "  // mappers.ts"
    echo "  type PlayerSelectedRow = { id: string; name: string; ... };"
    echo "  export function toPlayerDTO(row: PlayerSelectedRow): PlayerDTO {"
    echo "    return { id: row.id, name: row.name, ... };"
    echo "  }"
    echo ""
    echo "  // crud.ts"
    echo "  import { toPlayerDTOList } from './mappers';"
    echo "  const { data } = await supabase.from('player').select(PLAYER_SELECT);"
    echo "  return toPlayerDTOList(data);  // ✅ Type-safe"
    echo ""
    echo "Reference Implementation: services/casino/mappers.ts"
    echo "Reference: SLAD §327-359, DTO_CANONICAL_STANDARD.md"
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
  echo "  ALL PATTERNS: DTOs must be in dtos.ts (inline DTOs BANNED)"
  echo "  Pattern A (Loyalty, Finance, MTL, TableContext): interface OK, mappers.ts REQUIRED"
  echo "  Pattern B (Player, Visit, Casino, FloorLayout): interface BANNED, use type + Pick/Omit"
  echo "  Pattern C (RatingSlip): Hybrid - per-DTO basis (still requires dtos.ts)"
  echo ""
  exit 1
fi

echo "✅ All service layer checks passed"
exit 0

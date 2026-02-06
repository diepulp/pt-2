#!/bin/sh
# ==============================================================================
# Service Layer Anti-Pattern Detection (Pattern-Aware)
# ==============================================================================
# Version: 2.6.0
# Date: 2025-12-25
# References:
#   - SLAD: docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md
#   - SRM: docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
#   - Anti-Patterns: docs/70-governance/anti-patterns/01-service-layer.md (modular)
#   - ADR-013: docs/80-adrs/ADR-013-zod-validation-schemas.md (Zod schemas)
#   - ADR-015: docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md (RLS)
#   - ADR-023: docs/80-adrs/ADR-023-multi-tenancy-storage-model-selection.md (Pool model)
#   - SEC-001: docs/30-security/SEC-001-rls-policy-matrix.md (Pattern C, no service keys)
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
# Excludes test files (__tests__/*.ts, *.test.ts, *.spec.ts)
# ==============================================================================
if [ -n "$STAGED_SERVICE_FILES" ]; then
  PRODUCTION_SERVICE_FILES=$(echo "$STAGED_SERVICE_FILES" | grep -v "__tests__/" | grep -v "\.test\.ts$" | grep -v "\.spec\.ts$" || true)
  CONSOLE_VIOLATIONS=$(echo "$PRODUCTION_SERVICE_FILES" | xargs grep -l "console\.\(log\|error\|warn\|debug\|info\)" 2>/dev/null || true)

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
# Check 12: Deprecated exec_sql RPC BANNED (ADR-015)
# ==============================================================================
# The exec_sql() loop pattern fails with connection pooling. All context
# injection must use set_rls_context() RPC for atomic SET LOCAL execution.
STAGED_TS_FILES=$(git diff --cached --name-only | grep '\.ts$' | grep -v '/types/' | grep -v '__tests__' | grep -v '\.test\.ts$' || true)

if [ -n "$STAGED_TS_FILES" ]; then
  EXEC_SQL_VIOLATIONS=""
  for file in $STAGED_TS_FILES; do
    # Check for exec_sql RPC calls (excluding type definitions)
    if grep -qE "\.rpc\(['\"]exec_sql['\"]" "$file" 2>/dev/null; then
      EXEC_SQL_VIOLATIONS="$EXEC_SQL_VIOLATIONS
  - $file"
      grep -n "\.rpc.*exec_sql" "$file" 2>/dev/null | head -3 | while read -r line; do
        echo "    $line"
      done
    fi
  done

  if [ -n "$EXEC_SQL_VIOLATIONS" ]; then
    echo "❌ ANTI-PATTERN: Deprecated exec_sql RPC usage (ADR-015)"
    echo ""
    echo "The exec_sql() loop pattern FAILS with Supabase connection pooling."
    echo "Each call may execute on a different pooled connection."
    echo ""
    echo "Files with violations:$EXEC_SQL_VIOLATIONS"
    echo ""
    echo "Fix: Use set_rls_context() RPC instead:"
    echo ""
    echo "  ❌ WRONG (DEPRECATED - fails with connection pooling):"
    echo "  for (const stmt of statements) {"
    echo "    await supabase.rpc('exec_sql', { sql: stmt });"
    echo "  }"
    echo ""
    echo "  ✅ CORRECT (ADR-015 compliant):"
    echo "  await supabase.rpc('set_rls_context', {"
    echo "    p_actor_id: context.actorId,"
    echo "    p_casino_id: context.casinoId,"
    echo "    p_staff_role: context.staffRole,"
    echo "  });"
    echo ""
    echo "Reference: ADR-015, SEC-001 (Pattern C)"
    echo ""
    VIOLATIONS_FOUND=1
  fi
fi

# ==============================================================================
# Check 13: Direct SET LOCAL strings BANNED outside canonical files (ADR-015)
# ==============================================================================
# SET LOCAL must only appear in:
#   - lib/supabase/rls-context.ts (canonical implementation)
#   - lib/server-actions/middleware/rls.ts (middleware comments)
#   - Test files (__tests__/*.ts)
#   - Documentation/comments
# Direct SET LOCAL in service code bypasses the atomic RPC wrapper.

if [ -n "$STAGED_TS_FILES" ]; then
  SETLOCAL_VIOLATIONS=""
  CANONICAL_RLS_FILES="lib/supabase/rls-context.ts lib/server-actions/middleware/rls.ts"

  for file in $STAGED_TS_FILES; do
    # Skip canonical files and tests
    SKIP_FILE=0
    for canonical in $CANONICAL_RLS_FILES; do
      if echo "$file" | grep -q "$canonical"; then
        SKIP_FILE=1
        break
      fi
    done
    if [ $SKIP_FILE -eq 1 ]; then continue; fi
    if echo "$file" | grep -q "__tests__"; then continue; fi
    if echo "$file" | grep -q "\.test\.ts$"; then continue; fi

    # Check for SET LOCAL string literals (not in comments)
    # Look for: 'SET LOCAL' or "SET LOCAL" or `SET LOCAL`
    if grep -qE "['\"\`]SET LOCAL" "$file" 2>/dev/null; then
      SETLOCAL_VIOLATIONS="$SETLOCAL_VIOLATIONS
  - $file"
      grep -nE "['\"\`]SET LOCAL" "$file" 2>/dev/null | head -3 | while read -r line; do
        echo "    $line"
      done
    fi
  done

  if [ -n "$SETLOCAL_VIOLATIONS" ]; then
    echo "❌ ANTI-PATTERN: Direct SET LOCAL strings outside canonical files (ADR-015)"
    echo ""
    echo "SET LOCAL must only be used via set_rls_context() RPC."
    echo "Direct SET LOCAL strings bypass the atomic transaction wrapper."
    echo ""
    echo "Files with violations:$SETLOCAL_VIOLATIONS"
    echo ""
    echo "Fix: Use injectRLSContext() from canonical location:"
    echo ""
    echo "  ❌ WRONG:"
    echo "  await supabase.rpc('exec_sql', { sql: \"SET LOCAL app.casino_id = 'uuid'\" });"
    echo ""
    echo "  ✅ CORRECT:"
    echo "  import { injectRLSContext } from '@/lib/supabase/rls-context';"
    echo "  await injectRLSContext(supabase, context, correlationId);"
    echo ""
    echo "Canonical files: lib/supabase/rls-context.ts"
    echo "Reference: ADR-015, SEC-001"
    echo ""
    VIOLATIONS_FOUND=1
  fi
fi

# ==============================================================================
# Check 14: current_setting without JWT fallback in TypeScript (ADR-015)
# ==============================================================================
# TypeScript code that builds SQL with current_setting('app.casino_id')
# without COALESCE fallback may fail when JWT claims are used.
# This is a warning only since most code should use RPC wrappers.

if [ -n "$STAGED_TS_FILES" ]; then
  CURRENTSETTING_WARNINGS=""

  for file in $STAGED_TS_FILES; do
    # Skip test files and canonical RLS files
    if echo "$file" | grep -q "__tests__"; then continue; fi
    if echo "$file" | grep -q "\.test\.ts$"; then continue; fi

    # Check for current_setting without COALESCE in string literals
    if grep -qE "current_setting\(['\"]app\." "$file" 2>/dev/null; then
      if ! grep -q "COALESCE" "$file" 2>/dev/null; then
        CURRENTSETTING_WARNINGS="$CURRENTSETTING_WARNINGS
  - $file"
      fi
    fi
  done

  if [ -n "$CURRENTSETTING_WARNINGS" ]; then
    echo "⚠️  CHECK 14 WARNING: current_setting() without COALESCE fallback"
    echo ""
    echo "Files to verify:$CURRENTSETTING_WARNINGS"
    echo ""
    echo "If building SQL that uses current_setting('app.casino_id'),"
    echo "ensure it includes JWT fallback for connection pooling safety."
    echo ""
    echo "ADR-015 Pattern C (Hybrid):"
    echo "  COALESCE("
    echo "    NULLIF(current_setting('app.casino_id', true), '')::uuid,"
    echo "    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid"
    echo "  )"
    echo ""
    echo "Reference: ADR-015, SEC-001 Pattern C"
    echo ""
    # Warning only, not blocking
  fi
fi

# ==============================================================================
# Check 15: Staff mutations without JWT claims sync (ADR-015 Phase 2)
# ==============================================================================
# When creating/updating staff with user_id (pit_boss, admin), JWT claims must
# be synced via syncUserRLSClaims(). The database trigger provides backup,
# but application-layer sync ensures immediate consistency.
#
# Canonical implementation: services/casino/crud.ts (createStaff, updateStaff)

if [ -n "$STAGED_TS_FILES" ]; then
  JWT_SYNC_WARNINGS=""

  for file in $STAGED_TS_FILES; do
    # Skip test files, types, and canonical implementation
    if echo "$file" | grep -q "__tests__"; then continue; fi
    if echo "$file" | grep -q "\.test\.ts$"; then continue; fi
    if echo "$file" | grep -q "/types/"; then continue; fi
    if echo "$file" | grep -q "services/casino/crud.ts"; then continue; fi
    if echo "$file" | grep -q "lib/supabase/auth-admin.ts"; then continue; fi

    # Check for staff table INSERT operations
    HAS_STAFF_INSERT=$(grep -c "\.from(['\"]staff['\"]).*\.insert\|\.insert.*staff" "$file" 2>/dev/null || true)

    # Check for staff table UPDATE operations
    HAS_STAFF_UPDATE=$(grep -c "\.from(['\"]staff['\"]).*\.update\|\.update.*staff" "$file" 2>/dev/null || true)

    if [ "$HAS_STAFF_INSERT" -gt 0 ] || [ "$HAS_STAFF_UPDATE" -gt 0 ]; then
      # Check if file imports syncUserRLSClaims
      HAS_JWT_SYNC=$(grep -c "syncUserRLSClaims" "$file" 2>/dev/null || true)

      if [ "$HAS_JWT_SYNC" -eq 0 ]; then
        JWT_SYNC_WARNINGS="$JWT_SYNC_WARNINGS
  - $file (staff INSERT/UPDATE without syncUserRLSClaims)"
      fi
    fi
  done

  if [ -n "$JWT_SYNC_WARNINGS" ]; then
    echo "⚠️  CHECK 15 WARNING: Staff mutations without JWT claims sync (ADR-015 Phase 2)"
    echo ""
    echo "Files to verify:$JWT_SYNC_WARNINGS"
    echo ""
    echo "When creating/updating staff with user_id, JWT claims should be synced"
    echo "for immediate consistency with RLS policies."
    echo ""
    echo "The database trigger 'trg_sync_staff_jwt_claims' provides backup sync,"
    echo "but application-layer sync via syncUserRLSClaims() is recommended."
    echo ""
    echo "Pattern (from services/casino/crud.ts):"
    echo "  import { syncUserRLSClaims } from '@/lib/supabase/auth-admin';"
    echo ""
    echo "  // After creating staff with user_id:"
    echo "  if (input.user_id && input.casino_id) {"
    echo "    await syncUserRLSClaims(input.user_id, {"
    echo "      casino_id: input.casino_id,"
    echo "      staff_role: input.role,"
    echo "      staff_id: data.id,"
    echo "    });"
    echo "  }"
    echo ""
    echo "Reference: ADR-015 Phase 2, services/casino/crud.ts"
    echo ""
    # Warning only - database trigger provides backup
  fi
fi

# ==============================================================================
# Check 16: Service client import in production paths (SEC-001)
# ==============================================================================
# The service client (createServiceClient) bypasses RLS completely.
# It should ONLY be used in:
#   - Test files (__tests__/*.ts, *.test.ts)
#   - Dev auth middleware (lib/server-actions/middleware/auth.ts)
#   - The service client itself (lib/supabase/service.ts)
#
# Using it in production paths (app/, services/, other lib/) is a security violation.

if [ -n "$STAGED_TS_FILES" ]; then
  SERVICE_CLIENT_VIOLATIONS=""

  for file in $STAGED_TS_FILES; do
    # Skip test files
    if echo "$file" | grep -q "__tests__"; then continue; fi
    if echo "$file" | grep -q "\.test\.ts$\|\.spec\.ts$"; then continue; fi

    # Skip allowed files
    if echo "$file" | grep -q "lib/supabase/service\.ts$"; then continue; fi
    if echo "$file" | grep -q "lib/server-actions/middleware/auth\.ts$"; then continue; fi

    # Check for service client import
    if grep -qE "from ['\"]@/lib/supabase/service['\"]|from ['\"].*lib/supabase/service['\"]" "$file" 2>/dev/null; then
      SERVICE_CLIENT_VIOLATIONS="$SERVICE_CLIENT_VIOLATIONS
  - $file"
      grep -n "lib/supabase/service" "$file" 2>/dev/null | head -3 | while read -r line; do
        echo "    $line"
      done
    fi
  done

  if [ -n "$SERVICE_CLIENT_VIOLATIONS" ]; then
    echo "❌ ANTI-PATTERN: Service client import in production paths (SEC-001)"
    echo ""
    echo "The service client (createServiceClient) BYPASSES RLS completely."
    echo "It is ONLY allowed in tests and the dev auth middleware."
    echo ""
    echo "Files with violations:$SERVICE_CLIENT_VIOLATIONS"
    echo ""
    echo "Fix: Use createClient from @/lib/supabase/server instead:"
    echo ""
    echo "  ❌ WRONG:"
    echo "  import { createServiceClient } from '@/lib/supabase/service';"
    echo ""
    echo "  ✅ CORRECT:"
    echo "  import { createClient } from '@/lib/supabase/server';"
    echo ""
    echo "WHY: Service client bypasses RLS, allowing access to ALL tenants' data."
    echo "     Production code must use authenticated client with RLS enforced."
    echo ""
    echo "Reference: SEC-001 (no service keys in runtime), ADR-023 (Pool model)"
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
  echo "  - Anti-Patterns: docs/70-governance/anti-patterns/01-service-layer.md"
  echo "  - ADR-015: docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md"
  echo "  - SEC-001: docs/30-security/SEC-001-rls-policy-matrix.md"
  echo ""
  echo "DTO Pattern Quick Reference:"
  echo "  ALL PATTERNS: DTOs must be in dtos.ts (inline DTOs BANNED)"
  echo "  Pattern A (Loyalty, Finance, MTL, TableContext): interface OK, mappers.ts REQUIRED"
  echo "  Pattern B (Player, Visit, Casino, FloorLayout): interface BANNED, use type + Pick/Omit"
  echo "  Pattern C (RatingSlip): Hybrid - per-DTO basis (still requires dtos.ts)"
  echo ""
  echo "RLS Pattern Quick Reference (ADR-015):"
  echo "  ✅ Use: injectRLSContext() from lib/supabase/rls-context.ts"
  echo "  ✅ Use: set_rls_context() RPC (atomic transaction wrapper)"
  echo "  ❌ Ban: exec_sql() loop pattern (connection pooling fails)"
  echo "  ❌ Ban: Direct SET LOCAL strings in service code"
  echo ""
  exit 1
fi

echo "✅ All service layer checks passed"
exit 0

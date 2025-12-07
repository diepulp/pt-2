# DTO Compliance Guide for Architecture

**Source**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md` v2.1.0
**Purpose**: Ensure architectural decisions enforce DTO standards during design phase.
**Status**: MANDATORY - All new service designs MUST comply.

---

## Quick Reference: Which Pattern?

```
┌─ Pattern B (Canonical CRUD)
│  Services: casino, player, visit, floor-layout
│  DTOs: MUST use Pick/Omit from Database types
│  Files: dtos.ts REQUIRED, schemas.ts REQUIRED
│
├─ Pattern A (Contract-First)
│  Services: loyalty, finance, mtl
│  DTOs: Manual interfaces allowed (with mappers)
│  Files: dtos.ts when consumed by 2+ services
│
└─ Pattern C (Hybrid)
   Services: table-context, rating-slip
   DTOs: Mix of Pick/Omit and manual interfaces
   Files: dtos.ts recommended for cross-context publishing
```

---

## Pattern B: Canonical CRUD Services

**Services**: casino, player, visit, floor-layout

### Required File Structure

```
services/{domain}/
├── dtos.ts              # ✅ REQUIRED - Pick/Omit from Database types
├── selects.ts           # ✅ REQUIRED - Named column sets
├── mappers.ts           # ✅ REQUIRED - Row → DTO transformations (for services with crud.ts)
├── mappers.test.ts      # ✅ REQUIRED - Unit tests for mappers (100% coverage)
├── keys.ts              # ✅ REQUIRED - React Query key factories
├── http.ts              # ✅ REQUIRED - HTTP fetchers for client-side
├── index.ts             # ✅ REQUIRED - Service factory (functional)
├── crud.ts              # ✅ REQUIRED - CRUD operations (uses mappers, NO `as` casting)
└── README.md            # Service documentation
```

**Reference Implementation**: `services/casino/` (CasinoService)

### DTO Pattern Examples

```typescript
// services/player/dtos.ts

import type { Database } from '@/types/database.types';

// Base types for Pick/Omit
type PlayerRow = Database['public']['Tables']['player']['Row'];
type PlayerInsert = Database['public']['Tables']['player']['Insert'];

// ✅ CORRECT - Response DTO with explicit fields
export type PlayerDTO = Pick<
  PlayerRow,
  'id' | 'first_name' | 'last_name' | 'created_at'
>;

// ✅ CORRECT - Create DTO from Insert type
export type PlayerCreateDTO = Pick<
  PlayerInsert,
  'first_name' | 'last_name' | 'birth_date'
>;

// ✅ CORRECT - Update DTO (partial)
export type PlayerUpdateDTO = Partial<
  Pick<PlayerInsert, 'first_name' | 'last_name'>
>;
```

### Banned in Pattern B

**Pre-commit Enforcement**: Check 11 in `.husky/pre-commit-service-check.sh` automatically blocks `as` type casting in crud.ts files.

```typescript
// ❌ BANNED - Manual interface (schema evolution blindness)
export interface PlayerDTO {
  id: string;
  first_name: string;
  last_name: string;
}
// Why: If migration adds column, interface unchanged, data silently dropped

// ❌ BANNED - Raw Row export
export type PlayerDTO = Database['public']['Tables']['player']['Row'];
// Why: Exposes ALL columns including internal fields (ssn, risk_score, etc.)

// ❌ BANNED - Type assertions in crud.ts (PRE-COMMIT ENFORCED)
const result = data as PlayerDTO;
// Why: Bypasses type safety; use mapper functions instead
// Enforcement: Check 11 blocks commits with `as TypeName` in crud.ts
```

### Mappers Pattern (REQUIRED for services with crud.ts)

When a Pattern B service has `crud.ts` with direct database operations, **mappers.ts is REQUIRED**:

```typescript
// services/{domain}/mappers.ts

import type { PlayerDTO } from './dtos';

// 1. Define Selected Row types matching query projections (NOT full Row types)
//    These types MUST match what selects.ts columns return
type PlayerSelectedRow = {
  id: string;
  first_name: string;
  last_name: string;
  created_at: string;
};

// 2. Create mapper functions for each DTO
export function toPlayerDTO(row: PlayerSelectedRow): PlayerDTO {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    created_at: row.created_at,
  };
}

// 3. Create list/nullable variants
export function toPlayerDTOList(rows: PlayerSelectedRow[]): PlayerDTO[] {
  return rows.map(toPlayerDTO);
}

export function toPlayerDTOOrNull(row: PlayerSelectedRow | null): PlayerDTO | null {
  return row ? toPlayerDTO(row) : null;
}
```

**Why Mappers are Required**:
- Eliminates `as` type assertions in crud.ts (V1 violations)
- Selected row types match query projections, not full Row types
- Cursor pagination may require fields (like `created_at`) not in the DTO
- Provides compile-time safety when columns change

**Reference Implementation**: `services/casino/mappers.ts`

---

## Pattern A: Contract-First Services

**Services**: loyalty, finance, mtl

### When to Use

- Complex business logic with domain contracts
- Cross-context boundaries
- Schema decoupled from domain model

### DTO Pattern Examples

```typescript
// services/loyalty/dtos.ts (when needed)

// ✅ ALLOWED - Manual interface for domain contract
export interface PlayerLoyaltyDTO {
  player_id: string;
  casino_id: string;
  balance: number;
  tier: string | null;
  // Intentionally omits: preferences (internal field)
}

// ✅ REQUIRED - Mapper provides compile-time safety
import type { Database } from '@/types/database.types';
type LoyaltyRow = Database['public']['Tables']['player_loyalty']['Row'];

export function toPlayerLoyaltyDTO(row: LoyaltyRow): PlayerLoyaltyDTO {
  return {
    player_id: row.player_id,
    casino_id: row.casino_id,
    balance: row.balance,
    tier: row.tier,
    // Explicitly omit: preferences
  };
}
```

**Key Safety**: Mapper function with typed input catches schema changes at compile time.

---

## Pattern C: Hybrid Services

**Services**: rating-slip (when rebuilt), table-context (when rebuilt)

> **Status**: RatingSlipService and TableContextService were removed during technical debt cleanup.
> When rebuilt per PRD-002/PRD-006, they should follow the patterns below.

### Pattern C DTO Requirements (For Future Rebuild)

When rebuilding Pattern C (Hybrid) services, follow these rules:

**Required Files**:
```
services/{domain}/
├── dtos.ts              # ✅ REQUIRED - Pick/Omit types + cross-context DTOs
├── mappers.ts           # ✅ REQUIRED if cross-context consumption
├── keys.ts              # ✅ REQUIRED - React Query key factories
├── http.ts              # HTTP fetchers
├── index.ts             # Service factory
├── crud.ts              # CRUD operations
└── selects.ts           # Named column sets
```

**Example DTO Structure** (for RatingSlipService when rebuilt per PRD-002 + EXEC-VSE-001):

```typescript
// services/rating-slip/dtos.ts

import type { Database } from '@/types/database.types';

type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];

// Public DTO for consumers (Loyalty, Finance)
// NOTE: No player_id - player identity derived from visit.player_id (EXEC-VSE-001)
export type RatingSlipDTO = Pick<
  RatingSlipRow,
  'id' | 'casino_id' | 'visit_id' | 'table_id' |
  'seat_number' | 'status' | 'start_time' | 'end_time' | 'average_bet'
>;

// Cross-context DTO for Loyalty consumption (per EXEC-VSE-001)
// Player identity comes from the associated visit
export interface RatingSlipTelemetryDTO {
  id: string;
  visit_id: string;        // Player identity derived via visit.player_id
  casino_id: string;
  average_bet: number | null;
  duration_seconds: number;
  game_type: 'blackjack' | 'poker' | 'roulette' | 'baccarat';
}
```

---

## Cross-Context Rules

### Never Do This

```typescript
// services/loyalty/mid-session-reward.ts

// ❌ VIOLATION - Loyalty accessing RatingSlip table directly
import type { Database } from '@/types/database.types';
type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];
```

### Always Do This

```typescript
// services/loyalty/mid-session-reward.ts

// ✅ CORRECT - Import published DTO from owning service
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';

function calculateReward(telemetry: RatingSlipTelemetryDTO): number {
  return telemetry.duration_seconds * telemetry.average_bet * 0.01;
}
```

---

## RPC Type Safety (CRITICAL)

### Never Use `as` Casting

```typescript
// ❌ VIOLATION - bypasses type safety
const { data, error } = await supabase.rpc('rpc_start_rating_slip', params);
return data as RatingSlipDTO;  // Type safety bypassed!

// ❌ VIOLATION - complex shape casting
const result = data as { slip: RatingSlipDTO; duration_seconds: number };
```

### Use Generated Types + Mappers

```typescript
// ✅ CORRECT - use generated RPC types
import type { Database } from '@/types/database.types';

type RpcArgs = Database['public']['Functions']['rpc_start_rating_slip']['Args'];
type RpcReturns = Database['public']['Functions']['rpc_start_rating_slip']['Returns'];

function mapToRatingSlipDTO(data: RpcReturns): RatingSlipDTO {
  return {
    id: data.id,
    casino_id: data.casino_id,
    // ... explicit mapping
  };
}

export async function startSlip(...): Promise<RatingSlipDTO> {
  const { data, error } = await supabase.rpc('rpc_start_rating_slip', params);
  if (error) throw mapDatabaseError(error);
  return mapToRatingSlipDTO(data);  // ✅ Type-safe
}
```

### Type Guards for Complex Returns

```typescript
// Type guard for runtime validation
function isValidCloseSlipResponse(
  data: unknown
): data is { slip: RatingSlipDTO; duration_seconds: number }[] {
  if (!Array.isArray(data) || data.length !== 1) return false;
  const obj = data[0];
  return (
    typeof obj?.duration_seconds === 'number' &&
    obj?.slip !== null
  );
}
```

---

## Architecture Review Checklist

When reviewing or designing service architecture:

### Pattern B Services
- [ ] `dtos.ts` file exists with Pick/Omit types
- [ ] `selects.ts` file exists with named column sets
- [ ] `mappers.ts` file exists with Row → DTO transformations
- [ ] `mappers.test.ts` file exists with unit tests (100% coverage target)
- [ ] `schemas.ts` file exists with Zod validation (for HTTP boundaries)
- [ ] NO manual `interface` declarations
- [ ] NO raw `Row` type exports
- [ ] NO `as` type assertions in crud.ts (use mappers instead)
- [ ] Response DTOs explicitly list allowed fields

### Pattern A/C Services
- [ ] If consumed by 2+ services, DTOs in `dtos.ts`
- [ ] Cross-context DTOs documented and published
- [ ] Mappers exist with typed inputs
- [ ] Manual interfaces have JSDoc explaining field selection

### All Services
- [ ] NO `as` casting on RPC responses or query results
- [ ] Mappers use typed input from selects.ts projections or RPC returns
- [ ] Type guards exist for complex RPC shapes
- [ ] NO cross-context `Database['...']['Tables']['foreign']` access

---

## Quick Audit Commands

```bash
# Find Pattern B services missing dtos.ts
for s in casino player visit floor-layout; do
  [[ -f "services/$s/dtos.ts" ]] || echo "MISSING: services/$s/dtos.ts"
done

# Find manual interface violations in Pattern B
grep -r "export interface.*DTO" services/player/ services/visit/ services/casino/

# Find `as` casting in crud.ts files (Check 11 enforces this)
for f in services/*/crud.ts; do
  grep -nE "[[:space:]]as[[:space:]]+[A-Z]" "$f" 2>/dev/null | grep -v "as const" && echo "  ^ in $f"
done

# Find `as` casting on RPC responses (potential violations)
grep -rn "data as " services/ | grep -v "test"

# Find cross-context table access
grep -rn "Tables\[" services/ | grep -v "own table"
```

---

## Reference Documents

| Document | Purpose |
|----------|---------|
| `docs/25-api-data/DTO_CANONICAL_STANDARD.md` | Full DTO rules (v2.1.0 MANDATORY) |
| `docs/25-api-data/DTO_CATALOG.md` | Aspirational DTO catalog |
| `docs/70-governance/ANTI_PATTERN_CATALOG.md` | Full anti-pattern list |
| `.claude/skills/backend-service-builder/references/dto-rules.md` | Implementation guide |

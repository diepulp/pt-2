# DTO Rules

**Source**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md` v2.1.0
**Purpose**: Condensed DTO derivation rules for service implementation.

---

## Pattern B (Canonical CRUD): MUST Use Pick/Omit

**Services**: player, visit, casino, floor-layout

```typescript
// ✅ REQUIRED - auto-syncs with schema changes
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at'
>;

export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Insert'],
  'first_name' | 'last_name' | 'birth_date'
>;

export type PlayerUpdateDTO = Partial<
  Pick<
    Database['public']['Tables']['player']['Insert'],
    'first_name' | 'last_name'
  >
>;
```

```typescript
// ❌ BANNED - causes schema evolution blindness
export interface PlayerDTO {
  id: string;
  first_name: string;
  last_name: string;
  created_at: string;
}
```

**Why banned?** Manual interfaces don't update when schema changes. Migration adds column → Interface unchanged → Data silently dropped.

---

## Pattern A (Contract-First): Manual Interfaces ALLOWED

**Services**: loyalty, finance, mtl, table-context

```typescript
// ✅ ALLOWED - domain contract intentionally decoupled from schema
export interface PlayerLoyaltyDTO {
  player_id: string;
  casino_id: string;
  balance: number;
  tier: string | null;
  // Omits: preferences (internal field)
}
```

**Why allowed?** Pattern A DTOs are domain contracts, not schema mirrors. Mappers enforce the boundary:

```typescript
// Mapper provides compile-time safety
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

Schema changes break the mapper at compile time, not silently at runtime.

---

## DTO Location: MUST Be in dtos.ts (SLAD §315-319)

**Rule**: All DTOs MUST be defined in `services/{domain}/dtos.ts`. Inline DTOs are **BANNED**.

This applies to ALL patterns (A, B, C) - Hybrid does NOT exempt from this rule.

```typescript
// ❌ BANNED - Inline DTO in feature file
// services/loyalty/mid-session-reward.ts
export interface MidSessionRewardInput {  // ❌ VIOLATION
  casinoId: string;
  playerId: string;
}

// ✅ CORRECT - DTO in dedicated file
// services/loyalty/dtos.ts
export interface MidSessionRewardInput {
  casinoId: string;
  playerId: string;
  ratingSlipId: string;
  staffId: string;
  points: number;
  idempotencyKey: string;
  reason?: LoyaltyReason;
}

// services/loyalty/mid-session-reward.ts
import type { MidSessionRewardInput } from './dtos';

export function buildMidSessionRewardRpcInput(input: MidSessionRewardInput) {
  return {
    p_casino_id: input.casinoId,
    // ... mapping
  };
}
```

**Why?** Centralized DTOs enable:
- Pre-commit hook validation (Check 8)
- Cross-context DTO publishing
- Consistent type discovery
- Schema evolution tracking

**Enforcement**: Pre-commit hook Check 8 blocks commits with inline DTOs.

---

## Cross-Context DTO Consumption

**Rule**: Never access `Database['...']['Tables']['foreign_table']` directly.

```typescript
// ❌ VIOLATION - Loyalty accessing RatingSlip table directly
type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];

// ✅ CORRECT - Import published DTO from owning service
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';
```

---

## Type Selection Guide

| Operation | Use Type |
|-----------|----------|
| Create/Insert | `Database['...']['Tables']['x']['Insert']` |
| Update | `Database['...']['Tables']['x']['Insert']` + Partial |
| Read/Response | `Database['...']['Tables']['x']['Row']` |
| RPC Parameters | `Database['...']['Functions']['rpc_name']['Args']` |
| RPC Response | `Database['...']['Functions']['rpc_name']['Returns']` |

---

## RPC Type Enforcement (CRITICAL)

**Canonical Reference**: V1/V5 violation - type casting bypasses validation

### Rule: MUST Use Generated RPC Types

After running `npm run db:types`, Supabase generates typed function signatures:

```typescript
// types/database.types.ts (auto-generated)
Database['public']['Functions']['rpc_start_rating_slip']['Args']
Database['public']['Functions']['rpc_start_rating_slip']['Returns']
```

**These are the ONLY types you may use for RPC calls.**

### ❌ WRONG - Type Casting RPC Response

```typescript
// services/rating-slip/lifecycle.ts
const { data, error } = await supabase.rpc('rpc_start_rating_slip', params);

// ❌ VIOLATION - `as` casting bypasses type safety
return { success: true, data: data as RatingSlipDTO };

// ❌ VIOLATION - Casting complex return shapes
const result = data as { slip: RatingSlipDTO; duration_seconds: number };
```

**Why this is dangerous:**
- If RPC return shape changes, TypeScript won't catch the mismatch
- Runtime errors instead of compile-time errors
- Silent data corruption if fields are renamed/removed

### ✅ CORRECT - Use Mapper with Generated Types

```typescript
// services/rating-slip/lifecycle.ts
import type { Database } from '@/types/database.types';

// 1. Define type aliases for readability
type RpcStartSlipArgs = Database['public']['Functions']['rpc_start_rating_slip']['Args'];
type RpcStartSlipReturns = Database['public']['Functions']['rpc_start_rating_slip']['Returns'];

// 2. Create mapper function with explicit input type
function mapToRatingSlipDTO(data: RpcStartSlipReturns): RatingSlipDTO {
  // Compile-time error if RPC shape changes
  return {
    id: data.id,
    casino_id: data.casino_id,
    player_id: data.player_id,
    visit_id: data.visit_id,
    table_id: data.table_id,
    seat_number: data.seat_number,
    status: data.status,
    start_time: data.start_time,
    end_time: data.end_time,
    average_bet: data.average_bet,
    game_settings: data.game_settings,
  };
}

// 3. Use mapper in service
export async function startSlip(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  input: StartRatingSlipInput
): Promise<RatingSlipDTO> {
  const { data, error } = await supabase.rpc('rpc_start_rating_slip', {
    p_casino_id: casinoId,
    p_player_id: input.playerId,
    // ... typed by RpcStartSlipArgs
  });

  if (error) {
    throw mapDatabaseError(error);
  }

  return mapToRatingSlipDTO(data);  // ✅ Type-safe mapping
}
```

### Complex RPC Returns (Type Guards)

For RPCs returning composite objects:

```typescript
type RpcCloseSlipReturns = Database['public']['Functions']['rpc_close_rating_slip']['Returns'];

// Type guard for runtime validation
function isValidCloseSlipResponse(data: unknown): data is RpcCloseSlipReturns {
  return (
    typeof data === 'object' &&
    data !== null &&
    'slip' in data &&
    'duration_seconds' in data &&
    typeof (data as { duration_seconds: unknown }).duration_seconds === 'number'
  );
}

export async function closeSlip(...): Promise<RatingSlipCloseDTO> {
  const { data, error } = await supabase.rpc('rpc_close_rating_slip', params);

  if (error) {
    throw mapDatabaseError(error);
  }

  // Validate before mapping
  if (!isValidCloseSlipResponse(data)) {
    throw new DomainError('INTERNAL_ERROR', 'Invalid RPC response shape');
  }

  return {
    ...mapToRatingSlipDTO(data.slip),
    duration_seconds: data.duration_seconds,
  };
}
```

### RPC Type Verification Checklist

After creating RPCs in a migration:

- [ ] Run `npm run db:types` to regenerate types
- [ ] Verify `Database['public']['Functions']['rpc_*']['Args']` exists
- [ ] Verify `Database['public']['Functions']['rpc_*']['Returns']` exists
- [ ] Create mapper function with explicit `RpcReturns` input type
- [ ] NO `as` casting anywhere in RPC handling code
- [ ] Add type guard for complex return shapes

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `Row` for create DTOs | Use `Insert` (has correct optionality) |
| Including `id`, `created_at` in create DTOs | Use `Omit` or explicit `Pick` |
| Using `interface` for Pattern B | Use `type` with Pick/Omit |
| Accessing foreign tables directly | Import DTO from owning service |

---

## Full Reference

For complete rules, rationale, and enforcement mechanisms:
- `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- `docs/25-api-data/DTO_CATALOG.md` (aspirational spec for future dtos.ts files)

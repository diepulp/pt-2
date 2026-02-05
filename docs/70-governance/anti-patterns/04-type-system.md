# Type System & DTO Anti-Patterns

**Target Agents**: `typescript-pro`, `backend-developer`, `backend-service-builder`
**Severity**: HIGH - Type safety is foundational

---

## DTO Pattern Classification

> **Reference**: SLAD §356-490 (DTO Patterns), SRM §57-60 (Pattern Classification)

PT-2 uses **three DTO patterns** based on service complexity. Violations depend on which pattern applies:

| Pattern | Services | Manual `interface` | `type` + Pick/Omit | `mappers.ts` Required |
|---------|----------|-------------------|-------------------|----------------------|
| **A (Contract-First)** | Loyalty, Finance, MTL, TableContext | ✅ Allowed | ✅ Allowed | ✅ **REQUIRED** |
| **B (Canonical CRUD)** | Player, Visit, Casino, FloorLayout | ❌ **BANNED** | ✅ Required | ❌ Not needed |
| **C (Hybrid)** | RatingSlip | Per-DTO basis | Per-DTO basis | Optional |

---

## Pattern B Services: No Manual Interface DTOs

### ❌ Pattern B: NEVER use manual interface DTOs

```typescript
// ❌ WRONG (Pattern B: Player, Visit, Casino, FloorLayout)
// services/player/dtos.ts
export interface PlayerCreateDTO {
  id?: string;
  first_name: string;
}

// ✅ CORRECT (Pattern B)
export type PlayerCreateDTO = Pick<
  Database["public"]["Tables"]["player"]["Insert"],
  "first_name"
>;
```

**Why**: Schema changes should auto-propagate → interfaces cause "schema evolution blindness"

---

## Pattern A Services: Manual Interfaces with Mappers

### ✅ Pattern A: Manual interfaces ARE allowed (with mappers.ts)

```typescript
// ✅ CORRECT (Pattern A: Loyalty, Finance, MTL, TableContext)
// services/loyalty/dtos.ts
export interface PlayerLoyaltyDTO {
  player_id: string;
  casino_id: string;
  balance: number;
  tier: string | null;
  // Omits: preferences (internal field)
}

// REQUIRED: services/loyalty/mappers.ts
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

**Why**: Domain contracts are intentionally decoupled → mappers.ts provides compile-time checkpoint

---

## General Type Violations

### ❌ NEVER create manual type redefinitions outside services

```typescript
// ❌ WRONG
// types/player.ts (global types folder)
export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  // ... manually redefining DB schema
}

// ✅ CORRECT
// services/player/dtos.ts (service-owned)
import { Database } from "@/types/database.types";

export type PlayerDTO = Pick<
  Database["public"]["Tables"]["player"]["Row"],
  "id" | "first_name" | "last_name"
>;
```

### ❌ NEVER use `Database = any` shims

```typescript
// ❌ WRONG
import type { Database } from "./database.types";
export type AnyDatabase = Database & any; // ❌

// ✅ CORRECT
import type { Database } from "./database.types";
// Use Database directly
```

### ❌ NEVER skip type regeneration after migrations

```bash
# ❌ WRONG
npx supabase migration up
git add supabase/migrations/
git commit -m "Add new column"

# ✅ CORRECT
npx supabase migration up
npm run db:types  # ← Regenerate types
git add supabase/migrations/ types/database.types.ts
git commit -m "Add new column + regenerate types"
```

### ❌ NEVER use `as` casting for RPC/query responses

```typescript
// ❌ WRONG
const data = await supabase.rpc('get_rating_slip_modal_data', { ... });
return data as RatingSlipModalDTO; // Bypasses runtime validation

// ✅ CORRECT
type RpcReturns = Database['public']['Functions']['get_rating_slip_modal_data']['Returns'];

function toModalDTO(data: RpcReturns): RatingSlipModalDTO {
  return {
    slip: toSlipDTO(data.slip),
    player: data.player ? toPlayerDTO(data.player) : null,
    // ... explicit mapping
  };
}
```

---

## JSONB Boundary Anti-Patterns

### ❌ NEVER use inline `as` casts for JSONB in crud.ts

```typescript
// ❌ WRONG: Inline cast in crud.ts (blocked by pre-commit Check 11)
const metadata = data.preferences as Record<string, unknown>;

// ❌ WRONG: Double-assertion for RPC JSONB
return toDTO(data as unknown as MyRpcResponse);

// ✅ CORRECT: Use centralized helpers from lib/json/narrows.ts
import { narrowJsonRecord, narrowRpcJson } from '@/lib/json/narrows';

const metadata = narrowJsonRecord(data.preferences);
return toDTO(narrowRpcJson<MyRpcResponse>(data));
```

**Enforcement:**
- `.husky/pre-commit-service-check.sh` Check 11: Bans `as [A-Z]` in crud.ts
- ESLint `no-dto-type-assertions`: Bans `as SomeDTO` in services/**/*.ts

**Canonical module:** `lib/json/narrows.ts` provides:
- `isJsonObject()` — type guard
- `narrowJsonRecord()` — Json → Record<string, unknown>
- `narrowRpcJson<T>()` — Json → typed RPC response

---

## RPC Parameter Anti-Patterns

### ❌ NEVER use `?? null` for optional RPC parameters

```typescript
// ❌ WRONG: null not assignable to string | undefined
const { data } = await supabase.rpc('rpc_promo_exposure_rollup', {
  p_gaming_day: query.gamingDay ?? null,  // Type error after removing as any
});

// ✅ CORRECT: undefined omits the parameter (uses SQL DEFAULT)
const { data } = await supabase.rpc('rpc_promo_exposure_rollup', {
  p_gaming_day: query.gamingDay ?? undefined,
});
```

**Why:** Supabase generates optional RPC params as `param?: type` (= `type | undefined`). The `null` literal is not assignable to `undefined`. Using `?? null` only compiled when the RPC call was wrapped in `as any`.

**Exception:** Use `?? null` for direct table inserts/updates where the column type is explicitly nullable:
```typescript
// ✅ OK: Table column is text | null
await supabase.from('promo_program').insert({
  start_at: input.startAt ?? null,  // Column allows NULL
});
```

---

## Supabase Client Anti-Patterns

### ❌ NEVER use `(supabase.rpc as any)` or `(supabase as any)`

```typescript
// ❌ WRONG: Bypasses type safety, hides parameter/return type mismatches
const { data } = await (supabase.rpc as any)('rpc_accrue_on_close', { ... });

// ✅ CORRECT: Direct typed call (requires canonical types to be current)
const { data } = await supabase.rpc('rpc_accrue_on_close', { ... });
```

**If you see "RPC does not exist" errors:**
1. Run `npm run db:types` to regenerate canonical types
2. If local DB is stale, run `supabase db reset`
3. See `docs/issues/dual-type-system/DB-CONTRACT-STALENESS-PROTOCOL.md`

**Pre-existing casts discovered in 2026-02-03 audit:** 37 instances across loyalty, rating-slip, table-context, dashboard contexts. All removed — canonical types are current.

### ❌ NEVER use `{} as any` for test mocks

```typescript
// ❌ WRONG: Untyped mock
const mockSupabase = {} as any;

// ✅ CORRECT: Typed double
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const mockSupabase = {} as unknown as SupabaseClient<Database>;
```

**Why:** `as unknown as SupabaseClient<Database>` documents intent and catches shape mismatches if the mock is used where methods are expected.

---

## Shared Types

### ❌ NEVER redefine infrastructure types

```typescript
// ❌ WRONG
// services/player/types.ts
export interface ServiceResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ✅ CORRECT - Import from canonical location
import { ServiceResult } from '@/lib/http/service-response';
import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';
```

### Canonical Type Locations

| Type | Location |
|------|----------|
| `ServiceResult<T>` | `lib/http/service-response.ts` |
| `DomainError` | `lib/errors/domain-errors.ts` |
| `Database` | `types/database.types.ts` |
| Domain DTOs | `services/{domain}/dtos.ts` |

---

## Quick Checklist

- [ ] **Pattern B services** (Player, Visit, Casino, FloorLayout): No `export interface.*DTO`
- [ ] **Pattern A services** (Loyalty, Finance, MTL, TableContext): Has `mappers.ts` if using DTOs
- [ ] No manual type redefinitions in `types/` folder
- [ ] No `as` casting for RPC/query responses in crud.ts (use `lib/json/narrows.ts`)
- [ ] No `(supabase.rpc as any)` or `(supabase as any)` casts
- [ ] No `?? null` for optional RPC parameters (use `?? undefined`)
- [ ] No `{} as any` in test mocks (use `as unknown as SupabaseClient<Database>`)
- [ ] Types regenerated after migrations (`npm run db:types`)
- [ ] Using canonical infrastructure types

## Cross-References

- **JSONB boundary helpers:** `lib/json/narrows.ts`
- **Staleness protocol:** `docs/issues/dual-type-system/DB-CONTRACT-STALENESS-PROTOCOL.md`
- **Param normalization:** `docs/issues/dual-type-system/PARAM-NORMALIZATION-001.md`
- **Type system audit:** `docs/issues/ISSUE-TYPE-SYSTEM-AUDIT-2026-02-03.md`
- **Pre-commit enforcement:** `.husky/pre-commit-service-check.sh` (Check 10, 11)

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
- [ ] No `as` casting for RPC/query responses
- [ ] Types regenerated after migrations (`npm run db:types`)
- [ ] Using canonical infrastructure types

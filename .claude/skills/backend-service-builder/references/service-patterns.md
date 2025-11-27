# Service Implementation Patterns

**Source**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` (SLAD v2.1.2)
**Supplementary**: `docs/70-governance/SERVICE_TEMPLATE.md` v2.0.3

> **Note**: SLAD §308-348 is the authoritative source for service directory structure.

## Pattern Selection Decision Tree

```
Is this complex business logic with domain contracts?
(Loyalty points, Financial transactions, Compliance workflows)
└─> Pattern A: Contract-First

Is this simple CRUD over database tables?
(Player identity, Visit sessions, Casino config, Floor layouts)
└─> Pattern B: Canonical CRUD

Mixed complexity?
(RatingSlip: state machine + CRUD, some domain logic)
└─> Pattern C: Hybrid
```

---

## Pattern A: Contract-First Services

**Use When**: Complex business logic, domain contracts, cross-context boundaries
**Examples**: `loyalty`, `finance`, `mtl`, `table-context`

### Directory Structure (SLAD §308-348)

```
services/{domain}/
├── dtos.ts              # ✅ DTO contracts (manual interfaces for domain contracts)
├── mappers.ts           # ✅ REQUIRED: Database ↔ DTO transformations
├── selects.ts           # ✅ Named column sets
├── keys.ts              # ✅ React Query key factories (with .scope)
├── http.ts              # ✅ HTTP fetchers (thin wrappers to API routes)
├── index.ts             # ✅ Factory + explicit interface
├── crud.ts              # ✅ CRUD operations
├── business.ts          # ✅ Business logic (if needed)
├── queries.ts           # ✅ Complex queries (if needed)
├── {feature}.test.ts    # ✅ Unit/integration tests
└── README.md            # ✅ Service documentation with SRM reference
```

**Key Characteristics**:

- DTOs defined in `dtos.ts` (manual `interface` or `type` definitions allowed)
- `mappers.ts` REQUIRED - enforces Database ↔ DTO boundary
- Explicit service interface in `index.ts` (NOT ReturnType inference)
- Focus: domain contract stability, explicit field control

**Example**: Pattern A service structure

```typescript
// services/loyalty/dtos.ts - Domain contracts
export interface PlayerLoyaltyDTO {
  player_id: string;
  casino_id: string;
  balance: number;
  tier: string | null;
  // Omits: preferences (internal field)
}

export interface MidSessionRewardInput {
  casinoId: string;
  playerId: string;
  ratingSlipId: string;
  staffId: string;
  points: number;
  idempotencyKey: string;
  reason?: LoyaltyReason;
}

// services/loyalty/mappers.ts - REQUIRED for Pattern A
import type { Database } from "@/types/database.types";
import type { PlayerLoyaltyDTO } from "./dtos";

type LoyaltyRow = Database["public"]["Tables"]["player_loyalty"]["Row"];

export function toPlayerLoyaltyDTO(row: LoyaltyRow): PlayerLoyaltyDTO {
  return {
    player_id: row.player_id,
    casino_id: row.casino_id,
    balance: row.balance,
    tier: row.tier,
    // Explicitly omit: preferences (internal)
  };
}

export function buildMidSessionRewardRpcInput(
  input: MidSessionRewardInput,
): MidSessionRewardRpcInput {
  return {
    p_casino_id: input.casinoId,
    p_player_id: input.playerId,
    p_rating_slip_id: input.ratingSlipId,
    p_staff_id: input.staffId,
    p_points: input.points,
    p_idempotency_key: input.idempotencyKey,
    p_reason: input.reason ?? "mid_session",
  };
}

// services/loyalty/index.ts - Explicit interface + factory
export interface LoyaltyService {
  getBalance(
    playerId: string,
    casinoId: string,
  ): Promise<ServiceResult<PlayerLoyaltyDTO>>;
  rewardPlayer(input: MidSessionRewardInput): Promise<ServiceResult<RewardDTO>>;
}

export function createLoyaltyService(
  supabase: SupabaseClient<Database>,
): LoyaltyService {
  return {
    async getBalance(playerId, casinoId) {
      /* ... */
    },
    async rewardPlayer(input) {
      /* ... */
    },
  };
}
```

### React Query Keys Pattern (ALL PATTERNS)

```typescript
// services/{domain}/keys.ts
import { serializeKeyFilters } from "@/services/shared/key-utils";

export type LoyaltyLedgerFilters = {
  casinoId?: string;
  playerId?: string;
  ratingSlipId?: string;
  cursor?: string;
  limit?: number;
};

const ROOT = ["loyalty"] as const;
const serialize = (filters: LoyaltyLedgerFilters = {}) =>
  serializeKeyFilters(filters);

export const loyaltyKeys = {
  root: ROOT,
  playerBalance: (playerId: string, casinoId: string) =>
    [...ROOT, "balance", playerId, casinoId] as const,
  ledger: Object.assign(
    (filters: LoyaltyLedgerFilters = {}) =>
      [...ROOT, "ledger", serialize(filters)] as const,
    { scope: [...ROOT, "ledger"] as const }, // For setQueriesData
  ),
};
```

### Checklist (Pattern A)

**✅ Required (SLAD §308-348)**:

- [ ] Create `dtos.ts` with domain DTO contracts
- [ ] Create `mappers.ts` with Database ↔ DTO transformations
- [ ] Create `selects.ts` with named column sets
- [ ] Create `keys.ts` with React Query factory keys (with `.scope`)
- [ ] Create `http.ts` with HTTP fetchers
- [ ] Create `index.ts` with explicit interface + factory function
- [ ] Create `crud.ts` for CRUD operations
- [ ] Add `README.md` with SRM reference
- [ ] Write tests for business logic (`{feature}.test.ts`)
- [ ] Type `supabase` parameter as `SupabaseClient<Database>` (never `any`)

---

## Pattern B: Canonical CRUD Services

**Use When**: Simple CRUD operations, minimal business logic
**Examples**: `player`, `visit`, `casino`, `floor-layout`

### Directory Structure (SLAD §308-348)

```
services/{domain}/
├── dtos.ts              # ✅ DTOs using Pick/Omit from Database types
├── selects.ts           # ✅ Named column sets
├── keys.ts              # ✅ React Query key factories (with .scope)
├── http.ts              # ✅ HTTP fetchers (thin wrappers to API routes)
├── index.ts             # ✅ Factory + explicit interface
├── crud.ts              # ✅ CRUD operations
└── README.md            # ✅ Service documentation with SRM reference
```

**Key Characteristics**:

- DTOs MUST use `Pick`/`Omit` from `Database` types (NO manual interfaces)
- No `mappers.ts` (schema changes auto-propagate via `npm run db:types`)
- Explicit service interface in `index.ts`
- Focus: schema-aligned, auto-evolving types

**Example**: `services/player/`

```typescript
// services/player/keys.ts
export type PlayerListFilters = {
  casinoId?: string;
  status?: "active" | "inactive";
  q?: string;
  cursor?: string;
  limit?: number;
};

const ROOT = ["player"] as const;
const serialize = (filters: PlayerListFilters = {}) =>
  serializeKeyFilters(filters);

export const playerKeys = {
  root: ROOT,
  list: Object.assign(
    (filters: PlayerListFilters = {}) =>
      [...ROOT, "list", serialize(filters)] as const,
    { scope: [...ROOT, "list"] as const },
  ),
  detail: (playerId: string) => [...ROOT, "detail", playerId] as const,
};
```

**DTOs documented in README**:

```typescript
// Pattern B MUST use Pick/Omit from Database types
export type PlayerDTO = Pick<
  Database["public"]["Tables"]["player"]["Row"],
  "id" | "first_name" | "last_name" | "created_at"
>;

export type PlayerCreateDTO = Pick<
  Database["public"]["Tables"]["player"]["Insert"],
  "first_name" | "last_name" | "birth_date"
>;
```

### Checklist (Pattern B)

**✅ Required (SLAD §308-348)**:

- [ ] Create `dtos.ts` with Pick/Omit from `Database` types
- [ ] Create `selects.ts` with named column sets
- [ ] Create `keys.ts` with React Query factory keys (with `.scope`)
- [ ] Create `http.ts` with HTTP fetchers
- [ ] Create `index.ts` with explicit interface + factory function
- [ ] Create `crud.ts` for CRUD operations
- [ ] Add `README.md` with SRM reference
- [ ] Type `supabase` parameter as `SupabaseClient<Database>` (never `any`)

**❌ BANNED for Pattern B**:

- Manual `interface` definitions for DTOs (use `type` + Pick/Omit only)
- `mappers.ts` files (schema auto-propagates)
- `ReturnType<typeof createService>` inference

---

## Pattern C: Hybrid Services

**Use When**: Mixed complexity (some domain logic, some CRUD)
**Examples**: `rating-slip` (state machine + CRUD)

### Implementation

Use appropriate pattern per feature:

- Contract-first DTOs for complex logic
- Canonical DTOs for CRUD operations

```
services/rating-slip/
├── keys.ts
├── state-machine.ts        # Pattern A: Manual DTOs
├── state-machine.test.ts
└── README.md
```

---

## Service README.md (REQUIRED for ALL patterns)

```markdown
# {ServiceName} - {Bounded Context}

> **Bounded Context**: "One-sentence description"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §X-Y](../../docs/...)
> **Status**: Implemented / In Progress

## Ownership

**Tables**: List tables owned by this service
**DTOs**: List public DTOs exposed
**RPCs**: List database functions (if any)

## Pattern

Pattern A / Pattern B / Pattern C (explain why)

## References

- [SRM §X-Y](...)
- [SLAD §X-Y](...)
- [DTO_CANONICAL_STANDARD.md](...)
```

---

## Anti-Patterns (NEVER DO)

| Anti-Pattern                              | Why Banned                 | Correct Pattern                                           |
| ----------------------------------------- | -------------------------- | --------------------------------------------------------- |
| Manual `interface` for Pattern B services | Schema evolution blindness | Use `Pick<Database['public']['Tables']['x']['Row'], ...>` |
| Missing `keys.ts`                         | React Query won't work     | ALL services need key factories                           |
| Cross-context Database type access        | Violates bounded contexts  | Use published DTOs only                                   |
| `ReturnType<typeof createService>`        | Implicit, unstable types   | Explicit `interface XService`                             |
| `supabase: any`                           | Type safety lost           | `supabase: SupabaseClient<Database>`                      |
| No README.md                              | Service undocumented       | Required with SRM reference                               |

---

## Implementation Workflow

1. **Choose Pattern**: Use decision tree above
2. **Create Directory**: `mkdir -p services/{domain}`
3. **Create Keys File**: `services/{domain}/keys.ts`
4. **Add Business Logic** (Pattern A) or **Skip** (Pattern B)
5. **Create README.md** with SRM reference
6. **Add Tests** (Pattern A required, Pattern B optional)
7. **Update SRM**: Add service to SERVICE_RESPONSIBILITY_MATRIX.md

---

## Reference Implementations

| Service                 | Pattern            | Files                                     | Purpose              |
| ----------------------- | ------------------ | ----------------------------------------- | -------------------- |
| `services/loyalty/`     | A (Contract-First) | keys.ts, mid-session-reward.ts, README.md | Complex reward logic |
| `services/player/`      | B (Canonical CRUD) | keys.ts, README.md                        | Simple identity CRUD |
| `services/rating-slip/` | C (Hybrid)         | keys.ts, state-machine.ts, README.md      | Mixed complexity     |

**Before implementing**: Read the README.md of a similar service for patterns.

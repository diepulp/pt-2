# Service Implementation Patterns

**Source**: `docs/70-governance/SERVICE_TEMPLATE.md` v2.0.3
**SLAD Reference**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` v2.1.2

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

### Current Implementation (✅ DEPLOYED)

```
services/{domain}/
├── keys.ts              # React Query key factories (REQUIRED)
├── {feature}.ts         # Business logic WITH INLINE DTOs
├── {feature}.test.ts    # Unit/integration tests
└── README.md            # Service documentation with SRM reference
```

**Key Characteristics**:
- DTOs defined inline in feature files (not in separate `dtos.ts`)
- Mappers embedded as standalone functions (e.g., `buildXRpcInput()`)
- No service factories - export standalone functions
- Focus: simplicity and co-location

**Example**: `services/loyalty/mid-session-reward.ts`

```typescript
// Inline DTO definition
export interface MidSessionRewardInput {
  casinoId: string;
  playerId: string;
  ratingSlipId: string;
  staffId: string;
  points: number;
  idempotencyKey: string;
  reason?: LoyaltyReason;
}

// Inline RPC mapper
export function buildMidSessionRewardRpcInput(
  input: MidSessionRewardInput
): MidSessionRewardRpcInput {
  return {
    p_casino_id: input.casinoId,
    p_player_id: input.playerId,
    p_rating_slip_id: input.ratingSlipId,
    p_staff_id: input.staffId,
    p_points: input.points,
    p_idempotency_key: input.idempotencyKey,
    p_reason: input.reason ?? 'mid_session',
  };
}

// Business logic function
export async function rewardPlayer(
  supabase: SupabaseClient<Database>,
  input: MidSessionRewardInput
): Promise<ServiceResult<RewardDTO>> {
  const rpcInput = buildMidSessionRewardRpcInput(input);
  const { data, error } = await supabase.rpc('issue_mid_session_reward', rpcInput);

  if (error) {
    return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
  }

  return { success: true, data: mapToRewardDTO(data) };
}
```

### React Query Keys Pattern (ALL PATTERNS)

```typescript
// services/{domain}/keys.ts
import { serializeKeyFilters } from '@/services/shared/key-utils';

export type LoyaltyLedgerFilters = {
  casinoId?: string;
  playerId?: string;
  ratingSlipId?: string;
  cursor?: string;
  limit?: number;
};

const ROOT = ['loyalty'] as const;
const serialize = (filters: LoyaltyLedgerFilters = {}) =>
  serializeKeyFilters(filters);

export const loyaltyKeys = {
  root: ROOT,
  playerBalance: (playerId: string, casinoId: string) =>
    [...ROOT, 'balance', playerId, casinoId] as const,
  ledger: Object.assign(
    (filters: LoyaltyLedgerFilters = {}) =>
      [...ROOT, 'ledger', serialize(filters)] as const,
    { scope: [...ROOT, 'ledger'] as const },  // For setQueriesData
  ),
};
```

### Checklist (Pattern A)

**✅ Required Today**:
- [ ] Create `keys.ts` with React Query factory keys
- [ ] Define domain DTOs inline in `{feature}.ts`
- [ ] Add inline mapping functions (e.g., `buildXRpcInput()`)
- [ ] Add `README.md` with SRM reference
- [ ] Write tests for business logic (`{feature}.test.ts`)
- [ ] Type `supabase` parameter as `SupabaseClient<Database>` (never `any`)

**⚠️ Planned (Future)**:
- [ ] Extract DTOs to `dtos.ts` when service grows complex
- [ ] Add `mappers.ts` for Database ↔ DTO boundary enforcement
- [ ] Implement service factory pattern in `index.ts`

---

## Pattern B: Canonical CRUD Services

**Use When**: Simple CRUD operations, minimal business logic
**Examples**: `player`, `visit`, `casino`, `floor-layout`

### Current Implementation (✅ DEPLOYED)

```
services/{domain}/
├── keys.ts       # React Query key factories (REQUIRED)
└── README.md     # Service documentation with SRM reference
```

**Key Characteristics**:
- Minimal: Only 2 files
- No separate DTO files (documented in README using Pick/Omit)
- No business logic files (handled in Server Actions/hooks)
- Focus: React Query key management

**Example**: `services/player/`

```typescript
// services/player/keys.ts
export type PlayerListFilters = {
  casinoId?: string;
  status?: 'active' | 'inactive';
  q?: string;
  cursor?: string;
  limit?: number;
};

const ROOT = ['player'] as const;
const serialize = (filters: PlayerListFilters = {}) =>
  serializeKeyFilters(filters);

export const playerKeys = {
  root: ROOT,
  list: Object.assign(
    (filters: PlayerListFilters = {}) =>
      [...ROOT, 'list', serialize(filters)] as const,
    { scope: [...ROOT, 'list'] as const },
  ),
  detail: (playerId: string) => [...ROOT, 'detail', playerId] as const,
};
```

**DTOs documented in README**:
```typescript
// Pattern B MUST use Pick/Omit from Database types
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at'
>;

export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Insert'],
  'first_name' | 'last_name' | 'birth_date'
>;
```

### Checklist (Pattern B)

**✅ Required Today**:
- [ ] Create `keys.ts` with React Query factory keys
- [ ] Add `README.md` with SRM reference
- [ ] Document DTOs in README using Pick/Omit from `Database` types

**❌ BANNED for Pattern B**:
- Manual DTO interfaces (use Pick/Omit only - see DTO_CANONICAL_STANDARD)
- Separate `dtos.ts` files (keep minimal)
- Business logic files (handle in Server Actions/hooks)

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

| Anti-Pattern | Why Banned | Correct Pattern |
|--------------|------------|-----------------|
| Manual `interface` for Pattern B services | Schema evolution blindness | Use `Pick<Database['public']['Tables']['x']['Row'], ...>` |
| Missing `keys.ts` | React Query won't work | ALL services need key factories |
| Cross-context Database type access | Violates bounded contexts | Use published DTOs only |
| `ReturnType<typeof createService>` | Implicit, unstable types | Explicit `interface XService` |
| `supabase: any` | Type safety lost | `supabase: SupabaseClient<Database>` |
| No README.md | Service undocumented | Required with SRM reference |

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

| Service | Pattern | Files | Purpose |
|---------|---------|-------|---------|
| `services/loyalty/` | A (Contract-First) | keys.ts, mid-session-reward.ts, README.md | Complex reward logic |
| `services/player/` | B (Canonical CRUD) | keys.ts, README.md | Simple identity CRUD |
| `services/rating-slip/` | C (Hybrid) | keys.ts, state-machine.ts, README.md | Mixed complexity |

**Before implementing**: Read the README.md of a similar service for patterns.

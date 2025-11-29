# Service Implementation Patterns

**Source**: `docs/70-governance/SERVICE_TEMPLATE.md` v2.0.3
**Architecture**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` (SLAD v2.1.2)
**Guardrail**: `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` (OE-01)

---

## Pattern Decision Tree

```
┌─ Complex business logic with domain contracts?
│  (Loyalty points, Financial transactions, Compliance workflows)
│  └─> Pattern A: Contract-First
│
├─ Simple CRUD over database tables?
│  (Player identity, Visit sessions, Casino config)
│  └─> Pattern B: Canonical CRUD
│
└─ Mixed complexity?
   (State machine + CRUD, some domain logic)
   └─> Pattern C: Hybrid
```

---

## Pattern A: Contract-First Services

**Use When**: Complex business logic, domain contracts, cross-context boundaries
**Examples**: `loyalty/`, `finance/`, `mtl/`, `table-context/`

### Current Implementation (DEPLOYED)

```
services/{domain}/
├── keys.ts              # ✅ React Query key factories (REQUIRED)
├── {feature}.ts         # ✅ Business logic with INLINE DTOs
├── {feature}.test.ts    # ✅ Unit/integration tests
└── README.md            # ✅ Service documentation (REQUIRED)
```

**Key Characteristics**:
- DTOs defined **inline** in feature files (not extracted to dtos.ts yet)
- Mappers defined **inline** in feature files (not extracted to mappers.ts yet)
- No service factory pattern (standalone functions)
- Focus: simplicity, co-location

### Example: services/loyalty/

```
services/loyalty/
├── keys.ts                      # loyaltyKeys factory
├── mid-session-reward.ts        # Business logic + inline DTOs + inline mappers
├── mid-session-reward.test.ts   # Tests
└── README.md                    # SRM reference
```

### Inline DTO Example

```typescript
// services/loyalty/mid-session-reward.ts

// Inline DTO (domain contract)
export interface MidSessionRewardInput {
  casinoId: string;
  playerId: string;
  ratingSlipId: string;
  staffId: string;
  points: number;
  idempotencyKey: string;
  reason?: LoyaltyReason;
}

// Inline mapper
export function buildMidSessionRewardRpcInput(input: MidSessionRewardInput) {
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

// Business logic - throws DomainError on failure (per ADR-012)
export async function rewardPlayer(
  supabase: SupabaseClient<Database>,
  input: MidSessionRewardInput
): Promise<RewardDTO> {  // Returns success data; throws on error
  const rpcInput = buildMidSessionRewardRpcInput(input);
  const { data, error } = await supabase.rpc('issue_mid_session_reward', rpcInput);

  if (error) {
    throw mapDatabaseError(error);  // Maps Postgres → DomainError
  }

  return mapToRewardDTO(data);  // Returns typed DTO
}
```

### When to Extract to Separate Files

Extract DTOs/mappers to dedicated files when:
- Service consumed by **2+ other services** (cross-context publishing)
- Service complexity warrants **separation of concerns**
- **Schema evolution** requires explicit mapper boundary

Target structure (SLAD §308-348, 0% adoption currently):
```
services/{domain}/
├── dtos.ts              # Extracted DTO contracts
├── mappers.ts           # Extracted Database ↔ DTO transformations
├── keys.ts
├── {feature}.ts
└── README.md
```

---

## Pattern B: Canonical CRUD Services

**Use When**: Simple CRUD operations, minimal business logic
**Examples**: `player/`, `visit/`, `casino/`, `floor-layout/`

### Current Implementation (DEPLOYED)

```
services/{domain}/
├── keys.ts              # ✅ React Query key factories (REQUIRED)
└── README.md            # ✅ Service documentation (REQUIRED)
```

**Key Characteristics**:
- **Minimal structure** - only 2 files
- DTOs documented in README using Pick/Omit
- No business logic files (logic in Server Actions/hooks)
- Focus: schema-aligned, auto-evolving types

### Example: services/player/

```
services/player/
├── keys.ts     # playerKeys factory
└── README.md   # Documents DTOs using Pick/Omit
```

### DTO Pattern (in README or inline)

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

### Banned for Pattern B

- ❌ Manual `interface` definitions (causes schema evolution blindness)
- ❌ `mappers.ts` files (schema auto-propagates)
- ❌ `ReturnType<typeof createService>` inference

---

## Pattern C: Hybrid Services

**Use When**: Mixed complexity (some domain logic, some CRUD)
**Example**: `rating-slip/` (state machine + CRUD)

### Current Implementation

```
services/rating-slip/
├── keys.ts
├── state-machine.ts        # Pattern A: Manual DTOs for state logic
├── state-machine.test.ts
└── README.md
```

Use appropriate pattern per feature:
- Contract-first DTOs for complex logic
- Canonical DTOs for CRUD operations

---

## React Query Keys (ALL PATTERNS)

```typescript
// services/{domain}/keys.ts
import { serializeKeyFilters } from '@/services/shared/key-utils';

export type {Domain}Filters = {
  casinoId?: string;
  cursor?: string;
  limit?: number;
};

const ROOT = ['{domain}'] as const;
const serialize = (filters: {Domain}Filters = {}) => serializeKeyFilters(filters);

export const {domain}Keys = {
  root: ROOT,
  list: Object.assign(
    (filters: {Domain}Filters = {}) => [...ROOT, 'list', serialize(filters)] as const,
    { scope: [...ROOT, 'list'] as const },  // For invalidation
  ),
  detail: (id: string) => [...ROOT, 'detail', id] as const,
};
```

---

## README.md Template (ALL PATTERNS)

```markdown
# {ServiceName} - {Bounded Context}

> **Bounded Context**: "One-sentence description"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §X-Y](../../docs/...)
> **Pattern**: A / B / C

## Ownership

**Tables**: `table1`, `table2`
**DTOs**: List public DTOs
**RPCs**: List database functions (if any)

## Dependencies

**Consumes**: Services this depends on
**Consumed By**: Services that depend on this
```

---

## Error Handling (ALL PATTERNS)

**Canonical Reference**: `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md`

### Domain Errors in Service Layer

```typescript
// services/{domain}/{feature}.ts
import { DomainError } from '@/lib/errors/domain-errors';

export async function createPlayer(input: PlayerCreateDTO) {
  // Throw domain-specific errors, NOT Postgres errors
  const existing = await checkExisting(input.email);
  if (existing) {
    throw new DomainError('PLAYER_ALREADY_EXISTS');
  }

  // Business logic validation
  if (!input.first_name) {
    throw new DomainError('VALIDATION_ERROR', 'First name is required');
  }

  // ... proceed
}
```

### Domain Error Codes by Service

Each service MUST define domain-specific error codes:

| Service | Error Codes |
|---------|-------------|
| **CasinoService** | `CASINO_NOT_FOUND`, `CASINO_SETTINGS_NOT_FOUND`, `STAFF_NOT_FOUND`, `STAFF_UNAUTHORIZED` |
| **PlayerService** | `PLAYER_NOT_FOUND`, `PLAYER_ALREADY_EXISTS`, `PLAYER_NOT_ENROLLED`, `PLAYER_SUSPENDED` |
| **VisitService** | `VISIT_NOT_FOUND`, `VISIT_NOT_OPEN`, `VISIT_ALREADY_CLOSED`, `VISIT_CONCURRENT_MODIFICATION` |
| **RatingSlipService** | `RATING_SLIP_NOT_FOUND`, `RATING_SLIP_NOT_OPEN`, `RATING_SLIP_INVALID_STATE` |
| **LoyaltyService** | `INSUFFICIENT_BALANCE`, `REWARD_ALREADY_ISSUED`, `LOYALTY_ACCOUNT_NOT_FOUND` |
| **TableContextService** | `TABLE_NOT_FOUND`, `TABLE_NOT_ACTIVE`, `TABLE_ALREADY_ACTIVE`, `TABLE_DEALER_CONFLICT` |

### Anti-Pattern: Leaking Postgres Errors

```typescript
// ❌ BAD - Postgres error leaks to UI
catch (error) {
  return { error: error.message }; // "23505: duplicate key..."
}

// ✅ GOOD - Domain error with business context
catch (error) {
  if (error.code === '23505') {
    throw new DomainError('PLAYER_ALREADY_EXISTS');
  }
  throw new DomainError('INTERNAL_ERROR');
}
```

---

## Anti-Patterns

| Anti-Pattern | Why Banned | Correct Pattern |
|--------------|------------|-----------------|
| Manual `interface` for Pattern B | Schema evolution blindness | Use `type` + Pick/Omit |
| Missing `keys.ts` | React Query won't work | ALL services need key factories |
| Cross-context `Database['...']['other_table']` | Violates bounded contexts | Import DTO from owning service |
| `ReturnType<typeof createService>` | Implicit, unstable types | Explicit `interface XService` |
| `supabase: any` | Type safety lost | `supabase: SupabaseClient<Database>` |
| Returning raw Postgres errors | Leaks infrastructure | Throw `DomainError` |

---

## OE-01 Implementation Guardrail

**Reference**: `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`

### Golden Path (Allowed for MVP)

| Pattern | Implementation |
|---------|----------------|
| Direct service invocation | Server action calls service function synchronously |
| Single authoritative mutator | Only owning service writes domain state |
| DB-level idempotency | `idempotency_key` + UNIQUE constraint |
| Row-level concurrency | RPC with `SELECT ... FOR UPDATE` |
| Minimal observability | One structured log with `correlation_id` |

### Disallowed Until Triggers

| Anti-Pattern | Why Banned | Trigger Required |
|--------------|------------|------------------|
| Generic event bus/dispatcher | Premature generalization | Second concrete consumer |
| Persistent event_log table | "Future replay" speculation | Compliance mandate |
| Redis-backed rate limiting | Scale overkill for MVP | Horizontal scale proof |
| Multiple idempotency layers | Redundant complexity | Never (DB is sufficient) |
| New infra without Mini-ADR | Unapproved complexity | Any §6 trigger |

### Red-Flag Checklist (Stop if ≥2 are Yes)

```
- [ ] Adding abstraction layer (bus/dispatcher) with one consumer?
- [ ] Introducing new infra (Redis/Queue) "to be ready later"?
- [ ] Duplicating idempotency when DB constraint would suffice?
- [ ] Creating tables that don't hold business truth?
- [ ] New module >150 LOC with no measured problem?
- [ ] Would removing it change zero user-visible outcomes today?
```

**If Yes ≥ 2 → STOP. Require Mini-ADR or remove the layer.**

---

## Reference Implementations

| Service | Pattern | Files | Purpose |
|---------|---------|-------|---------|
| `services/loyalty/` | A | keys.ts, mid-session-reward.ts, README.md | Complex reward logic |
| `services/player/` | B | keys.ts, README.md | Simple identity CRUD |
| `services/rating-slip/` | C | keys.ts, state-machine.ts, README.md | Mixed complexity |

**Before implementing**: Read the README.md of a similar service for patterns.

---

## Shared Infrastructure Types (DO NOT REDEFINE)

**Canonical Reference**: V3 violation - duplicate type definitions

These types are **already defined** in the codebase. **NEVER create local copies**:

| Type | Location | Purpose |
|------|----------|---------|
| `ServiceResult<T>` | `lib/http/service-response.ts` | Transport layer response envelope |
| `ServiceHttpResult<T>` | `lib/http/service-response.ts` | HTTP response with status code |
| `DomainError` | `lib/errors/domain-errors.ts` | Service layer exception class |
| `DomainErrorCode` | `lib/errors/domain-errors.ts` | Union of all domain error codes |
| `Database` | `types/database.types.ts` | Generated Supabase schema types |
| `ResultCode` | `lib/http/service-response.ts` | Infrastructure error codes |

### ❌ WRONG - Redefining ServiceResult

```typescript
// services/table-context/table-operations.ts
export interface ServiceResult<T> {  // ❌ DUPLICATE
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
```

### ✅ CORRECT - Import from canonical location

```typescript
// services/table-context/table-operations.ts
import type { ServiceResult } from '@/lib/http/service-response';
// OR for server actions that return ServiceHttpResult:
import type { ServiceHttpResult } from '@/lib/http/service-response';
```

**Note**: The canonical `ServiceResult<T>` has additional fields (`requestId`, `durationMs`, `timestamp`). Use it as-is; don't create simplified versions.

---

## Layered Error Handling (ADR-012)

**Canonical Reference**: `docs/80-adrs/ADR-012-error-handling-layers.md`

PT-2 uses **two complementary error patterns** at different architectural layers:

| Layer | Pattern | Returns | Throws |
|-------|---------|---------|--------|
| **Service Layer** (`services/**`) | `throw DomainError` | `Promise<T>` | Yes, on failure |
| **Transport Layer** (Server Actions) | Return envelope | `ServiceResult<T>` | Never |

### Service Layer: THROW Errors

```typescript
// services/{domain}/{feature}.ts
import { DomainError } from '@/lib/errors/domain-errors';

export async function createPlayer(
  supabase: SupabaseClient<Database>,
  input: PlayerCreateDTO
): Promise<PlayerDTO> {  // ✅ Returns success data only
  const existing = await findByEmail(input.email);
  if (existing) {
    throw new DomainError('PLAYER_ALREADY_EXISTS');  // ✅ Throw for errors
  }

  const { data, error } = await supabase
    .from('player')
    .insert(input)
    .select()
    .single();

  if (error) {
    throw mapDatabaseError(error);  // ✅ Map Postgres → DomainError
  }

  return data;  // ✅ Return success data
}
```

### Transport Layer: RETURN Envelopes

```typescript
// app/actions/{domain}.ts
import { withServerAction } from '@/lib/server-actions/with-server-action-wrapper';

export async function createPlayerAction(input: PlayerCreateDTO) {
  return withServerAction(
    () => createPlayer(getSupabase(), input),  // ← May throw
    { supabase: getSupabase(), domain: 'player', operation: 'create' }
  );
}
// Returns: ServiceResult<PlayerDTO>
// - Success: { ok: true, code: 'OK', data: T, requestId, ... }
// - Failure: { ok: false, code: 'PLAYER_ALREADY_EXISTS', error: '...', ... }
```

### Error Flow

```
CLIENT (React)
    ↑ Receives: ServiceResult<T>
    │
TRANSPORT LAYER (withServerAction wrapper)
    ↑ Catches DomainError → Returns { ok: false, code, error }
    │
SERVICE LAYER (services/*)
    ↑ Throws: DomainError
    │
DATABASE (Supabase RPC/Query)
```

### ❌ WRONG - Service returning ServiceResult

```typescript
// ❌ DON'T DO THIS
export async function startSlip(...): Promise<ServiceResult<RatingSlipDTO>> {
  if (error) {
    return { success: false, error: { code: 'X', message: '...' } };
  }
  return { success: true, data: slip };
}
```

### ✅ CORRECT - Service throwing DomainError

```typescript
// ✅ DO THIS
export async function startSlip(...): Promise<RatingSlipDTO> {
  if (error) {
    throw new DomainError('RATING_SLIP_NOT_FOUND');
  }
  return slip;
}

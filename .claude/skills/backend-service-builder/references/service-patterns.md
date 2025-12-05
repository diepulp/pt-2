# Service Implementation Patterns

**Source**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` (SLAD v2.1.2 §308-350)
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
**Examples**: `loyalty/`, `finance/`, `mtl/`

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
├── dtos.ts              # ✅ Pick/Omit DTOs (REQUIRED)
├── selects.ts           # ✅ Named column sets (REQUIRED for services with crud.ts)
├── mappers.ts           # ✅ Row → DTO transformations (REQUIRED for services with crud.ts)
├── crud.ts              # CRUD operations (optional, can be in Server Actions)
└── README.md            # ✅ Service documentation (REQUIRED)
```

**Key Characteristics**:
- DTOs use Pick/Omit from Database types
- Mappers provide **type-safe transformations** from query results to DTOs
- No `as` casting in crud.ts operations
- Focus: schema-aligned, type-safe, no implicit conversions

### Example: services/casino/ (Reference Implementation)

```
services/casino/
├── keys.ts              # casinoKeys factory
├── dtos.ts              # CasinoDTO, StaffDTO, CasinoSettingsDTO using Pick
├── selects.ts           # CASINO_SELECT_PUBLIC, STAFF_SELECT_PUBLIC, etc.
├── mappers.ts           # toCasinoDTO, toStaffDTO, etc.
├── mappers.test.ts      # Unit tests for mappers
├── crud.ts              # CRUD operations using mappers
└── README.md            # Service documentation
```

### DTO Pattern (in dtos.ts)

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

### Mappers Pattern (REQUIRED for services with crud.ts)

When a Pattern B service has `crud.ts` with direct database operations:

```typescript
// services/{domain}/mappers.ts

// 1. Define Selected Row types matching query projections
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
- Eliminates `as` type assertions (V1 violations)
- Provides compile-time safety when columns change
- Selected types match query projections, not full Row types
- Cursor pagination may require fields (like `created_at`) not in the DTO

### Banned for Pattern B

- ❌ Manual `interface` definitions (causes schema evolution blindness)
- ❌ `as` type assertions in crud.ts (use mappers instead)
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
// services/loyalty/points-ledger.ts
export interface ServiceResult<T> {  // ❌ DUPLICATE
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
```

### ✅ CORRECT - Import from canonical location

```typescript
// services/loyalty/points-ledger.ts
import type { ServiceResult } from '@/lib/http/service-response';
// OR for server actions that return ServiceHttpResult:
import type { ServiceHttpResult } from '@/lib/http/service-response';
```

**Note**: The canonical `ServiceResult<T>` has additional fields (`requestId`, `durationMs`, `timestamp`). Use it as-is; don't create simplified versions.

---

## Layered Error Handling (ADR-012)

**Canonical Reference**: `docs/80-adrs/ADR-012-error-handling-layers.md`
**Executive Decisions**: PRD-003A §9.1-9.2, PRD-003B §10.2-10.3

PT-2 uses **two complementary error patterns** at different architectural layers:

| Layer | Pattern | Returns | Throws |
|-------|---------|---------|--------|
| **Service Layer** (`services/**`) | `throw DomainError` | `Promise<T>` | Yes, on failure |
| **Transport Layer** (Server Actions) | Return envelope | `ServiceResult<T>` | Never |

### ADR-012 Executive Decisions (2025-12-03)

**ServiceResult in Services — OUT OF SCOPE**: Services throw `DomainError`, they do NOT return `ServiceResult<T>`. This was explicitly decided and rejected in ADR-012 for:
1. Verbose composition (unwrapping at every call)
2. Type pollution (`Promise<ServiceResult<T>>` everywhere)
3. Against ERROR_TAXONOMY_AND_RESILIENCE.md (mandatory)

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
```

---

## ADR-012 Addendum: Selective Adoption (YAGNI Applied)

**Executive Decision**: PRD-003A §9.2, PRD-003B §10.3

The ADR-012 Addendum proposed 8 refinements. Per YAGNI principle and OE-01 guardrail, only immediately valuable items are adopted:

| Section | Topic | Decision | Rationale |
|---------|-------|----------|-----------|
| §1 | InfrastructureError class | **DEFER** | No jobs/workers exist yet; DomainError + mapDatabaseError sufficient |
| §2 | Cross-context error propagation | **ADOPT** | Required for PlayerService ↔ VisitService interactions |
| §4 | withEntrypoint generalization | **DEFER** | No background jobs or webhooks yet |
| §5 | assertOk helper | **ADOPT** | 5 lines, high DX value for React Query mutations |
| §7 | Test matchers (toMatchDomainError) | **DEFER** | Nice-to-have; standard Jest assertions work |
| §8 | Observability conventions | **ADOPT** | Already aligned with existing logging patterns |

### Cross-Context Error Propagation (ADOPTED §2)

When **Service A** (in context X) calls **Service B** (in context Y), wrap foreign domain errors:

```typescript
// services/visit/crud.ts - VisitService calling PlayerService
import { DomainError } from '@/lib/errors/domain-errors';

try {
  await playerService.getById(playerId);
} catch (err) {
  if (err instanceof DomainError && err.domain === 'player') {
    // Wrap in visit domain vocabulary
    throw new DomainError('VISIT_PLAYER_NOT_FOUND', { cause: err as Error });
  }
  throw err; // Re-throw infrastructure errors unchanged
}
```

**Why?** Prevents deep internal domain codes from leaking across boundaries.

### assertOk Helper (ADOPTED §5)

**Location**: `lib/http/assert-ok.ts`

```typescript
import type { ServiceResult } from '@/lib/http/service-response';

/**
 * Unwraps ServiceResult for React Query mutations.
 * Throws the result object if not ok, allowing error boundaries to catch.
 */
export function assertOk<T>(result: ServiceResult<T>): T {
  if (!result.ok) {
    throw result;
  }
  return result.data;
}
```

**Usage with React Query:**

```typescript
// Envelope style (inline handling)
const result = await createPlayerAction(input);
if (!result.ok) {
  // Show inline error message, handle code-specific UX
  return;
}
const player = result.data;

// Thrown error style (React Query error paths)
const mutation = useMutation({
  mutationFn: async (input) => assertOk(await createPlayerAction(input)),
});
```

**Why adopted?** 5 lines of code, high DX value. Converts `ServiceResult` to thrown error for `useMutation` compatibility without changing transport layer semantics.

### Deferred Items

These are tracked for Phase 3 (Rewards & Compliance) when background jobs are introduced:
- **InfrastructureError class** (§1) — Separate DB/network errors from domain errors
- **withEntrypoint generalization** (§4) — Unified wrapper for jobs, webhooks, CLI
- **Test matchers** (§7) — Custom `toMatchDomainError` Jest matcher

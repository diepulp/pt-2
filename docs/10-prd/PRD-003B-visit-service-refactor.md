# PRD-003B — VisitService Pattern B Refactoring

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Approved
- **Parent PRD:** PRD-003 (Player & Visit Management)
- **Type:** Technical Debt / Pattern Compliance
- **Summary:** Refactor VisitService to achieve full Pattern B compliance per SLAD v2.2.0 and service-patterns.md. The service is functionally complete (PRD-003 DoD satisfied) but requires structural refactoring to align with the casino service reference implementation.

## 2. Problem & Goals

### 2.1 Problem

**Audit Findings (2025-12-03)**

Lead Architect and Backend Builder audits identified the following compliance gaps:

| Issue | Severity | Current State | Required State |
|-------|----------|---------------|----------------|
| Missing `mappers.ts` | CRITICAL | Type assertions (`as`) throughout | Type-safe mapper functions |
| Missing `selects.ts` | MODERATE | Inline string constants | Exported named column sets |
| Missing `crud.ts` | MODERATE | All CRUD in `index.ts` (284 lines) | Separated CRUD operations |
| Type assertions | CRITICAL | 4+ `as` casts with ESLint overrides | Zero `as` casts via mappers |
| Error handling | MODERATE | Raw `throw error` | `throw DomainError` with codes |
| Casino context | MODERATE | Manual fallback query | Use RLS context helper |

**Compliance Score:** 8.0/10 (Functional: 10/10, Structural: 6/10)

**Reference Implementation Gap:**

```
services/casino/ (Reference)     services/visit/ (Current)
├── dtos.ts          ✅           ├── dtos.ts          ✅
├── schemas.ts       ✅           ├── schemas.ts       ✅
├── selects.ts       ✅           ├── (MISSING)        ❌
├── mappers.ts       ✅           ├── (MISSING)        ❌
├── crud.ts          ✅           ├── (inline in index.ts) ⚠️
├── keys.ts          ✅           ├── keys.ts          ✅
├── http.ts          ✅           ├── http.ts          ✅
├── index.ts         ✅           ├── index.ts         ⚠️
└── README.md        ✅           └── README.md        ✅
```

### 2.2 Goals

- **G1**: Create `services/visit/selects.ts` with named column projection constants
- **G2**: Create `services/visit/mappers.ts` with type-safe Row→DTO transformers
- **G3**: Create `services/visit/crud.ts` extracting all database operations
- **G4**: Refactor `services/visit/index.ts` to delegate to `crud.ts`
- **G5**: Replace all `as` type assertions with mapper function calls
- **G6**: Add `DomainError` handling for Postgres error mapping
- **G7**: Remove all `// eslint-disable-next-line custom-rules/no-dto-type-assertions` overrides
- **G8**: Simplify `getCasinoIdFromContext()` to use RLS context pattern

### 2.3 Non-Goals

- Functional changes (PRD-003 scope complete)
- API route changes
- Hook/key changes
- New features or endpoints
- Auto-close/timeout functionality (post-MVP)

## 3. Scope & Deliverables

### 3.1 Files to Create

| File | Purpose | Template |
|------|---------|----------|
| `services/visit/selects.ts` | Named column projection constants | `services/casino/selects.ts` |
| `services/visit/mappers.ts` | Type-safe Row→DTO transformations | `services/casino/mappers.ts` |
| `services/visit/crud.ts` | Database CRUD operations | `services/casino/crud.ts` |

### 3.2 Files to Modify

| File | Changes |
|------|---------|
| `services/visit/index.ts` | Remove inline CRUD, delegate to `crud.ts` |

### 3.3 Files Unchanged

- `services/visit/dtos.ts` - Already Pattern B compliant
- `services/visit/schemas.ts` - Already ADR-013 compliant
- `services/visit/keys.ts` - Already correct
- `services/visit/http.ts` - Already correct
- `services/visit/README.md` - Update if needed

## 4. Technical Specification

### 4.1 selects.ts

```typescript
/**
 * VisitService Select Projections
 *
 * Named column sets for consistent query projections.
 * Pattern B: Matches DTO fields for type-safe mapping.
 *
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md §327
 */

/** Visit basic fields (matches VisitDTO) */
export const VISIT_SELECT = 'id, player_id, casino_id, started_at, ended_at' as const;

/** Visit list fields (same as VISIT_SELECT) */
export const VISIT_SELECT_LIST = VISIT_SELECT;

/** Visit with player join (matches VisitWithPlayerDTO) */
export const VISIT_WITH_PLAYER_SELECT = `
  id, player_id, casino_id, started_at, ended_at,
  player:player_id (id, first_name, last_name)
` as const;

/** Active visit check fields */
export const ACTIVE_VISIT_SELECT = VISIT_SELECT;
```

### 4.2 mappers.ts

```typescript
/**
 * VisitService Mappers
 *
 * Type-safe transformations from Supabase rows to DTOs.
 * Eliminates `as` type assertions per SLAD v2.2.0 §327-365.
 *
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md §327-365
 */

import type { VisitDTO, VisitWithPlayerDTO, ActiveVisitDTO } from './dtos';

// === Selected Row Types (match what selects.ts queries return) ===

/** Type for rows returned by VISIT_SELECT query */
type VisitSelectedRow = {
  id: string;
  player_id: string;
  casino_id: string;
  started_at: string;
  ended_at: string | null;
};

/** Type for rows returned by VISIT_WITH_PLAYER_SELECT query */
type VisitWithPlayerSelectedRow = {
  id: string;
  player_id: string;
  casino_id: string;
  started_at: string;
  ended_at: string | null;
  player: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
};

// === Visit Mappers ===

export function toVisitDTO(row: VisitSelectedRow): VisitDTO {
  return {
    id: row.id,
    player_id: row.player_id,
    casino_id: row.casino_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
  };
}

export function toVisitDTOList(rows: VisitSelectedRow[]): VisitDTO[] {
  return rows.map(toVisitDTO);
}

export function toVisitDTOOrNull(row: VisitSelectedRow | null): VisitDTO | null {
  return row ? toVisitDTO(row) : null;
}

// === Visit With Player Mappers ===

export function toVisitWithPlayerDTO(row: VisitWithPlayerSelectedRow): VisitWithPlayerDTO {
  return {
    id: row.id,
    player_id: row.player_id,
    casino_id: row.casino_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    player: row.player
      ? {
          id: row.player.id,
          first_name: row.player.first_name,
          last_name: row.player.last_name,
        }
      : null,
  };
}

export function toVisitWithPlayerDTOList(rows: VisitWithPlayerSelectedRow[]): VisitWithPlayerDTO[] {
  return rows.map(toVisitWithPlayerDTO);
}

// === Active Visit Mappers ===

export function toActiveVisitDTO(row: VisitSelectedRow | null): ActiveVisitDTO {
  return {
    visit: row ? toVisitDTO(row) : null,
    hasActiveVisit: row !== null,
  };
}
```

### 4.3 crud.ts

```typescript
/**
 * VisitService CRUD Operations
 *
 * Database operations using type-safe mappers.
 * No `as` assertions; all transformations via mappers.ts.
 *
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md §341-342
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';
import type {
  VisitDTO,
  VisitWithPlayerDTO,
  ActiveVisitDTO,
  CloseVisitDTO,
  VisitListFilters,
} from './dtos';
import {
  toVisitDTO,
  toVisitDTOOrNull,
  toVisitWithPlayerDTOList,
  toActiveVisitDTO,
} from './mappers';
import {
  VISIT_SELECT,
  VISIT_WITH_PLAYER_SELECT,
  ACTIVE_VISIT_SELECT,
} from './selects';

// === Error Mapping ===

function mapDatabaseError(error: { code?: string; message: string }): DomainError {
  if (error.code === '23505') {
    // Unique constraint violation - active visit exists
    return new DomainError('VISIT_ALREADY_ACTIVE', 'Player already has an active visit');
  }
  if (error.code === '23503') {
    return new DomainError('PLAYER_NOT_FOUND', 'Referenced player not found');
  }
  return new DomainError('INTERNAL_ERROR', error.message);
}

// === Read Operations ===

export async function getVisitById(
  supabase: SupabaseClient<Database>,
  visitId: string,
): Promise<VisitDTO | null> {
  const { data, error } = await supabase
    .from('visit')
    .select(VISIT_SELECT)
    .eq('id', visitId)
    .maybeSingle();

  if (error) throw mapDatabaseError(error);
  return toVisitDTOOrNull(data);
}

export async function getActiveVisitForPlayer(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string,
): Promise<ActiveVisitDTO> {
  const { data, error } = await supabase
    .from('visit')
    .select(ACTIVE_VISIT_SELECT)
    .eq('player_id', playerId)
    .eq('casino_id', casinoId)
    .is('ended_at', null)
    .maybeSingle();

  if (error) throw mapDatabaseError(error);
  return toActiveVisitDTO(data);
}

export async function listVisits(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  filters: VisitListFilters = {},
): Promise<{ items: VisitWithPlayerDTO[]; cursor: string | null }> {
  let query = supabase
    .from('visit')
    .select(VISIT_WITH_PLAYER_SELECT)
    .eq('casino_id', casinoId)
    .order('started_at', { ascending: false })
    .limit(filters.limit ?? 20);

  // Apply status filter
  if (filters.status === 'active') {
    query = query.is('ended_at', null);
  } else if (filters.status === 'closed') {
    query = query.not('ended_at', 'is', null);
  }

  // Apply player filter
  if (filters.player_id) {
    query = query.eq('player_id', filters.player_id);
  }

  // Apply date range
  if (filters.started_after) {
    query = query.gte('started_at', filters.started_after);
  }
  if (filters.started_before) {
    query = query.lte('started_at', filters.started_before);
  }

  // Apply cursor
  if (filters.cursor) {
    query = query.lt('started_at', filters.cursor);
  }

  const { data, error } = await query;

  if (error) throw mapDatabaseError(error);

  const items = toVisitWithPlayerDTOList(data ?? []);
  const lastItem = items[items.length - 1];
  const cursor = lastItem?.started_at ?? null;

  return { items, cursor };
}

// === Write Operations ===

export async function startVisit(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string,
): Promise<VisitDTO> {
  // Check for existing active visit (idempotent)
  const existing = await getActiveVisitForPlayer(supabase, playerId, casinoId);
  if (existing.visit) {
    return existing.visit;
  }

  // Create new visit
  const { data, error } = await supabase
    .from('visit')
    .insert({
      player_id: playerId,
      casino_id: casinoId,
    })
    .select(VISIT_SELECT)
    .single();

  if (error) throw mapDatabaseError(error);
  return toVisitDTO(data);
}

export async function closeVisit(
  supabase: SupabaseClient<Database>,
  visitId: string,
  input: CloseVisitDTO = {},
): Promise<VisitDTO> {
  // First check if visit exists and is open
  const existing = await getVisitById(supabase, visitId);
  if (!existing) {
    throw new DomainError('VISIT_NOT_FOUND', `Visit not found: ${visitId}`);
  }
  if (existing.ended_at !== null) {
    // Idempotent: already closed, return as-is
    return existing;
  }

  // Close the visit
  const { data, error } = await supabase
    .from('visit')
    .update({ ended_at: input.ended_at ?? new Date().toISOString() })
    .eq('id', visitId)
    .select(VISIT_SELECT)
    .single();

  if (error) throw mapDatabaseError(error);
  return toVisitDTO(data);
}
```

### 4.4 Refactored index.ts

```typescript
/**
 * VisitService Factory
 *
 * Functional factory for visit session management.
 * Pattern B: Canonical CRUD with typed interface.
 *
 * @see PRD-003 Player & Visit Management
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md §308-350
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type {
  VisitDTO,
  VisitWithPlayerDTO,
  ActiveVisitDTO,
  CloseVisitDTO,
  VisitListFilters,
} from './dtos';
import * as crud from './crud';

// Re-export DTOs for consumers
export * from './dtos';
export * from './keys';
export * from './http';

export interface VisitServiceInterface {
  getById(visitId: string): Promise<VisitDTO | null>;
  getActiveForPlayer(playerId: string, casinoId: string): Promise<ActiveVisitDTO>;
  list(casinoId: string, filters?: VisitListFilters): Promise<{ items: VisitWithPlayerDTO[]; cursor: string | null }>;
  startVisit(playerId: string, casinoId: string): Promise<VisitDTO>;
  closeVisit(visitId: string, input?: CloseVisitDTO): Promise<VisitDTO>;
}

export function createVisitService(
  supabase: SupabaseClient<Database>,
): VisitServiceInterface {
  return {
    getById: (visitId) => crud.getVisitById(supabase, visitId),
    getActiveForPlayer: (playerId, casinoId) => crud.getActiveVisitForPlayer(supabase, playerId, casinoId),
    list: (casinoId, filters) => crud.listVisits(supabase, casinoId, filters),
    startVisit: (playerId, casinoId) => crud.startVisit(supabase, playerId, casinoId),
    closeVisit: (visitId, input) => crud.closeVisit(supabase, visitId, input),
  };
}
```

## 5. Definition of Done

### Structural Compliance
- [ ] `services/visit/selects.ts` created with all column projections
- [ ] `services/visit/mappers.ts` created with all Row→DTO mappers
- [ ] `services/visit/crud.ts` created with all database operations
- [ ] `services/visit/index.ts` refactored to delegate to crud.ts
- [ ] `getCasinoIdFromContext()` removed (callers pass casinoId explicitly)
- [ ] `app/api/v1/visits/route.ts` updated to pass `mwCtx.casinoId` to `startVisit()`

### Type Safety
- [ ] Zero `as` type assertions in crud.ts
- [ ] Zero `// eslint-disable-next-line custom-rules/no-dto-type-assertions` overrides
- [ ] All mapper functions have explicit input/output types
- [ ] `npm run typecheck` passes

### Error Handling
- [ ] All database errors mapped via `mapDatabaseError()`
- [ ] Domain error codes: `VISIT_NOT_FOUND`, `VISIT_ALREADY_ACTIVE`, `VISIT_ALREADY_CLOSED`
- [ ] No raw Postgres errors leak to callers

### Testing
- [ ] Existing tests pass (`services/visit/__tests__/`)
- [ ] New mapper unit tests added (`services/visit/__tests__/mappers.test.ts`)
- [ ] `npm run test` passes

### Quality Gates
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] Pre-commit hooks pass

## 6. Effort Estimate

| Phase | Task | Hours |
|-------|------|-------|
| 1 | Create selects.ts | 0.5 |
| 2 | Create mappers.ts with types | 1.0 |
| 3 | Create crud.ts with error handling | 1.5 |
| 4 | Refactor index.ts, remove getCasinoIdFromContext | 0.5 |
| 5 | Add mapper tests | 1.0 |
| 6 | Verify all tests pass | 0.5 |
| **Total** | | **5 hours** |

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing consumers | Low | High | Maintain same interface signature |
| Mapper type mismatches | Medium | Medium | Add unit tests for each mapper |
| Casino context change | Medium | Low | Update route handlers to pass casinoId |
| Join query mapper issues | Medium | Medium | Test VisitWithPlayer mapping thoroughly |

## 8. Migration Notes

### Interface Signature Change

The `getCasinoIdFromContext()` internal function is being removed. Callers must now pass `casinoId` explicitly:

**Before:**
```typescript
// Internal to VisitService
async function getCasinoIdFromContext(): Promise<string> { ... }

// Service method uses it internally
async startVisit(playerId: string): Promise<VisitDTO>
```

**After:**
```typescript
// Caller provides casinoId
async startVisit(playerId: string, casinoId: string): Promise<VisitDTO>
```

This change:
- Removes circular dependency risk (querying visit table within VisitService)
- Aligns with explicit dependency injection pattern
- Matches casino service pattern

### Route Handler Updates Required

**Executive Decision (2025-12-03):** Minimal route handler changes required.

| Route | Change Required | Rationale |
|-------|-----------------|-----------|
| `POST /api/v1/visits` | **YES** — Pass `mwCtx.casinoId` to `startVisit()` | INSERT requires explicit casino_id |
| `GET /api/v1/visits` | **NO** — RLS handles scoping | Query-only, RLS filters by casino |
| `GET /api/v1/visits/active` | **NO** — RLS handles scoping | Query-only, RLS filters by casino |
| `PATCH /api/v1/visits/[visitId]/close` | **NO** — UPDATE by visitId | RLS validates ownership |

**Implementation:**
```typescript
// POST /api/v1/visits (BEFORE)
const visit = await service.startVisit(input.player_id);

// POST /api/v1/visits (AFTER)
const visit = await service.startVisit(input.player_id, mwCtx.casinoId);
```

The `withServerAction` middleware already provides `mwCtx.casinoId` from JWT claims.

## 9. Related Documents

- **Parent PRD**: [PRD-003-player-visit-management.md](./PRD-003-player-visit-management.md)
- **Sibling PRD**: [PRD-003A-player-service-refactor.md](./PRD-003A-player-service-refactor.md)
- **Reference Implementation**: `services/casino/` (mappers.ts, crud.ts, selects.ts)
- **Pattern Guide**: `.claude/skills/backend-service-builder/references/service-patterns.md`
- **DTO Rules**: `.claude/skills/backend-service-builder/references/dto-rules.md`
- **Architecture**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` §327-365
- **Error Handling**: [ADR-012-error-handling-layers.md](../80-adrs/ADR-012-error-handling-layers.md) (ServiceResult scope authority)

## 10. Executive Decisions

### 10.1 Route Handler Changes — Minimal Impact

**Decision:** Only `POST /api/v1/visits` requires update to pass casinoId.

**Analysis:**
- Read operations (GET) rely on RLS to scope results by casino — no changes needed
- Update operations (PATCH close) use visitId which RLS validates ownership — no changes needed
- INSERT operations (POST start) require explicit casino_id — must pass from middleware context

### 10.2 ServiceResult Wrapper — Out of Scope (per ADR-012)

**Decision:** ServiceResult wrapper is **NOT** included in this refactor.

**Authority:** This decision is governed by **[ADR-012: Error Handling Layers](../80-adrs/ADR-012-error-handling-layers.md)** (Accepted, 2025-11-28).

**ADR-012 Mandates:**
| Layer | Pattern | Returns |
|-------|---------|---------|
| Service Layer | `throw DomainError` | `Promise<T>` |
| Transport Layer | Catch + envelope | `ServiceResult<T>` |

**Current Pattern (Retained per ADR-012):**
```typescript
// Service Layer: throws DomainError, returns Promise<T>
async startVisit(playerId: string, casinoId: string): Promise<VisitDTO>

// Transport Layer: catches errors, returns ServiceResult<T>
try {
  const visit = await service.startVisit(playerId, mwCtx.casinoId);
  return successResponse(ctx, visit);  // → ServiceResult<VisitDTO>
} catch (error) {
  return errorResponse(ctx, error);    // → ServiceResult with error code
}
```

**Note:** The question of "ServiceResult in services" was already decided and rejected in ADR-012 for these reasons:
1. Verbose composition (unwrapping at every call)
2. Type pollution (`Promise<ServiceResult<T>>` everywhere)
3. Against ERROR_TAXONOMY_AND_RESILIENCE.md (mandatory)

### 10.3 ADR-012 Addendum-001: Selective Adoption (YAGNI Applied)

**Decision:** ADR-012 Addendum-001 refinements are **selectively adopted** per OE-01 guardrail.

**Context:** The addendum proposed 8 refinements. Per YAGNI principle and OE-01 over-engineering guardrail, only immediately valuable items are adopted.

| Section | Topic | Decision | Rationale |
|---------|-------|----------|-----------|
| §1 | InfrastructureError class | **DEFER** | OE-01 guardrail — no jobs/workers exist yet; DomainError + mapDatabaseError sufficient |
| §2 | Cross-context error propagation | **ADOPT** | Required for VisitService ↔ PlayerService interactions |
| §4 | withEntrypoint generalization | **DEFER** | No background jobs or webhooks yet; withServerAction sufficient |
| §5 | assertOk helper | **ADOPT** | 5 lines of code, high DX value for React Query mutations |
| §7 | Test matchers (toMatchDomainError) | **DEFER** | Nice-to-have; standard Jest assertions work |
| §8 | Observability conventions | **ADOPT** | Already aligned with existing logging patterns |

**Implementation:**
- Create `lib/http/assert-ok.ts` (5 lines)
- Cross-context propagation: Apply when VisitService calls PlayerService or vice versa
- Observability: Continue existing warn/error logging conventions

**Deferred items tracked for Phase 3 (Rewards & Compliance)** when background jobs are introduced.

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-03 | Lead Architect | Initial draft from audit findings |
| 1.1.0 | 2025-12-03 | Lead Architect | Approved. Added executive decisions on route handlers and ServiceResult scope |
| 1.2.0 | 2025-12-03 | Lead Architect | Added §10.3 ADR-012 Addendum selective adoption decision. Production-ready. |

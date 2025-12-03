# PRD-003A — PlayerService Pattern B Refactoring

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Approved
- **Parent PRD:** PRD-003 (Player & Visit Management)
- **Type:** Technical Debt / Pattern Compliance
- **Summary:** Refactor PlayerService to achieve full Pattern B compliance per SLAD v2.2.0 and service-patterns.md. The service is functionally complete (PRD-003 DoD satisfied) but requires structural refactoring to align with the casino service reference implementation.

## 2. Problem & Goals

### 2.1 Problem

**Audit Findings (2025-12-03)**

Lead Architect and Backend Builder audits identified the following compliance gaps:

| Issue | Severity | Current State | Required State |
|-------|----------|---------------|----------------|
| Missing `mappers.ts` | CRITICAL | Type assertions (`as`) throughout | Type-safe mapper functions |
| Missing `selects.ts` | MODERATE | Inline string constants | Exported named column sets |
| Missing `crud.ts` | MODERATE | All CRUD in `index.ts` (286 lines) | Separated CRUD operations |
| Type assertions | CRITICAL | 7+ `as` casts with ESLint overrides | Zero `as` casts via mappers |
| Error handling | MODERATE | Raw `throw error` | `throw DomainError` with codes |

**Compliance Score:** 8.5/10 (Functional: 10/10, Structural: 7/10)

**Reference Implementation Gap:**

```
services/casino/ (Reference)     services/player/ (Current)
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

- **G1**: Create `services/player/selects.ts` with named column projection constants
- **G2**: Create `services/player/mappers.ts` with type-safe Row→DTO transformers
- **G3**: Create `services/player/crud.ts` extracting all database operations
- **G4**: Refactor `services/player/index.ts` to delegate to `crud.ts`
- **G5**: Replace all `as` type assertions with mapper function calls
- **G6**: Add `DomainError` handling for Postgres error mapping
- **G7**: Remove all `// eslint-disable-next-line custom-rules/no-dto-type-assertions` overrides

### 2.3 Non-Goals

- Functional changes (PRD-003 scope complete)
- API route changes
- Hook/key changes
- New features or endpoints

## 3. Scope & Deliverables

### 3.1 Files to Create

| File | Purpose | Template |
|------|---------|----------|
| `services/player/selects.ts` | Named column projection constants | `services/casino/selects.ts` |
| `services/player/mappers.ts` | Type-safe Row→DTO transformations | `services/casino/mappers.ts` |
| `services/player/crud.ts` | Database CRUD operations | `services/casino/crud.ts` |

### 3.2 Files to Modify

| File | Changes |
|------|---------|
| `services/player/index.ts` | Remove inline CRUD, delegate to `crud.ts` |

### 3.3 Files Unchanged

- `services/player/dtos.ts` - Already Pattern B compliant
- `services/player/schemas.ts` - Already ADR-013 compliant
- `services/player/keys.ts` - Already correct
- `services/player/http.ts` - Already correct
- `services/player/README.md` - Update if needed

## 4. Technical Specification

### 4.1 selects.ts

```typescript
/**
 * PlayerService Select Projections
 *
 * Named column sets for consistent query projections.
 * Pattern B: Matches DTO fields for type-safe mapping.
 *
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md §327
 */

/** Player profile fields (matches PlayerDTO) */
export const PLAYER_SELECT = 'id, first_name, last_name, birth_date, created_at' as const;

/** Player list fields (same as PLAYER_SELECT for consistency) */
export const PLAYER_SELECT_LIST = PLAYER_SELECT;

/** Enrollment fields (matches PlayerEnrollmentDTO) */
export const ENROLLMENT_SELECT = 'player_id, casino_id, status, enrolled_at' as const;

/** Player search join (player via player_casino) */
export const PLAYER_SEARCH_SELECT = `
  player:player_id (
    id,
    first_name,
    last_name
  ),
  status
` as const;
```

### 4.2 mappers.ts

```typescript
/**
 * PlayerService Mappers
 *
 * Type-safe transformations from Supabase rows to DTOs.
 * Eliminates `as` type assertions per SLAD v2.2.0 §327-365.
 *
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md §327-365
 */

import type { PlayerDTO, PlayerEnrollmentDTO, PlayerSearchResultDTO } from './dtos';

// === Selected Row Types (match what selects.ts queries return) ===

/** Type for rows returned by PLAYER_SELECT query */
type PlayerSelectedRow = {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  created_at: string;
};

/** Type for rows returned by ENROLLMENT_SELECT query */
type EnrollmentSelectedRow = {
  player_id: string;
  casino_id: string;
  status: string;
  enrolled_at: string;
};

/** Type for rows returned by PLAYER_SEARCH_SELECT query */
type PlayerSearchSelectedRow = {
  player: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  status: string;
};

// === Player Mappers ===

export function toPlayerDTO(row: PlayerSelectedRow): PlayerDTO {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    birth_date: row.birth_date,
    created_at: row.created_at,
  };
}

export function toPlayerDTOList(rows: PlayerSelectedRow[]): PlayerDTO[] {
  return rows.map(toPlayerDTO);
}

export function toPlayerDTOOrNull(row: PlayerSelectedRow | null): PlayerDTO | null {
  return row ? toPlayerDTO(row) : null;
}

// === Enrollment Mappers ===

export function toEnrollmentDTO(row: EnrollmentSelectedRow): PlayerEnrollmentDTO {
  return {
    player_id: row.player_id,
    casino_id: row.casino_id,
    status: row.status,
    enrolled_at: row.enrolled_at,
  };
}

export function toEnrollmentDTOOrNull(row: EnrollmentSelectedRow | null): PlayerEnrollmentDTO | null {
  return row ? toEnrollmentDTO(row) : null;
}

// === Search Result Mappers ===

export function toPlayerSearchResultDTO(row: PlayerSearchSelectedRow): PlayerSearchResultDTO | null {
  if (!row.player) return null;

  return {
    id: row.player.id,
    first_name: row.player.first_name,
    last_name: row.player.last_name,
    full_name: `${row.player.first_name} ${row.player.last_name}`,
    enrollment_status: row.status === 'active' ? 'enrolled' : 'not_enrolled',
  };
}

export function toPlayerSearchResultDTOList(rows: PlayerSearchSelectedRow[]): PlayerSearchResultDTO[] {
  return rows
    .map(toPlayerSearchResultDTO)
    .filter((dto): dto is PlayerSearchResultDTO => dto !== null);
}
```

### 4.3 crud.ts

```typescript
/**
 * PlayerService CRUD Operations
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
  PlayerDTO,
  PlayerEnrollmentDTO,
  PlayerSearchResultDTO,
  CreatePlayerDTO,
  UpdatePlayerDTO,
} from './dtos';
import {
  toPlayerDTO,
  toPlayerDTOOrNull,
  toEnrollmentDTO,
  toEnrollmentDTOOrNull,
  toPlayerSearchResultDTOList,
} from './mappers';
import { PLAYER_SELECT, ENROLLMENT_SELECT, PLAYER_SEARCH_SELECT } from './selects';

// === Error Mapping ===

function mapDatabaseError(error: { code?: string; message: string }): DomainError {
  if (error.code === '23505') {
    return new DomainError('PLAYER_ALREADY_EXISTS', 'Player already exists');
  }
  if (error.code === '23503') {
    return new DomainError('PLAYER_NOT_FOUND', 'Referenced player not found');
  }
  return new DomainError('INTERNAL_ERROR', error.message);
}

// === Player CRUD ===

export async function getPlayerById(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<PlayerDTO | null> {
  const { data, error } = await supabase
    .from('player')
    .select(PLAYER_SELECT)
    .eq('id', playerId)
    .maybeSingle();

  if (error) throw mapDatabaseError(error);
  return toPlayerDTOOrNull(data);
}

export async function createPlayer(
  supabase: SupabaseClient<Database>,
  input: CreatePlayerDTO,
): Promise<PlayerDTO> {
  const { data, error } = await supabase
    .from('player')
    .insert({
      first_name: input.first_name,
      last_name: input.last_name,
      birth_date: input.birth_date ?? null,
    })
    .select(PLAYER_SELECT)
    .single();

  if (error) throw mapDatabaseError(error);
  return toPlayerDTO(data);
}

export async function updatePlayer(
  supabase: SupabaseClient<Database>,
  playerId: string,
  input: UpdatePlayerDTO,
): Promise<PlayerDTO> {
  const updateData: Record<string, unknown> = {};
  if (input.first_name !== undefined) updateData.first_name = input.first_name;
  if (input.last_name !== undefined) updateData.last_name = input.last_name;
  if (input.birth_date !== undefined) updateData.birth_date = input.birth_date;

  const { data, error } = await supabase
    .from('player')
    .update(updateData)
    .eq('id', playerId)
    .select(PLAYER_SELECT)
    .single();

  if (error) throw mapDatabaseError(error);
  return toPlayerDTO(data);
}

// === Search ===

export async function searchPlayers(
  supabase: SupabaseClient<Database>,
  query: string,
  limit: number = 20,
): Promise<PlayerSearchResultDTO[]> {
  const { data, error } = await supabase
    .from('player_casino')
    .select(PLAYER_SEARCH_SELECT)
    .or(`player.first_name.ilike.%${query}%,player.last_name.ilike.%${query}%`)
    .limit(limit);

  if (error) throw mapDatabaseError(error);
  return toPlayerSearchResultDTOList(data ?? []);
}

// === Enrollment ===

export async function enrollPlayer(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string,
): Promise<PlayerEnrollmentDTO> {
  const { data, error } = await supabase
    .from('player_casino')
    .upsert(
      { player_id: playerId, casino_id: casinoId, status: 'active' },
      { onConflict: 'player_id,casino_id' }
    )
    .select(ENROLLMENT_SELECT)
    .single();

  if (error) throw mapDatabaseError(error);
  return toEnrollmentDTO(data);
}

export async function getPlayerEnrollment(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string,
): Promise<PlayerEnrollmentDTO | null> {
  const { data, error } = await supabase
    .from('player_casino')
    .select(ENROLLMENT_SELECT)
    .eq('player_id', playerId)
    .eq('casino_id', casinoId)
    .maybeSingle();

  if (error) throw mapDatabaseError(error);
  return toEnrollmentDTOOrNull(data);
}
```

### 4.4 Refactored index.ts

```typescript
/**
 * PlayerService Factory
 *
 * Functional factory for player identity management.
 * Pattern B: Canonical CRUD with typed interface.
 *
 * @see PRD-003 Player & Visit Management
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md §308-350
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type {
  PlayerDTO,
  PlayerEnrollmentDTO,
  PlayerSearchResultDTO,
  CreatePlayerDTO,
  UpdatePlayerDTO,
} from './dtos';
import * as crud from './crud';

// Re-export DTOs for consumers
export * from './dtos';
export * from './keys';
export * from './http';

export interface PlayerServiceInterface {
  search(query: string, limit?: number): Promise<PlayerSearchResultDTO[]>;
  getById(playerId: string): Promise<PlayerDTO | null>;
  create(input: CreatePlayerDTO): Promise<PlayerDTO>;
  update(playerId: string, input: UpdatePlayerDTO): Promise<PlayerDTO>;
  enroll(playerId: string, casinoId: string): Promise<PlayerEnrollmentDTO>;
  getEnrollment(playerId: string, casinoId: string): Promise<PlayerEnrollmentDTO | null>;
}

export function createPlayerService(
  supabase: SupabaseClient<Database>,
): PlayerServiceInterface {
  return {
    search: (query, limit) => crud.searchPlayers(supabase, query, limit),
    getById: (playerId) => crud.getPlayerById(supabase, playerId),
    create: (input) => crud.createPlayer(supabase, input),
    update: (playerId, input) => crud.updatePlayer(supabase, playerId, input),
    enroll: (playerId, casinoId) => crud.enrollPlayer(supabase, playerId, casinoId),
    getEnrollment: (playerId, casinoId) => crud.getPlayerEnrollment(supabase, playerId, casinoId),
  };
}
```

## 5. Definition of Done

### Structural Compliance
- [ ] `services/player/selects.ts` created with all column projections
- [ ] `services/player/mappers.ts` created with all Row→DTO mappers
- [ ] `services/player/crud.ts` created with all database operations
- [ ] `services/player/index.ts` refactored to delegate to crud.ts

### Type Safety
- [ ] Zero `as` type assertions in crud.ts
- [ ] Zero `// eslint-disable-next-line custom-rules/no-dto-type-assertions` overrides
- [ ] All mapper functions have explicit input/output types
- [ ] `npm run typecheck` passes

### Error Handling
- [ ] All database errors mapped via `mapDatabaseError()`
- [ ] Domain error codes: `PLAYER_NOT_FOUND`, `PLAYER_ALREADY_EXISTS`
- [ ] No raw Postgres errors leak to callers

### Testing
- [ ] Existing tests pass (`services/player/__tests__/`)
- [ ] New mapper unit tests added (`services/player/__tests__/mappers.test.ts`)
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
| 4 | Refactor index.ts | 0.5 |
| 5 | Add mapper tests | 1.0 |
| 6 | Verify all tests pass | 0.5 |
| **Total** | | **5 hours** |

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing consumers | Low | High | Maintain same interface signature |
| Mapper type mismatches | Medium | Medium | Add unit tests for each mapper |
| Missing error code | Low | Low | Compare with casino service |

## 8. Related Documents

- **Parent PRD**: [PRD-003-player-visit-management.md](./PRD-003-player-visit-management.md)
- **Reference Implementation**: `services/casino/` (mappers.ts, crud.ts, selects.ts)
- **Pattern Guide**: `.claude/skills/backend-service-builder/references/service-patterns.md`
- **DTO Rules**: `.claude/skills/backend-service-builder/references/dto-rules.md`
- **Architecture**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` §327-365
- **Error Handling**: [ADR-012-error-handling-layers.md](../80-adrs/ADR-012-error-handling-layers.md) (ServiceResult scope authority)

## 9. Executive Decisions

### 9.1 ServiceResult Wrapper — Out of Scope (per ADR-012)

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
async getById(playerId: string): Promise<PlayerDTO | null>

// Transport Layer: catches errors, returns ServiceResult<T>
try {
  const player = await service.getById(playerId);
  return successResponse(ctx, player);  // → ServiceResult<PlayerDTO>
} catch (error) {
  return errorResponse(ctx, error);     // → ServiceResult with error code
}
```

**Note:** The question of "ServiceResult in services" was already decided and rejected in ADR-012 for these reasons:
1. Verbose composition (unwrapping at every call)
2. Type pollution (`Promise<ServiceResult<T>>` everywhere)
3. Against ERROR_TAXONOMY_AND_RESILIENCE.md (mandatory)

### 9.2 ADR-012 Addendum-001: Selective Adoption (YAGNI Applied)

**Decision:** ADR-012 Addendum-001 refinements are **selectively adopted** per OE-01 guardrail.

**Context:** The addendum proposed 8 refinements. Per YAGNI principle and OE-01 over-engineering guardrail, only immediately valuable items are adopted.

| Section | Topic | Decision | Rationale |
|---------|-------|----------|-----------|
| §1 | InfrastructureError class | **DEFER** | OE-01 guardrail — no jobs/workers exist yet; DomainError + mapDatabaseError sufficient |
| §2 | Cross-context error propagation | **ADOPT** | Required for PlayerService ↔ VisitService interactions |
| §4 | withEntrypoint generalization | **DEFER** | No background jobs or webhooks yet; withServerAction sufficient |
| §5 | assertOk helper | **ADOPT** | 5 lines of code, high DX value for React Query mutations |
| §7 | Test matchers (toMatchDomainError) | **DEFER** | Nice-to-have; standard Jest assertions work |
| §8 | Observability conventions | **ADOPT** | Already aligned with existing logging patterns |

**Implementation:**
- Create `lib/http/assert-ok.ts` (5 lines)
- Cross-context propagation: Apply when PlayerService calls VisitService or vice versa
- Observability: Continue existing warn/error logging conventions

**Deferred items tracked for Phase 3 (Rewards & Compliance)** when background jobs are introduced.

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-03 | Lead Architect | Initial draft from audit findings |
| 1.1.0 | 2025-12-03 | Lead Architect | Approved. Added executive decision on ServiceResult scope |
| 1.2.0 | 2025-12-03 | Lead Architect | Added §9.2 ADR-012 Addendum selective adoption decision. Production-ready. |

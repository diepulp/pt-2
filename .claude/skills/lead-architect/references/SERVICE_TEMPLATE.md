# PT-2 Service Implementation Guide

**Version**: 2.0.3
**Date**: 2025-11-20
**Status**: CANONICAL (Aligned with Actual Implementation + SLAD v2.1.2)
**Supersedes**: v2.0.2 (reality alignment - documents actual vs. planned patterns)

> **Architecture Reference**: [SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md](../20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md) (SLAD v2.1.2)
> **This Document**: Quick implementation guide derived from SLAD + actual service patterns

---

## Purpose

This guide helps you implement new services following PT-2 architecture patterns. It is a **thin reference** that points to SLAD for architecture details and actual service implementations for examples.

---

## Quick Start: Choose Your Pattern

### Decision Tree

```
┌─ Is this complex business logic with domain contracts?
│  (Loyalty points, Financial transactions, Compliance workflows)
│  └─> Pattern A: Contract-First
│
├─ Is this simple CRUD over database tables?
│  (Player identity, Visit sessions, Casino config, Floor layouts)
│  └─> Pattern B: Canonical CRUD
│
└─ Mixed complexity?
   (RatingSlip: state machine + CRUD, some domain logic)
   └─> Pattern C: Hybrid
```

**See SLAD §345-361** for complete pattern definitions and examples.

---

## Implementation Status Overview

**Last Verified**: 2025-11-20

This table shows which architectural components are **currently deployed** (✅) vs. **planned for future** (⚠️):

| Component | Pattern A | Pattern B | Pattern C | Adoption Rate | Status |
|-----------|-----------|-----------|-----------|---------------|--------|
| **keys.ts** | ✅ Required | ✅ Required | ✅ Required | 100% | ✅ DEPLOYED |
| **README.md** | ✅ Required | ✅ Required | ✅ Required | 100% | ✅ DEPLOYED |
| **{feature}.ts** | ✅ Required | ⚠️ Minimal | ✅ Required | 100% | ✅ DEPLOYED |
| **{feature}.test.ts** | ✅ Required | ⚠️ Optional | ✅ Required | ~80% | ✅ DEPLOYED |
| **DTOs inline** | ✅ Current | ✅ Current | ✅ Current | 100% | ✅ DEPLOYED |
| **Mappers inline** | ✅ Current | N/A | ✅ Current | 100% | ✅ DEPLOYED |
| | | | | | |
| **dtos.ts** (file) | ⚠️ Planned | ⚠️ Planned | ⚠️ Planned | 0% | ⚠️ NOT IMPLEMENTED |
| **mappers.ts** (file) | ⚠️ Planned | N/A | ⚠️ Planned | 0% | ⚠️ NOT IMPLEMENTED |
| **selects.ts** (file) | ⚠️ Planned | ⚠️ Planned | ⚠️ Planned | 0% | ⚠️ NOT IMPLEMENTED |
| **http.ts** (file) | ⚠️ Planned | ⚠️ Planned | ⚠️ Planned | 0% | ⚠️ NOT IMPLEMENTED |
| **index.ts** (file) | ⚠️ Planned | ⚠️ Planned | ⚠️ Planned | 0% | ⚠️ NOT IMPLEMENTED |
| **crud.ts** (file) | ⚠️ Planned | ⚠️ Optional | ⚠️ Planned | 0% | ⚠️ NOT IMPLEMENTED |
| **business.ts** (file) | ⚠️ Planned | N/A | ⚠️ Planned | 0% | ⚠️ NOT IMPLEMENTED |
| **queries.ts** (file) | ⚠️ Planned | ⚠️ Optional | ⚠️ Planned | 0% | ⚠️ NOT IMPLEMENTED |
| | | | | | |
| **Error Handling Infrastructure** | | | | | |
| ServiceResult<T> (type) | ✅ Deployed | ✅ Deployed | ✅ Deployed | 100% | ✅ DEPLOYED |
| withServerAction() (fn) | ✅ Deployed | ✅ Deployed | ✅ Deployed | 100% | ✅ DEPLOYED (edge layer) |
| executeOperation() (fn) | ⚠️ Planned | ⚠️ Planned | ⚠️ Planned | 0% | ⚠️ NOT IMPLEMENTED (service layer) |

**Legend**:
- ✅ **DEPLOYED** - Implemented and in active use
- ⚠️ **PLANNED** - Documented in SLAD but not yet implemented
- **(file)** - File/module in directory structure
- **(type)** - TypeScript type definition
- **(fn)** - Function/wrapper pattern
- N/A - Not applicable for this pattern

**Note**: `ServiceResult<T>` and `withServerAction()` are deployed infrastructure. `executeOperation()` is a hypothetical service-layer wrapper function (not a file) that would complement `withServerAction()` but operates at a different layer.

**Key Insights**:
- **File Structure**: Current implementation uses **4-5 files per service** (simple, co-located) vs. SLAD's **9-11 files** (modular, separated)
- **Error Handling**: Edge-layer infrastructure (`ServiceResult<T>`, `withServerAction()`) is deployed; service-layer wrapper (`executeOperation()`) is planned
- **Planning Stage**: This is documentation alignment - no full service layer implementation exists yet; patterns reflect planned architecture
- **Evolution Path**: Both approaches valid - current suits early-stage services, SLAD architecture will be adopted as services mature

---

## Pattern A: Contract-First Services

**Use When**: Complex business logic, domain contracts, cross-context boundaries
**Examples**: `services/loyalty/`, `services/finance/`, `services/mtl/`, `services/table-context/`
**SLAD Reference**: §362-424

### Directory Structure (Current Implementation)

**Status**: ✅ **DEPLOYED** - This is what exists in the codebase today

```
services/{domain}/
├── keys.ts              # React Query key factories (REQUIRED) ✅ 100% adoption
├── {feature}.ts         # Business logic / RPC wrappers WITH INLINE DTOs ✅ 100% adoption
├── {feature}.test.ts    # Unit/integration tests ✅ ~80% coverage
└── README.md            # Service documentation with SRM reference ✅ 100% adoption
```

**Key Characteristics**:
- **DTOs are inline**: Defined in the same file as business logic (not in separate `dtos.ts`)
- **Mappers are inline**: Transformation logic embedded in feature files (not in separate `mappers.ts`)
- **No service factories**: Services export standalone functions, not factory pattern
- **Minimal file count**: Focus on simplicity and co-location

**Example**: `services/loyalty/` (Verified 2025-11-20)
```
services/loyalty/
├── keys.ts                      # ✅ loyaltyKeys factory (EXISTS)
├── mid-session-reward.ts        # ✅ Business logic with INLINE DTOs (EXISTS)
├── mid-session-reward.test.ts   # ✅ Tests (EXISTS)
└── README.md                    # ✅ References SRM §1061-1274 (EXISTS)
```

**Note**: This service does NOT have `dtos.ts`, `mappers.ts`, `http.ts`, `index.ts`, or `crud.ts` files. All functionality is consolidated in the feature file.

---

### Planned Enhancements (SLAD Architecture - Not Yet Implemented)

**Status**: ⚠️ **PLANNED** - These patterns are documented in SLAD §308-348 but have **0% adoption** as of 2025-11-20

The following directory structure represents the **aspirational architecture** from SLAD. It has NOT been implemented yet, but is preserved here for future reference:

```
services/{domain}/
├── keys.ts              # ✅ DEPLOYED (100% adoption)
├── {feature}.ts         # ✅ DEPLOYED (100% adoption)
├── {feature}.test.ts    # ✅ DEPLOYED (~80% coverage)
├── README.md            # ✅ DEPLOYED (100% adoption)
│
├── dtos.ts              # ⚠️ PLANNED - Centralized DTO exports (SLAD §315)
├── mappers.ts           # ⚠️ PLANNED - Database ↔ DTO transformations (SLAD §320)
├── selects.ts           # ⚠️ PLANNED - Named column sets (SLAD §326)
├── http.ts              # ⚠️ PLANNED - HTTP fetchers (SLAD §333)
├── index.ts             # ⚠️ PLANNED - Service factory pattern (SLAD §336)
├── crud.ts              # ⚠️ PLANNED - CRUD operations (SLAD §341)
├── business.ts          # ⚠️ PLANNED - Business logic extraction (SLAD §344)
└── queries.ts           # ⚠️ PLANNED - Complex queries (SLAD §347)
```

**Why not implemented yet?**
- Early-stage services prioritize simplicity over separation
- Inline DTOs/mappers reduce file navigation overhead
- Service factories deferred until cross-context reuse emerges
- Will implement incrementally as services mature

**Future migration path**: When a service grows complex enough:
1. Extract inline DTOs to `dtos.ts`
2. Add `mappers.ts` for boundary enforcement
3. Implement factory pattern in `index.ts`
4. Separate CRUD from business logic

---

### DTO Pattern (Current Implementation)

**Manual interfaces** inline with business logic:

> **Current Approach**: Pattern A services define DTOs inline in feature files (e.g., `mid-session-reward.ts`). Mapping logic is embedded as standalone functions (e.g., `buildMidSessionRewardRpcInput()`). This keeps related types and logic co-located.
>
> **Future Architecture** (SLAD §362-424, SRM v3.1.0:141-154): When services mature, extract DTOs to `dtos.ts` and add `mappers.ts` to enforce Database ↔ DTO boundary. The `mappers.ts` file will prevent direct schema coupling and maintain schema evolution independence.

```typescript
// services/loyalty/mid-session-reward.ts (ACTUAL CODE)
export interface MidSessionRewardInput {
  casinoId: string;
  playerId: string;
  ratingSlipId: string;
  staffId: string;
  points: number;
  idempotencyKey: string;
  reason?: LoyaltyReason;
}

export interface MidSessionRewardRpcInput {
  p_casino_id: string;
  p_player_id: string;
  p_rating_slip_id: string;
  p_staff_id: string;
  p_points: number;
  p_idempotency_key: string;
  p_reason: LoyaltyReason;
}
```

### React Query Keys Pattern

**ALL services** use React Query key factories:

```typescript
// services/loyalty/keys.ts (ACTUAL CODE)
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

**See SLAD §1032-1112** for complete React Query patterns.

### Error Handling Pattern

**Role of `executeOperation()`**: Service-layer wrapper function that would return `ServiceResult<T>` envelopes for individual business operations.

**What EXISTS Today** (✅ DEPLOYED):
- ✅ `ServiceResult<T>` type definition (lib/http/service-response.ts:21-30)
- ✅ `withServerAction()` wrapper (lib/server-actions/with-server-action-wrapper.ts:74)
  - **Layer**: Edge/transport layer (wraps entire Server Actions)
  - **Returns**: `ServiceResult<T>` envelope
  - **Handles**: Auth, RLS injection, rate limiting, audit logging, error mapping
  - **Usage**: `withServerAction(handler, { endpoint, actorId, casinoId })`

**What's PLANNED** (⚠️ NOT IMPLEMENTED):
- ⚠️ `executeOperation()` wrapper (SLAD §918-975 - hypothetical)
  - **Layer**: Service layer (wraps individual business operations)
  - **Returns**: `ServiceResult<T>` envelope
  - **Handles**: Operation-level error catching, labeling, request ID generation
  - **Would Live**: `services/shared/operation-wrapper.ts` (file doesn't exist)

**Current Reality**: Services handle errors inline. Edge-layer error handling exists via `withServerAction()`, but there's no service-layer operation wrapper. The `executeOperation()` pattern is documented in SLAD as aspirational architecture.

**Reference**: SLAD §918-975 (Operation Wrapper Pattern - Planned)

```typescript
// services/shared/operation-wrapper.ts
export async function executeOperation<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<ServiceResult<T>> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const timestamp = new Date().toISOString();

  try {
    const data = await operation();
    return {
      data,
      error: null,
      success: true,
      timestamp,
      requestId,
    };
  } catch (err: any) {
    return {
      data: null,
      error: { code: err?.code ?? 'OPERATION_FAILED', message: err?.message },
      success: false,
      timestamp,
      requestId,
    };
  }
}

// services/loyalty/mid-session-reward.ts (EXAMPLE USAGE)
import { executeOperation } from '@/services/shared/operation-wrapper';
import type { ServiceResult } from '@/services/shared/types';

export async function rewardPlayer(
  input: MidSessionRewardInput
): Promise<ServiceResult<RewardDTO>> {
  return executeOperation('loyalty.rewardPlayer', async () => {
    // Business logic
    const rpcInput = buildMidSessionRewardRpcInput(input);
    const { data, error } = await supabase.rpc('issue_mid_session_reward', rpcInput);

    if (error) throw error;
    return mapToRewardDTO(data);
  });
}
```

**Benefits**:
- Consistent error handling across all service operations
- Structured ServiceResult<T> envelope for type-safe error checking
- Operation labels for observability (e.g., `'loyalty.rewardPlayer'`)
- Request tracking with unique requestId
- Timestamp metadata for debugging

**See SLAD §918-975** for complete implementation details and ServiceResult<T> contract.

### Checklist (Current Implementation)

**✅ Required (Must Do Today)**:
- [ ] Create `keys.ts` with React Query factory keys
- [ ] Define domain DTOs inline in `{feature}.ts` (co-located with logic)
- [ ] Add inline mapping functions (e.g., `buildXRpcInput()`)
- [ ] Add `README.md` with SRM reference
- [ ] Write tests for business logic (`{feature}.test.ts`)

**⚠️ Planned (Future Enhancements)**:
- [ ] Extract DTOs to `dtos.ts` when service grows complex
- [ ] Add `mappers.ts` for Database ↔ DTO boundary enforcement (Pattern A future state)
- [ ] Wrap operations with `executeOperation` wrapper (when implemented)
- [ ] Implement service factory pattern in `index.ts`

---

## Pattern B: Canonical CRUD Services

**Use When**: Simple CRUD operations, minimal business logic
**Examples**: `services/player/`, `services/visit/`, `services/casino/`, `services/floor-layout/`
**SLAD Reference**: §429-471

### Directory Structure (Current Implementation)

**Status**: ✅ **DEPLOYED** - Minimal structure for simple CRUD

```
services/{domain}/
├── keys.ts       # React Query key factories (REQUIRED) ✅ 100% adoption
└── README.md     # Service documentation with SRM reference ✅ 100% adoption
```

**Key Characteristics**:
- **Extremely minimal**: Only 2 files per service
- **No separate DTO files**: DTOs documented in README or inline where needed
- **No business logic files**: Logic handled in React Query hooks or Server Actions
- **Focus**: React Query key management and documentation

**Example**: `services/player/` (Verified 2025-11-20)
```
services/player/
├── keys.ts     # ✅ playerKeys factory (EXISTS)
└── README.md   # ✅ References SRM §1007-1060 (EXISTS)
```

**Note**: Pattern B services have even fewer files than Pattern A because they lack complex business logic.

### DTO Pattern

**Pick/Omit from Database types**:

```typescript
// services/player/README.md documents this pattern (ACTUAL DOCS)
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at'
>;

export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Insert'],
  'first_name' | 'last_name' | 'birth_date'
>;
```

### React Query Keys Pattern

```typescript
// services/player/keys.ts (ACTUAL CODE)
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

### Checklist (Current Implementation)

**✅ Required (Must Do Today)**:
- [ ] Create `keys.ts` with React Query factory keys
- [ ] Add `README.md` with SRM reference
- [ ] Document DTOs in README (using Pick/Omit from `Database` types)
- [ ] Reference DTO_CANONICAL_STANDARD.md for derivation rules

**❌ BANNED for Pattern B**:
- Manual DTO interfaces (use Pick/Omit only)
- Separate `dtos.ts` files (keep minimal)
- Business logic files (handle in Server Actions/hooks)

---

## Pattern C: Hybrid Services

**Use When**: Mixed complexity (some domain logic, some CRUD)
**Examples**: `services/rating-slip/` (state machine + CRUD)
**SLAD Reference**: §472-517

### Directory Structure

Use **appropriate pattern per feature**:
- Contract-first DTOs for state machine logic
- Canonical DTOs for CRUD operations

**Example**: `services/rating-slip/`
```
services/rating-slip/
├── keys.ts
├── state-machine.ts        # Pattern A: Manual DTOs
├── state-machine.test.ts
└── README.md
```

---

## Shared Utilities

### React Query Key Serialization

**Location**: `services/shared/key-utils.ts`

```typescript
// services/shared/key-utils.ts (ACTUAL CODE)
export type KeyFilter = Record<string, KeyFilterValue>;

export function serializeKeyFilters<T extends KeyFilter>(
  filters?: T,
): string {
  if (!filters) return '[]';
  const entries = Object.entries(filters).filter(
    ([, value]) => value !== undefined,
  );
  entries.sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}
```

**All services** import this for filter serialization.

---

## Service Documentation (README.md)

**Every service MUST have a README.md** with:

### Required Sections

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

**See Actual Examples**:
- Pattern A: `services/loyalty/README.md`
- Pattern B: `services/player/README.md`

---

## Anti-Patterns (From SLAD §1200-1241)

### ❌ NEVER Do This

| Anti-Pattern | Why Banned | Correct Pattern |
|--------------|------------|-----------------|
| Manual `interface` for Pattern B services | Schema evolution blindness | Use `Pick<Database['public']['Tables']['x']['Row'], ...>` |
| Missing `keys.ts` | React Query won't work | ALL services need key factories |
| Cross-context Database type access | Violates bounded contexts | Use published DTOs only (see SLAD §559-603) |
| `ReturnType<typeof createService>` | Implicit, unstable types | Explicit `interface XService` |
| `supabase: any` | Type safety lost | `supabase: SupabaseClient<Database>` |
| No README.md | Service undocumented | Required with SRM reference |

---

## Implementation Workflow

### 1. Choose Pattern
Use decision tree above → Pattern A, B, or C

### 2. Create Directory
```bash
mkdir -p services/{domain}
cd services/{domain}
```

### 3. Create Keys File
```typescript
// services/{domain}/keys.ts
import { serializeKeyFilters } from '@/services/shared/key-utils';

const ROOT = ['{domain}'] as const;

export const {domain}Keys = {
  root: ROOT,
  // Add key factories based on your queries
};
```

### 4. Add Business Logic (Pattern A) or Skip (Pattern B)
```typescript
// services/{domain}/{feature}.ts (Pattern A only)
export interface {Feature}Input {
  // Domain contract
}

export async function {featureAction}(input: {Feature}Input) {
  // Business logic
}
```

### 5. Create README.md
```markdown
# {Service} - {Context}
> **SRM Reference**: [§X-Y](...)
> **Pattern**: A / B / C
```

### 6. Add Tests
```typescript
// services/{domain}/{feature}.test.ts
import { describe, it, expect } from 'vitest';
```

### 7. Update SRM
Add service to SERVICE_RESPONSIBILITY_MATRIX.md

---

## Testing

**See**: `docs/40-quality/QA-004-tdd-standard.md` (if exists)

### Unit Testing Pattern

```typescript
// services/{domain}/{feature}.test.ts
import { describe, it, expect } from 'vitest';

describe('{Service}.{feature}', () => {
  it('should handle happy path', async () => {
    // Test logic
  });

  it('should validate input', async () => {
    // Test validation
  });
});
```

---

## Cross-References

### Architecture
- **PRIMARY**: [SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md](../20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md) (SLAD v2.1.2)
- **Bounded Contexts**: [SERVICE_RESPONSIBILITY_MATRIX.md](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md) (SRM v3.1.0)
- **DTO Standards**: [DTO_CANONICAL_STANDARD.md](../25-api-data/DTO_CANONICAL_STANDARD.md) (v2.1.0)

### Patterns
- **DTO Patterns**: SLAD §345-517
- **React Query Patterns**: SLAD §1032-1112
- **Cross-Context Consumption**: SLAD §559-603
- **Anti-Patterns**: SLAD §1200-1241

### Governance
- **ADR-008**: Service layer architecture decisions
- **Edge Transport**: [EDGE_TRANSPORT_POLICY.md](../20-architecture/EDGE_TRANSPORT_POLICY.md)

---

## Actual Service Examples (Reference Implementations)

| Service | Pattern | Files | Purpose |
|---------|---------|-------|---------|
| `services/loyalty/` | A (Contract-First) | keys.ts, mid-session-reward.ts, README.md | Complex reward logic |
| `services/player/` | B (Canonical CRUD) | keys.ts, README.md | Simple identity CRUD |
| `services/rating-slip/` | C (Hybrid) | keys.ts, state-machine.ts, README.md | Mixed complexity |
| `services/finance/` | A (Contract-First) | keys.ts, README.md | Financial transactions |

**Before implementing**: Read the README.md of a similar service for patterns.

---

## Change Log

### v2.0.3 (2025-11-20) - Reality Alignment Audit + executeOperation Clarification
- ✅ **REALITY CHECK**: Documented actual vs. planned patterns (audit findings 2025-11-20)
- ✅ Added "Planned Enhancements" section with 0% adoption status for SLAD architecture
- ✅ Updated Pattern A directory structure to reflect current implementation (inline DTOs/mappers)
- ✅ Updated Pattern B/C directory structures (verified against codebase)
- ✅ Clarified mappers.ts as **PLANNED** (not REQUIRED) - 0% adoption as of 2025-11-20
- ✅ **executeOperation Clarification**: Distinguished function patterns from file structure
  - Separated "Error Handling Infrastructure" section in status table
  - Clarified executeOperation is a **service-layer wrapper function** (not a file)
  - Distinguished from withServerAction (edge layer vs. service layer)
  - Added ServiceResult<T> type to status table (deployed infrastructure)
  - Documented that withServerAction() is deployed, executeOperation() is planned
  - Clarified role: service-layer wrapper that would return ServiceResult<T> envelopes
- ✅ Added Implementation Status Overview table showing deployed vs. planned components
  - Added **(file)**, **(type)**, **(fn)** markers to distinguish component types
  - Separated file structure from wrapper functions
  - Added "Planning Stage" note - no full service layer implementation exists yet
- ✅ Updated checklists with "Required Today" vs. "Planned Future" sections
- ✅ Added verified file structure examples with ✅ EXISTS markers
- ✅ Documented inline DTO/mapper pattern as current standard
- ✅ Explained rationale for simple architecture (early-stage services)
- ✅ Preserved SLAD aspirational architecture for future reference
- ⚠️ **Impact**: Template now accurately reflects 100% of actual codebase patterns
- 📊 **Audit Report**: See `docs/audits/SERVICE_TEMPLATE_AUDIT_2025-11-20.md`

**Rationale**: Previous versions (v2.0.0-v2.0.2) described SLAD §308-348 architecture as "Actual Implementation" when 70% of described files had 0% adoption. This update separates "Current Implementation" (what exists today) from "Planned Enhancements" (SLAD aspirational architecture). The executeOperation ambiguity (function vs. file) was clarified to distinguish service-layer patterns from edge-layer infrastructure. This is a **planning/documentation stage** - no full service layer exists yet; patterns reflect planned architecture.

### v2.0.2 (2025-11-19) - SLAD v2.1.2 Alignment
- ✅ **CLARIFICATION**: mappers.ts marked as **REQUIRED** for Pattern A services (line 54)
- ✅ Updated SLAD version references: v2.1.1 → v2.1.2
- ✅ Added rationale for mappers.ts requirement (schema evolution independence)
- ✅ Updated Pattern A checklist to emphasize mappers.ts is REQUIRED
- ✅ Resolves SERVICE_LAYER_DOCUMENTATION_REGRESSION_MATRIX FINDING #4

**Rationale**: SLAD §298 and SRM v3.1.0:141-154 document mappers.ts as REQUIRED (not optional) for Pattern A services. The previous "(if needed)" language contradicted the canonical architecture. Pattern A services MUST enforce the Database ↔ DTO boundary via mappers to maintain schema evolution independence.

### v2.0.1 (2025-11-18) - executeOperation Pattern Restoration
- ✅ **CORRECTION**: Re-added executeOperation pattern (SLAD §918-975)
- ✅ Added Error Handling Pattern section with complete example
- ✅ Restored alignment with SLAD canonical architecture
- ✅ Clarified that pattern is planned (not yet implemented in services)
- ✅ Updated checklist to include executeOperation wrapper requirement

**Rationale**: The v2.0.0 removal of executeOperation was premature. While no PT-2 services currently implement this pattern, SLAD §918-975 documents it as the canonical error handling approach, and ANTI_PATTERN_CATALOG.md does not list it as banned. The absence from current code reflects early implementation stage, not architectural deprecation.

### v2.0.0 (2025-11-18) - SLAD Alignment Rewrite
- ✅ **BREAKING**: Complete rewrite aligned with SLAD v2.1.1
- ✅ Removed outdated directory structure (dto.ts, selects.ts, crud.ts, business.ts)
- ✅ Documented actual implementation patterns from current codebase
- ✅ Added React Query keys.ts pattern (missing in v1.2)
- ✅ Added service README.md requirement (missing in v1.2)
- ✅ Removed hypothetical code examples that don't match actual implementation
- ✅ Fixed Pattern A/B/C alignment with SLAD
- ✅ Added cross-references to SLAD sections instead of duplicating content
- ⚠️ Removed executeOperation wrapper (CORRECTED in v2.0.1 - see above)
  1- ✅ Removed Zod schema patterns (not found in dto.ts files)
- ✅ Documented actual file structure from services/loyalty/, services/player/
- ✅ Eradicated contradictions with SLAD §305-341, §559-603, §1200-1241

### v1.2 (2024) - DEPRECATED
- Outdated directory structure
- Hypothetical code patterns not matching actual implementation
- Missing React Query keys pattern
- Contradictions with SLAD established patterns

---

**End of Guide**

For complete architecture details, patterns, and diagrams, see [SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md](../20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md) (SLAD v2.1.2).

# PT-2 Service Implementation Guide

**Version**: 2.0.1
**Date**: 2025-11-18
**Status**: CANONICAL (Aligned with SLAD v2.1.1)
**Supersedes**: v2.0.0 (executeOperation pattern restored)

> **Architecture Reference**: [SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md](../20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md) (SLAD v2.1.1)
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

## Pattern A: Contract-First Services

**Use When**: Complex business logic, domain contracts, cross-context boundaries
**Examples**: `services/loyalty/`, `services/finance/`, `services/mtl/`, `services/table-context/`
**SLAD Reference**: §362-424

### Directory Structure (Actual Implementation)

```
services/{domain}/
├── keys.ts              # React Query key factories (REQUIRED)
├── {feature}.ts         # Business logic / RPC wrappers
├── {feature}.test.ts    # Unit/integration tests
├── mappers.ts           # Database ↔ DTO transformations (if needed)
└── README.md            # Service documentation with SRM reference
```

**Example**: `services/loyalty/`
```
services/loyalty/
├── keys.ts                      # loyaltyKeys factory
├── mid-session-reward.ts        # Business logic with DTOs
├── mid-session-reward.test.ts   # Tests
└── README.md                    # References SRM §1061-1274
```

### DTO Pattern

**Manual interfaces** for domain contracts:

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

**Pattern**: Wrap service operations with `executeOperation` for consistent ServiceResult<T> returns.

**Reference**: SLAD §918-975 (Operation Wrapper Pattern)

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

### Checklist

- [ ] Create `keys.ts` with React Query factory keys
- [ ] Define domain DTOs in `{feature}.ts`
- [ ] Wrap operations with `executeOperation` (returns ServiceResult<T>)
- [ ] Add `README.md` with SRM reference
- [ ] Write tests for business logic
- [ ] Add `mappers.ts` if Database ↔ DTO transformation is complex

---

## Pattern B: Canonical CRUD Services

**Use When**: Simple CRUD operations, minimal business logic
**Examples**: `services/player/`, `services/visit/`, `services/casino/`, `services/floor-layout/`
**SLAD Reference**: §429-471

### Directory Structure (Actual Implementation)

```
services/{domain}/
├── keys.ts       # React Query key factories (REQUIRED)
└── README.md     # Service documentation with SRM reference
```

**Example**: `services/player/`
```
services/player/
├── keys.ts     # playerKeys factory
└── README.md   # References SRM §1007-1060
```

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

### Checklist

- [ ] Create `keys.ts` with React Query factory keys
- [ ] DTOs use Pick/Omit from `Database` types (no manual interfaces)
- [ ] Add `README.md` with SRM reference
- [ ] Reference DTO_CANONICAL_STANDARD.md for derivation rules

**❌ BANNED for Pattern B**: Manual DTO interfaces (use Pick/Omit only)

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
- **PRIMARY**: [SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md](../20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md) (SLAD v2.1.1)
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

For complete architecture details, patterns, and diagrams, see [SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md](../20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md).

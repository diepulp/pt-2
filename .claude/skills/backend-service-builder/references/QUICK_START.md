# Backend Service Builder - Quick Start

**Purpose**: Single entry point for implementing PT-2 backend services.
**Read this first**, then reference other docs only as needed.

---

## Step 1: Determine Your Pattern

```
┌─ Complex business logic with domain contracts?
│  (Loyalty points, Financial transactions, Compliance workflows)
│  └─> Pattern A: Contract-First
│      Files: keys.ts, {feature}.ts, {feature}.test.ts, README.md
│      DTOs: Manual interfaces inline (mappers enforce boundary)
│      Examples: loyalty/, finance/, mtl/, table-context/
│
├─ Simple CRUD over database tables?
│  (Player identity, Visit sessions, Casino config)
│  └─> Pattern B: Canonical CRUD
│      Files: keys.ts, README.md
│      DTOs: Pick/Omit from Database types (in README)
│      Examples: player/, visit/, casino/, floor-layout/
│
└─ Mixed complexity?
   (Some domain logic + some CRUD)
   └─> Pattern C: Hybrid
       Files: Mix of above as appropriate
       Example: rating-slip/
```

---

## Step 2: Check Table Ownership

Before implementing, verify which tables your service owns (see `bounded-contexts.md`):

| Service | Owned Tables |
|---------|--------------|
| casino | casino, casino_settings, company, staff, game_settings, audit_log, report |
| player | player, player_casino |
| visit | visit |
| loyalty | player_loyalty, loyalty_ledger, loyalty_outbox |
| rating-slip | rating_slip |
| finance | player_financial_transaction, finance_outbox |
| mtl | mtl_entry, mtl_audit_note |
| table-context | gaming_table, gaming_table_settings, dealer_rotation, table_inventory_snapshot, table_fill, table_credit, table_drop_event |
| floor-layout | floor_layout, floor_layout_version, floor_pit, floor_table_slot, floor_layout_activation |

**Rule**: Services can only directly access tables they own. Cross-context data requires DTO imports.

---

## Step 3: Create Service Files

### All Patterns: keys.ts (REQUIRED)

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
    { scope: [...ROOT, 'list'] as const },
  ),
  detail: (id: string) => [...ROOT, 'detail', id] as const,
};
```

### All Patterns: README.md (REQUIRED)

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

### Pattern A Only: {feature}.ts

```typescript
// services/{domain}/{feature}.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// Inline DTO (extract to dtos.ts when service matures)
export interface {Feature}Input {
  casinoId: string;
  // ... domain contract fields
}

// Inline mapper
export function build{Feature}RpcInput(input: {Feature}Input) {
  return {
    p_casino_id: input.casinoId,
    // ... map to RPC parameters
  };
}

// Business logic - THROWS on error (ADR-012)
export async function {featureAction}(
  supabase: SupabaseClient<Database>,
  input: {Feature}Input
): Promise<{Feature}DTO> {  // Returns success data; throws DomainError on failure
  const { data, error } = await supabase.rpc('rpc_{feature}', build{Feature}RpcInput(input));

  if (error) {
    throw mapDatabaseError(error);  // Maps to DomainError
  }

  return mapTo{Feature}DTO(data);  // Use mapper, NEVER `data as DTO`
}
```

---

## Step 4: Write Tests (Pattern A Required)

**Reference**: `docs/40-quality/QA-001-service-testing-strategy.md`, `docs/40-quality/QA-004-tdd-standard.md`

**TDD Workflow** (QA-004):
1. **RED**: Write failing test with typed Supabase double
2. **GREEN**: Implement minimal service logic
3. **REFACTOR**: Extract error mapping, add domain errors

**Coverage Targets** (QA-001):
- Service CRUD: 90%
- Service workflows: 85%
- DTO mappers: 100%

```typescript
// services/{domain}/{feature}.test.ts
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

function makeClientDouble(): SupabaseClient<Database> {
  return {
    from: (table: string) => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: 'p1', /* ... */ }, error: null })
        }),
      }),
    }),
  } as SupabaseClient<Database>;
}

describe('{Domain}.{feature}', () => {
  it('returns success envelope with data', async () => {
    const svc = create{Domain}Service(makeClientDouble());
    const result = await svc.create({ /* input */ });
    expect(result.success).toBe(true);
  });

  it('maps PGRST116 to NOT_FOUND', async () => {
    // Error mapping test (QA-004 Pattern 1)
  });
});
```

---

## Step 5: Validate

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Run tests
npm test services/{domain}/

# Check coverage (should meet targets)
npm run test:coverage
```

---

## Quick Reference: DTO Rules

**Pattern B (CRUD)**: MUST use Pick/Omit
```typescript
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at'
>;
```

**Pattern A (Contract-First)**: Manual interfaces ALLOWED
```typescript
export interface PlayerLoyaltyDTO {
  player_id: string;
  casino_id: string;
  balance: number;
  tier: string | null;
}
```

See `dto-rules.md` for full details.

---

## Anti-Patterns (NEVER DO)

| Anti-Pattern | Correct Pattern | See |
|--------------|-----------------|-----|
| `interface` for Pattern B DTOs | Use `type` + Pick/Omit | dto-rules.md |
| Missing `keys.ts` | ALL services need key factories | - |
| Cross-context `Database['...']['other_table']` | Import DTO from owning service | bounded-contexts.md |
| `ReturnType<typeof createService>` | Explicit `interface XService` | - |
| `supabase: any` | `supabase: SupabaseClient<Database>` | - |
| `data as RatingSlipDTO` | Use mapper with RPC return types | dto-rules.md §RPC |
| Duplicate `ServiceResult<T>` definition | Import from `lib/http/service-response.ts` | service-patterns.md |
| `headers.get('x-casino-id')` | Derive from authenticated user's staff record | security-patterns.md |
| Service returns `ServiceResult<T>` | Service throws `DomainError` | service-patterns.md §ADR-012 |

---

## Need More Detail?

| Topic | Reference |
|-------|-----------|
| Pattern implementation details | `service-patterns.md` |
| Shared types + error handling (ADR-012) | `service-patterns.md` §Shared Types, §Layered Error Handling |
| Security / context derivation | `security-patterns.md` |
| Table ownership matrix | `bounded-contexts.md` |
| DTO derivation + RPC types | `dto-rules.md` |
| Pre-merge checklist | `validation-checklist.md` |
| Database migrations | `migration-workflow.md` |
| Testing strategy (coverage, layers) | `docs/40-quality/QA-001-service-testing-strategy.md` |
| TDD workflow (Red-Green-Refactor) | `docs/40-quality/QA-004-tdd-standard.md` |
| Domain error codes | `lib/errors/domain-errors.ts` |
| ADR-012 (Error Handling Layers) | `docs/80-adrs/ADR-012-error-handling-layers.md` |

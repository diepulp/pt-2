# Architecture Rules

**Source**: SLAD v2.1.2, SRM v3.1.0, BALANCED_ARCHITECTURE_QUICK.md, ADR-013

This document provides condensed patterns and anti-patterns. For the full workflow, see `QUICK_START.md`.

---

## Core Principles

1. **Types from SOT**: All types derive from `types/database.types.ts`.
2. **Bounded Contexts**: Services should access tables they own. Cross-context communication uses DTOs.
3. **KISS/YAGNI**: Keep solutions implementable by a small team.
4. **Documentation as Product**: Update all affected docs atomically.

---

## Pattern Selection

### Pattern A: Contract-First
**When**: Complex business logic, domain contracts, cross-service consumption

```typescript
// Explicit DTOs and mappers
export interface LoyaltyRewardDTO {
  id: string;
  player_id: string;
  points_earned: number;
  tier: 'bronze' | 'silver' | 'gold';
}

function mapRowToDTO(row: LoyaltyRow): LoyaltyRewardDTO {
  return { ... };
}
```

### Pattern B: Canonical CRUD
**When**: Simple CRUD, single service consumption

```typescript
// Pick/Omit from database types
type PlayerRow = Database['public']['Tables']['player']['Row'];
type PlayerCreate = Pick<PlayerRow, 'name' | 'email'>;
```

### Pattern C: Hybrid
**When**: Start simple, evolve when needed

```
Start with Pattern B -> Extract DTOs when service consumed by 2+ others
```

---

## Service Structure (Deployed)

### Pattern B Services (Canonical CRUD)
**Services**: casino, player, visit, floor-layout

```
services/{domain}/
├── dtos.ts              # ✅ REQUIRED - Pick/Omit from Database types
├── schemas.ts           # ✅ REQUIRED (HTTP boundary) - Zod validation (ADR-013)
├── selects.ts           # ✅ REQUIRED - Named column sets
├── keys.ts              # ✅ REQUIRED - React Query key factories
├── http.ts              # ✅ REQUIRED - HTTP fetchers for client-side
├── index.ts             # ✅ REQUIRED - Service factory (functional)
├── crud.ts              # ✅ REQUIRED - CRUD operations
├── {feature}.test.ts    # Unit/integration tests
├── schemas.test.ts      # ✅ Tests for validation schemas
└── README.md            # Service documentation
```

### Pattern A Services (Contract-First)
**Services**: loyalty, finance, mtl

```
services/{domain}/
├── dtos.ts              # ✅ REQUIRED when consumed by 2+ services
├── schemas.ts           # ✅ REQUIRED (HTTP boundary) - Zod validation (ADR-013)
├── mappers.ts           # ✅ REQUIRED - Row → DTO transformations
├── keys.ts              # ✅ REQUIRED - React Query key factories
├── http.ts              # HTTP fetchers for client-side
├── index.ts             # Service factory (functional)
├── {feature}.ts         # Business logic
├── {feature}.test.ts    # Unit/integration tests
├── schemas.test.ts      # ✅ Tests for validation schemas
└── README.md            # Service documentation
```

**Pattern A Note**: Manual `interface` DTOs are ALLOWED but MUST have `mappers.ts` to enforce compile-time safety. Mappers prevent schema evolution blindness.

### Pattern C Services (Hybrid)
**Services**: rating-slip (when rebuilt), table-context (when rebuilt)

> Pattern C services were removed during cleanup. When rebuilt per PRD-002/PRD-006, use the Pattern C structure from `dto-compliance.md`.

**Current Reality (2025-12-03)**:
- CasinoService: Full structure with all 6 required files ✅
- PlayerService, VisitService: dtos.ts ✅, missing selects.ts/crud.ts (gap)
- RatingSlipService, TableContextService: REMOVED (rebuild when needed per PRD-002/PRD-006)
- LoyaltyService, MTLService: Pattern A - need mappers.ts when implementing

---

## RLS Pattern

```sql
-- Standard user-scoped RLS
CREATE POLICY "users_own_data" ON table_name
  USING (auth.uid() = user_id);

-- Staff-scoped (casino context)
CREATE POLICY "staff_casino_data" ON table_name
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
        AND staff.casino_id = table_name.casino_id
    )
  );
```

---

## Anti-Patterns (Avoid)

### Service Layer Anti-Patterns

| Anti-Pattern | Preferred Approach |
|--------------|-----------------|
| `export class XService` | `export function createXService()` |
| `ReturnType<typeof createXService>` | Explicit interface |
| `supabase: any` | `supabase: SupabaseClient<Database>` |
| Global singletons | Dependency injection |
| `as any` casting | Proper type narrowing |

### DTO Anti-Patterns (CRITICAL - See DTO_CANONICAL_STANDARD.md)

| Anti-Pattern | Why Banned | Correct Pattern |
|--------------|------------|-----------------|
| **Manual `interface` for Pattern B** | Schema evolution blindness - migration adds column, interface unchanged, data silently dropped | `type PlayerDTO = Pick<Database['...']['Row'], 'id' \| 'name'>` |
| **Raw Row type alias** | Exposes all columns including internal fields | Use `Pick<>` for explicit field selection |
| **Missing `dtos.ts` file (Pattern B)** | CI/CD gate failure, no curated public API | Every Pattern B service MUST have `dtos.ts` |
| **`as` casting RPC responses** | Bypasses type validation, silent runtime errors | Use mappers with generated `Database['...']['Functions']['rpc']['Returns']` |
| **Cross-context `Database['...']['Tables']['foreign_table']`** | Violates bounded context integrity | Import published DTO from owning service |
| **Inline DTOs when service consumed by 2+ others** | No contract for consumers to depend on | Extract to `dtos.ts` for cross-context publishing |

### CI/CD Gate Requirements

```bash
# Every Pattern B service MUST have dtos.ts
for service in casino player visit floor-layout; do
  [[ -f "services/$service/dtos.ts" ]] || exit 1
done
```

**Reference**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md` v2.1.0

### Zod Schema Anti-Patterns (ADR-013)

| Anti-Pattern | Why Banned | Correct Pattern |
|--------------|------------|-----------------|
| **Missing `schemas.ts` for HTTP service** | No runtime validation at transport layer | Create `schemas.ts` for HTTP boundary services |
| **Inline Zod schemas in route handlers** | No reuse, no centralized testing | Extract to `services/{domain}/schemas.ts` |
| **Schemas importing from `dtos.ts`** | Couples transport validation to service contracts | Keep schemas independent |
| **Using schemas in service layer** | Schemas are transport-layer only | Services operate on DTOs/domain types |
| **`DTO` suffix for schema type exports** | Confusion with DTO types | Use `Input`/`Query` suffix: `CreatePlayerInput` |

**Reference**: `docs/80-adrs/ADR-013-zod-validation-schemas.md`

---

## Validation Requirements

### Pre-Architecture
- [ ] Check SRM for affected services
- [ ] Verify schema matches `types/database.types.ts`
- [ ] Review relevant ADRs for context
- [ ] Check `DTO_CANONICAL_STANDARD.md` for pattern requirements

### Post-Architecture
- [ ] Update SRM with new/changed services
- [ ] Create ADR for significant decisions
- [ ] Update API contracts if routes change
- [ ] Schema migration follows `YYYYMMDDHHMMSS_description.sql`
- [ ] Run `npm run db:types` after migrations

### DTO Compliance (MANDATORY)
- [ ] Pattern B services have `dtos.ts` with Pick/Omit types
- [ ] Pattern B services have `schemas.ts` with Zod validation
- [ ] No manual `interface` declarations for Pattern B DTOs
- [ ] No `as` casting on RPC responses (use mappers + type guards)
- [ ] Cross-context consumption uses published DTOs, not direct table access
- [ ] DTOs extracted to `dtos.ts` when service consumed by 2+ others

---

## ADR Format

```markdown
# ADR-XXX: [Decision Title]

**Status:** Proposed | Accepted | Superseded
**Date:** YYYY-MM-DD

## Context
[Why this decision is needed]

## Decision
[What we're choosing]

## Consequences
[Tradeoffs and implications]

## Alternatives Considered
[Other options and why rejected]
```

---

## Full References

- **Database Types (SOT)**: `types/database.types.ts`
- **SLAD (patterns)**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- **SRM (boundaries)**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **SDLC Taxonomy**: `docs/SDLC_DOCS_TAXONOMY.md`
- **DTO_CANONICAL_STANDARD**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md` (v2.1.0 - MANDATORY)
- **ADR-013 Zod Schemas**: `docs/80-adrs/ADR-013-zod-validation-schemas.md` (MANDATORY for HTTP services)
- **DTO_CATALOG**: `docs/25-api-data/DTO_CATALOG.md`
- **Anti-Pattern Catalog**: `docs/70-governance/ANTI_PATTERN_CATALOG.md`
- **Over-Engineering Guardrail**: `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`

# Architecture Rules

**Source**: SLAD v2.1.2, SRM v3.1.0, SERVICE_TEMPLATE v2.0.3, BALANCED_ARCHITECTURE_QUICK.md

This document provides condensed patterns and anti-patterns. For the full workflow, see `QUICK_START.md`.

---

## Core Principles

1. **Types from SOT**: All types derive from `types/database.types.ts`.
2. **Bounded Contexts**: Services should access tables they own. Cross-context communication uses DTOs.
3. **KISS/YAGNI**: Keep solutions implementable by a small team.
4. **Documentation as Product**: Update all affected docs atomically.
5. **Reality-First**: Check SERVICE_TEMPLATE for deployed vs. planned patterns.

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

```
services/{domain}/
+-- keys.ts              # React Query key factories (recommended)
+-- {feature}.ts         # Business logic with inline DTOs
+-- {feature}.test.ts    # Unit/integration tests
+-- README.md            # Service documentation (recommended)
```

**Note**: Current implementation uses inline DTOs. Separate `dtos.ts` and `mappers.ts` files are aspirational (0% adoption).

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

| Anti-Pattern | Preferred Approach |
|--------------|-----------------|
| `export class XService` | `export function createXService()` |
| `ReturnType<typeof createXService>` | Explicit interface |
| `supabase: any` | `supabase: SupabaseClient<Database>` |
| Global singletons | Dependency injection |
| `as any` casting | Proper type narrowing |

---

## Validation Requirements

### Pre-Architecture
- [ ] Check SRM for affected services
- [ ] Verify schema matches `types/database.types.ts`
- [ ] Review relevant ADRs for context

### Post-Architecture
- [ ] Update SRM with new/changed services
- [ ] Create ADR for significant decisions
- [ ] Update API contracts if routes change
- [ ] Schema migration follows `YYYYMMDDHHMMSS_description.sql`
- [ ] Run `npm run db:types` after migrations

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
- **SERVICE_TEMPLATE (reality)**: `docs/70-governance/SERVICE_TEMPLATE.md`
- **SDLC Taxonomy**: `docs/SDLC_DOCS_TAXONOMY.md`

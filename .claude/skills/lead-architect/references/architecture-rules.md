# Architecture Rules

**Source**: SLAD v3.2.0, SRM v4.10.0, BALANCED_ARCHITECTURE_QUICK.md, ADR-013, ADR-023, ADR-028
**Stack**: **Next.js 15** (App Router) + React 19 + Supabase + TypeScript

This document provides condensed patterns and anti-patterns. For the full workflow, see `QUICK_START.md`.

---

## Multi-Tenancy Model (ADR-023)

**Official Stance: Pool Primary; Silo Escape Hatch**

| Model | Status | Description |
|-------|--------|-------------|
| **Pool** | Primary/Default | Single Supabase project per env. Shared schema, isolation via `casino_id` + RLS (Pattern C) + RPC governance |
| **Silo** | Optional | Dedicated Supabase project per casino. Same schema/codebase, for jurisdictional/audit requirements |
| **Bridge** | Deferred | Schema-per-tenant not selected |

**Non-Negotiable Guardrails:**

1. **Casino-scoped ownership** — Every tenant-owned row carries `casino_id`; cross-casino joins forbidden
2. **Hybrid RLS mandatory** — Policies use session context + JWT fallback (Pattern C per ADR-015); **write-path on critical tables requires session vars only** (ADR-030)
3. **SECURITY DEFINER governance** — RPCs must validate `p_casino_id` against context (ADR-018)
4. **Append-only ledgers** — Finance/loyalty/compliance: no deletes, idempotency enforced (ADR-021)
5. **Context single source of truth** — `ctx.rlsContext` from `set_rls_context_from_staff()` return value only; no independent derivation (ADR-030)
6. **Bypass lockdown** — `DEV_AUTH_BYPASS` requires `NODE_ENV=development` + `ENABLE_DEV_AUTH=true`; `skipAuth` banned in production source (ADR-030)

**References:**
- `docs/80-adrs/ADR-023-multi-tenancy-storage-model-selection.md`
- `docs/30-security/SEC-002-casino-scoped-security-model.md`
- `docs/50-ops/OPS-002-silo-provisioning-playbook.md`

---

## Core Principles

1. **Types from SOT**: All types derive from `types/database.types.ts`.
2. **Bounded Contexts**: Services should access tables they own. Cross-context communication uses DTOs.
3. **Casino-scoped tenancy**: All tenant-owned data must include `casino_id` (ADR-023).
4. **KISS/YAGNI**: Keep solutions implementable by a small team.
5. **Documentation as Product**: Update all affected docs atomically.
6. **Next.js 16 Patterns**: Use App Router, async params, stable cache APIs.

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
**Services**: loyalty, finance (✅ IMPLEMENTED v4.3.0), mtl

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

```
services/{domain}/
├── dtos.ts              # ✅ REQUIRED - Type aliases + Pick/Omit types
├── labels.ts            # ✅ REQUIRED (ADR-028) - UI label/color constants
├── schemas.ts           # ✅ REQUIRED (HTTP boundary) - Zod validation
├── mappers.ts           # ✅ REQUIRED if cross-context consumption
├── keys.ts              # ✅ REQUIRED - React Query key factories
└── ...
```

**ADR-028 Note (TableContextService)**: Must include `labels.ts` with:
- `TableAvailability` type alias for `gaming_table.status`
- `SessionPhase` type alias for `table_session.status`
- `TABLE_AVAILABILITY_LABELS`, `SESSION_PHASE_COLORS` constant maps

**Current Reality (2026-01-17)**:
- CasinoService: Full structure with all required files ✅
- PlayerService, VisitService: dtos.ts ✅, missing selects.ts/crud.ts (gap)
- PlayerFinancialService: Full Pattern A implementation ✅ (v4.3.0)
- RatingSlipService, TableContextService: REMOVED (rebuild when needed per PRD-002/PRD-006)
- LoyaltyService, MTLService: Pattern A - need mappers.ts when implementing

---

## RLS Pattern

**Canonical Reference:** `docs/20-architecture/AUTH_RLS_EXTERNAL_REFERENCE_OVERVIEW.md` - External validation from AWS, Supabase, Crunchy Data. **Consult this when ambiguity arises** about RLS patterns.

**Strategy:** ADR-020 - Track A (hybrid) for MVP, Track B (JWT-only) gated on prerequisites.

```sql
-- PT-2 canonical pattern (Pattern C - Hybrid, ADR-015 compliant)
CREATE POLICY "staff_casino_data" ON table_name
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**ADR-030 Write-Path Tightening:** INSERT/UPDATE/DELETE on critical tables (`staff`, `player`, `player_financial_transaction`, `visit`, `rating_slip`, `loyalty_ledger`) use session vars only — no COALESCE JWT fallback. See SEC-001 Template 2b.

For detailed RLS implementation, use the `rls-expert` skill.

---

## Next.js 16 Architecture Patterns

### Dynamic Route Params (Breaking Change)

```typescript
// BEFORE (Next.js 15) - NO LONGER WORKS
export default function Page({ params }: { params: { id: string } }) {
  const { id } = params  // ❌ Direct access fails
}

// AFTER (Next.js 16) - REQUIRED PATTERN
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params  // ✅ Must await
}
```

### Cache Revalidation APIs (Stable)

| API | Usage | Behavior |
|-----|-------|----------|
| `cacheTag('tag')` | Tag cached data | Stable (no `unstable_` prefix) |
| `revalidateTag(tag, 'max')` | Server Action/Route Handler | Stale-while-revalidate |
| `updateTag(tag)` | Server Action only | Immediate expiration |
| `revalidatePath(path)` | Server Action/Route Handler | Path-based invalidation |

```typescript
import { cacheTag, revalidateTag, updateTag } from 'next/cache'

// Tag cached data in Server Component
export async function getPlayers() {
  'use cache'
  cacheTag('players')
  return await db.query('SELECT * FROM players')
}

// Revalidate in Server Action (stale-while-revalidate)
export async function createPlayer(formData: FormData) {
  'use server'
  await db.insert(/* ... */)
  revalidateTag('players', 'max')  // Recommended
}

// Immediate invalidation (shopping cart scenario)
export async function updateCart(itemId: string) {
  'use server'
  await db.update(/* ... */)
  updateTag('cart')  // Immediate
}
```

### React 19 Form Patterns

```typescript
'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

function Form() {
  // React 19: Returns [state, formAction, pending]
  const [state, formAction, isPending] = useActionState(createAction, null)

  return (
    <form action={formAction}>
      <input name="field" />
      <button disabled={isPending}>{isPending ? 'Saving...' : 'Save'}</button>
      {state?.error && <p>{state.error}</p>}
    </form>
  )
}
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

### Next.js 16 Anti-Patterns

| Anti-Pattern | Why Banned | Correct Pattern |
|--------------|------------|-----------------|
| `params.id` without await | Breaking change in Next.js 16 | `const { id } = await params` |
| `revalidateTag(tag)` alone | Missing stale-while-revalidate | `revalidateTag(tag, 'max')` |
| `unstable_cacheTag` | Deprecated | `cacheTag` (stable) |
| `[state, formAction]` destructure | Missing pending | `[state, formAction, pending]` |
| Pages Router patterns | Deprecated for new code | App Router only |

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
- **SLAD (patterns)**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` (v3.2.0)
- **SRM (boundaries)**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v4.10.0)
- **SDLC Taxonomy**: `docs/patterns/SDLC_DOCS_TAXONOMY.md`
- **DTO_CANONICAL_STANDARD**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md` (v2.1.0 - MANDATORY)
- **ADR-013 Zod Schemas**: `docs/80-adrs/ADR-013-zod-validation-schemas.md` (MANDATORY for HTTP services)
- **ADR-028 Table Status**: `docs/80-adrs/ADR-028-table-status-standardization.md` (labels.ts pattern)
- **DTO_CATALOG**: `docs/25-api-data/DTO_CATALOG.md`
- **Anti-Pattern Catalog**: `docs/70-governance/anti-patterns/INDEX.md` (modular: 01-service-layer, 02-security, 06-architecture)
- **Over-Engineering Guardrail**: `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`
- **Frontend Standard**: `docs/70-governance/FRONT_END_CANONICAL_STANDARD.md`
- **RLS External Validation**: `docs/20-architecture/AUTH_RLS_EXTERNAL_REFERENCE_OVERVIEW.md` (AWS, Supabase, Crunchy Data patterns)
- **ADR-020 RLS Strategy**: `docs/80-adrs/ADR-020-rls-track-a-mvp-strategy.md` (Track A for MVP)
- **ADR-023 Multi-Tenancy**: `docs/80-adrs/ADR-023-multi-tenancy-storage-model-selection.md` (Pool primary, Silo escape hatch)
- **ADR-030 Auth Hardening**: `docs/80-adrs/ADR-030-auth-system-hardening.md` (TOCTOU elimination, claims lifecycle, bypass lockdown, write-path enforcement)
- **SEC-002 Security Model**: `docs/30-security/SEC-002-casino-scoped-security-model.md` (Casino-scoped boundaries)
- **OPS-002 Silo Playbook**: `docs/50-ops/OPS-002-silo-provisioning-playbook.md` (Silo deployment operations)

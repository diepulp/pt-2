# Governance Validation Checklist

**Purpose**: Detect and rectify documentation inconsistencies before/after architectural changes.

---

## Pre-Architecture Validation

### 1. SRM Check
**Location**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`

- [ ] Identify all services/bounded contexts affected
- [ ] Verify SRM entries accurately reflect implementation
- [ ] Check for orphaned services (documented but not implemented)
- [ ] Check for undocumented services (implemented but not in SRM)
- [ ] Validate dependencies match actual call patterns

### 2. Schema Consistency
**Location**: `types/database.types.ts` + `supabase/migrations/`

- [ ] Verify types reflect latest migrations
- [ ] Migration names follow `YYYYMMDDHHMMSS_description.sql`
- [ ] RLS policies exist for user-facing tables
- [ ] Foreign keys match documented data model

**Quick Check**:
```bash
npm run db:types
git diff types/database.types.ts  # Should show no changes if in sync
```

### 2b. SRM Schema Invariant Cross-Validation (CRITICAL)
**Location**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` → Schema Invariants tables

Before proposing any column ADD/DROP/MODIFY:

- [ ] Re-read SRM "Schema Invariants" table for affected service
- [ ] Verify proposed change doesn't violate NOT NULL constraints
- [ ] Verify proposed change doesn't violate "immutable" column designations
- [ ] Cross-check `types/database.types.ts` to confirm current reality
- [ ] If removing column, verify no cross-context DTO contracts reference it
- [ ] If adding column, determine if it should be added to Schema Invariants table

**Key Tables to Check**:
| Service | Critical Invariants |
|---------|---------------------|
| RatingSlipService | `visit_id` NOT NULL, `table_id` NOT NULL, no `player_id` column |
| VisitService | `player_id` nullable only for ghost visits, CHECK constraint |
| LoyaltyService | `idempotency_key` UNIQUE (partial), `points_earned` NOT NULL |
| FinanceService | `gaming_day` trigger-derived (callers MUST omit) |

**Red Flags**:
- Proposing to DROP a NOT NULL column without SRM amendment
- Removing columns that are marked "immutable" in SRM
- Breaking cross-context DTO contracts (check SRM "Cross-Context Consumption" tables)
- Adding columns without updating SRM invariants

**Schema Decision Protocol**:
1. State: "Re-reading SRM Schema Invariants for [service_name]"
2. Quote the relevant invariants from SRM
3. Verify proposed change is compatible
4. If conflict exists, escalate—PRD cannot override SRM without explicit SRM amendment

### 3. ADR Consistency
**Location**: `docs/80-adrs/`

- [ ] Read all ADRs related to affected domain
- [ ] Check for contradicting decisions
- [ ] Verify superseded ADRs are marked
- [ ] Current implementation matches active ADRs

### 4. Anti-Pattern Check
- [ ] No class-based services
- [ ] No `ReturnType` inference
- [ ] No global singletons
- [ ] No `as any` casting

### 5. DTO Compliance Check (CRITICAL)
**Reference**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md` v2.1.0

#### Pattern B Services (casino, player, visit, floor-layout)
- [ ] Has dedicated `dtos.ts` file
- [ ] Has dedicated `selects.ts` file
- [ ] Has dedicated `keys.ts` file
- [ ] Has dedicated `crud.ts` file
- [ ] All DTOs use `Pick<Database['...']['Row/Insert'], ...>` pattern
- [ ] NO manual `interface` declarations for DTOs
- [ ] Response DTOs explicitly list allowed fields (no raw Row exports)

#### Pattern A Services (loyalty, finance, mtl)
- [ ] If consumed by 2+ services, DTOs extracted to `dtos.ts`
- [ ] Cross-context DTOs published for consumers
- [ ] Manual interfaces allowed but MUST have `mappers.ts` with typed input

#### Pattern C Services (table-context, rating-slip - when rebuilt)
> Note: These services were REMOVED during cleanup. When rebuilt per PRD-002/PRD-006:
- [ ] DTOs extracted to `dtos.ts` with cross-context contracts
- [ ] Has `mappers.ts` if cross-context consumption needed
- [ ] Follows pattern from `dto-compliance.md` Pattern C section

#### RPC Type Safety
- [ ] NO `as` casting on RPC responses
- [ ] Mappers use `Database['...']['Functions']['rpc_*']['Returns']` type
- [ ] Type guards exist for complex RPC return shapes
- [ ] Run `npm run db:types` after creating/modifying RPCs

#### Cross-Context Integrity
- [ ] Service does NOT access `Database['...']['Tables']['foreign_table']` directly
- [ ] Cross-context data consumed via imported DTOs from owning service

**Quick Check**:
```bash
# Find manual interface violations in Pattern B services
grep -r "export interface.*DTO" services/player/ services/visit/ services/casino/

# Find direct cross-context table access
grep -r "Tables\[" services/ | grep -v "# own table"
```

### 6. Next.js 16 Compliance Check (CRITICAL)
**Reference**: `docs/70-governance/FRONT_END_CANONICAL_STANDARD.md`, Context7 Next.js 16 docs

#### Dynamic Route Params
- [ ] All pages/layouts with dynamic segments use `params: Promise<{ ... }>`
- [ ] All `params` access uses `await params` (not direct destructuring)
- [ ] Layout components that use params are `async` functions

**Quick Check**:
```bash
# Find pages that may need updating (manual review required)
grep -r "params\s*:" app/ --include="*.tsx" | grep -v "Promise"
```

#### Cache Revalidation
- [ ] Server Actions use `revalidateTag(tag, 'max')` (with profile)
- [ ] NOT using deprecated `revalidateTag(tag)` alone
- [ ] `updateTag(tag)` used only in Server Actions (not Route Handlers)
- [ ] Cached data uses `cacheTag()` (stable API, not `unstable_cacheTag`)

#### React 19 Form Patterns
- [ ] `useActionState` destructures 3 values: `[state, formAction, pending]`
- [ ] NOT using old 2-tuple destructure `[state, formAction]`
- [ ] `useFormStatus` used only in child components of forms

**Red Flags**:
- `params.id` without `await` → Runtime error in Next.js 16
- `revalidateTag(tag)` without profile → Missing stale-while-revalidate
- `unstable_cacheTag` → Deprecated, use `cacheTag`
- Pages Router patterns in new code → Use App Router only

### 7. Zod Validation Schemas Check (ADR-013)
**Reference**: `docs/80-adrs/ADR-013-zod-validation-schemas.md`, SLAD §308-348

#### When schemas.ts REQUIRED
- [ ] Service exposes HTTP Route Handlers under `/api/v1/**`
- [ ] Request body validation needed
- [ ] Complex validation rules exist (cross-field, role constraints, regex)
- [ ] Query parameter coercion needed (pagination, date parsing)

**Note**: `schemas.ts` is **REQUIRED** for HTTP boundary services, not optional.

#### schemas.ts Compliance
- [ ] File located at `services/{domain}/schemas.ts`
- [ ] Type exports use `Input`/`Query` suffix (NOT `DTO`)
  - ✅ `CreateCasinoInput`, `CasinoListQuery`
  - ❌ `CreateCasinoDTO`, `CasinoListDTO`
- [ ] Each exported Zod schema has matching `type` alias via `z.infer<>`
- [ ] Schemas imported by Route Handlers (not service layer)
- [ ] Validation failures map to `VALIDATION_ERROR` envelope with `ZodError.flatten()`
- [ ] Complex business rules use `.refine()` with clear error messages
- [ ] Domain invariants still enforced in service layer (schemas are NOT sole enforcement)
- [ ] Tests exist at `services/{domain}/schemas.test.ts`

**Quick Check**:
```bash
# Find services with Route Handlers but no schemas.ts
for svc in casino player visit; do
  if ls app/api/v1/$svc/route.ts 2>/dev/null && ! ls services/$svc/schemas.ts 2>/dev/null; then
    echo "MISSING: services/$svc/schemas.ts"
  fi
done

# Verify naming convention (should NOT find *DTO exports in schemas.ts)
grep -r "export type.*DTO.*=" services/*/schemas.ts
```

### 7. Entity-Level RLS Coverage
**Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md`

When documenting RLS for a bounded context:

- [ ] List ALL entities in affected bounded context (e.g., `rating_slip`, `rating_slip_pause`)
- [ ] Verify each entity has RLS entry in SEC-001
- [ ] Verify each entity's RLS documented in DoD
- [ ] Check for dependent/child tables that may be missing RLS

**Common Omissions**:
- Pause/state tables (e.g., `rating_slip_pause`)
- Outbox tables (e.g., `loyalty_outbox`, `finance_outbox`)
- Audit/history tables

### 8. SRM Contract Sections Check
**Location**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` → "Contracts" subsections

When updating PRD for a service with SRM contract sections:

- [ ] Outbox contract referenced (if SRM "Contracts" section mentions outbox)
- [ ] CQRS read model referenced (if SRM mentions projections)
- [ ] RPC contracts referenced (e.g., `rpc_issue_mid_session_reward`)
- [ ] Trigger contracts noted (e.g., `gaming_day` trigger for Finance)
- [ ] `policy_snapshot` or similar audit columns included in migration plans
- [ ] Event contracts noted (if service publishes domain events)

**SRM Contract Quick Reference**:
| Service | Key Contracts |
|---------|---------------|
| LoyaltyService | `rpc_issue_mid_session_reward`, `loyalty_outbox`, Visit Kind Filter |
| FinanceService | `rpc_create_financial_txn`, `trg_fin_gaming_day`, `finance_outbox` |
| FloorLayoutService | `floor_layout.activated` events |
| TableContextService | `assert_table_context_casino()` trigger |

---

## Post-Architecture Validation

### 9. Cross-Reference Updates
- [ ] List all docs affected by change
- [ ] Update all atomically (all or nothing)
- [ ] New docs follow conventions (folder, ID, front-matter)
- [ ] Timestamps/versions updated

### 6. Implementation-Doc Alignment
- [ ] Code structure matches documented architecture
- [ ] Service paths align with SRM ownership
- [ ] Type definitions match schema docs
- [ ] RLS policies match proposed implementation

---

## Red Flags (Stop & Escalate)

- Multiple contradictory ADRs (not marked superseded)
- Schema types out of sync with migrations
- SRM shows non-existent services
- Anti-patterns in affected domain
- RLS missing on user-facing tables

**Next.js 16 Violations (CRITICAL)**:
- Dynamic route pages using `params: { id: string }` instead of `Promise<{ id: string }>`
- `await params` missing in page/layout components
- `revalidateTag(tag)` without `'max'` profile
- Using `unstable_cacheTag` instead of `cacheTag`
- `useActionState` with 2-tuple destructure instead of 3-tuple

**SRM Invariant Violations (CRITICAL)**:
- Schema change that contradicts SRM invariants (must amend SRM first)
- Proposing to remove NOT NULL column without SRM amendment
- Modifying "immutable" columns without SRM amendment
- Missing SRM contract sections (Outbox, CQRS, policy_snapshot, triggers)
- Incomplete entity RLS coverage (e.g., `rating_slip` without `rating_slip_pause`)
- PRD overriding SRM without explicit SRM amendment request

**DTO Violations**:
- Pattern B service missing `dtos.ts` (CI gate will fail)
- Manual `interface` in Pattern B service (schema evolution blindness)
- `as` casting on RPC responses (type safety bypass)
- Direct `Database['...']['Tables']['foreign_table']` access (bounded context violation)
- Raw `Row` type exported without field filtering (internal field exposure)

---

## Remediation

### Option A: Rectify to Patterns
When current patterns are sufficient:
1. Identify canonical source (most recent ADR or pattern doc)
2. Update conflicting docs to align
3. Update implementation if drifted

### Option B: Propose Robust Solution
When patterns are insufficient:
1. Document the gap
2. Propose pattern enhancement
3. Create new ADR
4. Update all affected docs

---

## Doc Locations Reference

| Need | Location |
|------|----------|
| **Database types (SOT)** | `types/database.types.ts` |
| **DTO Standard (MANDATORY)** | `docs/25-api-data/DTO_CANONICAL_STANDARD.md` |
| **Zod Schemas Standard (ADR-013)** | `docs/80-adrs/ADR-013-zod-validation-schemas.md` |
| **Frontend Standard (Next.js 16)** | `docs/70-governance/FRONT_END_CANONICAL_STANDARD.md` |
| Service boundaries | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` |
| Patterns | `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` |
| ADRs | `docs/80-adrs/` |
| RLS/RBAC | `docs/30-security/` |
| API contracts | `docs/25-api-data/` |
| Anti-patterns | `docs/70-governance/ANTI_PATTERN_CATALOG.md` |
| Taxonomy (master index) | `docs/SDLC_DOCS_TAXONOMY.md` |
| Next.js 16 Docs | Context7 `/vercel/next.js/v16.0.3` |

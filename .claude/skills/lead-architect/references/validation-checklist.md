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

### 6. Zod Validation Schemas Check (ADR-013)
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

---

## Post-Architecture Validation

### 5. Cross-Reference Updates
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
- **DTO Violations**:
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
| Service boundaries | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` |
| Patterns | `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` |
| ADRs | `docs/80-adrs/` |
| RLS/RBAC | `docs/30-security/` |
| API contracts | `docs/25-api-data/` |
| Anti-patterns | `docs/70-governance/ANTI_PATTERN_CATALOG.md` |
| Taxonomy (master index) | `docs/SDLC_DOCS_TAXONOMY.md` |

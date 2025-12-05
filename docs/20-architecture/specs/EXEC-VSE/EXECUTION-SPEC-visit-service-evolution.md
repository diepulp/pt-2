# EXECUTION-SPEC: Visit Service Evolution

```yaml
# Machine-parseable workstream definitions
spec_id: EXEC-VSE-001
source: docs/00-vision/EXEC-SPEC-visit-service-evolution.md
sources:
  - docs/00-vision/visit_service_enhancement_plan_v2.md
  - docs/00-vision/ADR-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md
status: APPROVED
created: 2025-12-05

phases:
  - id: PHASE-1
    name: "Schema Foundation"
    type: sequential
    workstreams: [WS-1A, WS-1B, WS-1C]
    gate: GATE-1

  - id: PHASE-2
    name: "Rating Slip Hardening"
    type: sequential
    workstreams: [WS-1D]
    gate: GATE-2
    depends_on: [GATE-1]

  - id: PHASE-D
    name: "RatingSlipService Rebuild (Deferred - PRD-002)"
    type: deferred
    workstreams: []
    gate: null
    depends_on: [GATE-2]
    notes: "Full Pattern B rebuild explicitly out of scope here; tracked in PRD-002."

  - id: PHASE-3
    name: "VisitService Evolution"
    type: sequential
    workstreams: [WS-2, WS-3]
    gate: GATE-3
    depends_on: [GATE-2]

  - id: PHASE-4
    name: "RLS Policies"
    type: sequential
    workstreams: [WS-4]
    gate: GATE-4
    depends_on: [GATE-3]

  - id: PHASE-5
    name: "Documentation & Governance"
    type: sequential
    workstreams: [WS-5]
    gate: GATE-5
    depends_on: [GATE-4]

  - id: PHASE-6
    name: "Final Verification"
    type: sequential
    workstreams: [WS-FINAL]
    gate: GATE-FINAL
    depends_on: [GATE-5]

workstreams:
  - id: WS-1A
    name: "Migration: visit_kind enum"
    agent: backend-service-builder
    depends_on: []
    files:
      - supabase/migrations/YYYYMMDDHHMMSS_add_visit_kind_enum.sql
    validation:
      - "Migration applies without error"
      - "npm run db:types regenerates with visit_kind enum"

  - id: WS-1B
    name: "Migration: player_id nullable"
    agent: backend-service-builder
    depends_on: [WS-1A]
    files:
      - supabase/migrations/YYYYMMDDHHMMSS_visit_player_id_nullable.sql
    validation:
      - "CHECK constraint chk_visit_kind_player_presence created"
      - "FK constraint updated with SET NULL"

  - id: WS-1C
    name: "Migration: unique index updates"
    agent: backend-service-builder
    depends_on: [WS-1B]
    files:
      - supabase/migrations/YYYYMMDDHHMMSS_visit_unique_index_updates.sql
    validation:
      - "Old index dropped"
      - "New partial index created for identified visits"

  - id: WS-1D
    name: "Migration: rating_slip NOT NULL"
    agent: backend-service-builder
    depends_on: [GATE-1]
    files:
      - supabase/migrations/YYYYMMDDHHMMSS_rating_slip_not_null_constraints.sql
    validation:
      - "Pre-check query returns 0 nulls"
      - "visit_id and table_id are NOT NULL"
      - "RPCs writing rating_slip still compile"

  - id: WS-2
    name: "VisitService DTOs & Schemas"
    agent: pt2-service-implementer
    depends_on: [GATE-2]
    files:
      - services/visit/dtos.ts
      - services/visit/schemas.ts
    validation:
      - "VisitKind type exported"
      - "CreateGhostGamingVisitDTO defined"
      - "Zod schemas for new creation flows"

  - id: WS-3
    name: "VisitService CRUD & Interface"
    agent: pt2-service-implementer
    depends_on: [GATE-2, WS-2]
    files:
      - services/visit/selects.ts
      - services/visit/mappers.ts
      - services/visit/crud.ts
      - services/visit/index.ts
    validation:
      - "visit_kind in column projections"
      - "Three creation flows implemented"
      - "convertRewardToGaming works"
      - "startVisit defaults to gaming_identified_rated (backward compatible)"
      - "convertRewardToGaming emits audit logging"
      - "90% test coverage"

  - id: WS-4
    name: "RLS Policies for Ghost Visits"
    agent: backend-service-builder
    depends_on: [GATE-3]
    files:
      - supabase/migrations/YYYYMMDDHHMMSS_visit_ghost_rls_policies.sql
    validation:
      - "Ghost visits insertable by pit_boss/admin"
      - "Ghost visits visible to same-casino staff"

  - id: WS-5
    name: "Documentation & Governance"
    agent: lead-architect
    depends_on: [GATE-4]
    files:
      - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
      - docs/00-vision/ADR-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md
      - docs/80-adrs/ADR-XXX-ghost-gaming-visits.md
    validation:
      - "SRM updated for all affected services"
      - "ADR moved, renamed ADR-XXX-ghost-gaming-visits.md, status Accepted, date updated"

  - id: WS-FINAL
    name: "Final Verification"
    agent: lead-architect
    depends_on: [GATE-5]
    validation:
      - "npm run build passes"
      - "npm run test passes"
      - "All Definition of Done items checked"

gates:
  - id: GATE-1
    name: "Schema Foundation Complete"
    criteria:
      - "All Phase A migrations applied"
      - "npm run db:types shows visit_kind enum"
      - "Existing VisitService tests pass"
      - "Backfill successful (all existing = gaming_identified_rated)"

  - id: GATE-2
    name: "Rating Slip Hardened"
    criteria:
      - "Pre-check null counts = 0"
      - "Phase B migration applied (rating_slip hardened)"
      - "RPCs writing rating_slip still compile"

  - id: GATE-3
    name: "Service Layer Complete"
    criteria:
      - "All VisitServiceInterface methods implemented"
      - "createRewardVisit works"
      - "createGamingVisit works"
      - "createGhostGamingVisit works"
      - "convertRewardToGaming works"
      - "startVisit defaults to gaming_identified_rated (backward compatible)"
      - "convertRewardToGaming emits audit logging"
      - "90% test coverage on modified service"

  - id: GATE-4
    name: "RLS Policies Complete"
    criteria:
      - "Ghost visits insertable by authorized staff"
      - "Ghost visits visible to same-casino staff"
      - "Existing RLS for identified visits unchanged"

  - id: GATE-5
    name: "Documentation & Governance Updated"
    criteria:
      - "SRM updated for VisitService, RatingSlipService, LoyaltyService, FinanceService"
      - "ADR moved to docs/80-adrs/ADR-XXX-ghost-gaming-visits.md"
      - "ADR status Accepted with updated date"

  - id: GATE-FINAL
    name: "Definition of Done"
    criteria:
      - "npm run build passes"
      - "npm run test passes"
      - "No as any or console.* in production"
      - "Pattern B structure maintained"
      - "EXEC-SPEC status = Implemented"
```

---

## 1. Overview

This EXECUTION-SPEC provides machine-parseable workstream definitions for implementing the Visit Service Evolution plan with explicit, sequential gates and scope guards.

**Source Document:** `docs/00-vision/EXEC-SPEC-visit-service-evolution.md`

**Explicit Constraint (scope guard):** MVP must NOT perform ghost→identified reassignment of existing visits at the DB or service layer. Any comps for ghost play remain manual operations referencing the ghost visit ID.

### Sources
- `docs/00-vision/visit_service_enhancement_plan_v2.md`
- `docs/00-vision/ADR-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md`

### Executive Summary (archetypes + architectural correction)

| `visit_kind` | Identity | Gaming | Loyalty | Use Case |
|-------------|----------|--------|---------|----------|
| `reward_identified` | Player exists | No | Redemptions only | Comps, vouchers, customer care |
| `gaming_identified_rated` | Player exists | Yes | Accrual eligible | Standard rated play |
| `gaming_ghost_unrated` | No player | Yes | Compliance only | Ghost gaming for finance/MTL |

- Architectural correction: all gaming slips require `visit_id`. Ghost gaming is represented by `visit_kind = 'gaming_ghost_unrated'` with `player_id = NULL`, not by `visit_id = NULL`.

### Scope Decisions

| Decision | Outcome | Rationale |
|----------|---------|-----------|
| Ghost→Identified Association | **DEFERRED** | Complex back-office flow; not MVP-critical |
| RatingSlipService Rebuild | **SEPARATE PRD-002** | This work = schema hardening only |
| Downstream Services | **SRM UPDATES ONLY** | LoyaltyService/FinanceService incomplete; document requirements only |

### Current State Analysis

- Visit table: `player_id` currently NOT NULL with FK cascade (must become nullable); no `visit_kind` column (must add); unique constraint `uq_visit_single_active_per_player_casino` assumes non-null player_id (must handle NULL).
- Rating slip table: `visit_id` nullable at DB (enforced at RPC; must be NOT NULL); `table_id` nullable at DB (must be NOT NULL).
- Service layer status:
  - VisitService: ✅ complete (Pattern B)
  - RatingSlipService: ❌ deleted (needs rebuild PRD-002)
  - LoyaltyService: 🔄 keys only (incomplete)
  - FinanceService: 🔄 keys only (incomplete)

### Approval Gate & Signatures

| Approver | Role | Status | Date |
|----------|------|--------|------|
| ___________ | Product Owner | ⏳ Pending | |
| ___________ | Tech Lead | ⏳ Pending | |

### Next Steps After Approval
1. Begin Phase 1 migrations (WS-1A → WS-1C).
2. Run `npm run db:types` after each migration.
3. Proceed through phases sequentially with gate verifications.
4. Update this document status to “Implementing” → “Complete” upon finish.

---

## 2. Dependency Graph

```
PHASE 1 (sequential)
  WS-1A -> WS-1B -> WS-1C -> GATE-1

PHASE 2 (sequential, depends on GATE-1)
  WS-1D -> GATE-2

PHASE 3 (sequential, depends on GATE-2)
  WS-2 -> WS-3 -> GATE-3

PHASE 4 (sequential, depends on GATE-3)
  WS-4 -> GATE-4

PHASE 5 (sequential, depends on GATE-4)
  WS-5 -> GATE-5

PHASE 6 (final verification, depends on GATE-5)
  WS-FINAL -> GATE-FINAL
```

---

## 3. Agent Assignments

| Workstream | Agent | Capabilities Used |
|------------|-------|-------------------|
| WS-1A, WS-1B, WS-1C, WS-1D | `backend-service-builder` | Migrations, schema patterns, constraints |
| WS-2 | `pt2-service-implementer` | DTOs, Zod schemas, type definitions |
| WS-3 | `pt2-service-implementer` | Service layer, CRUD, Pattern B |
| WS-4 | `backend-service-builder` | RLS policies, security patterns |
| WS-5 | `lead-architect` | SRM updates, ADR formalization |
| WS-FINAL | `lead-architect` | Validation, Definition of Done |

---

## 4. Workstream Details

### WS-1A: Migration - visit_kind enum

**Agent:** `backend-service-builder`

**Prompt:**
```
Create migration: supabase/migrations/YYYYMMDDHHMMSS_add_visit_kind_enum.sql

Requirements:
1. Create visit_kind enum with three values:
   - 'reward_identified'
   - 'gaming_identified_rated'
   - 'gaming_ghost_unrated'

2. Add visit_kind column to visit table (nullable initially)

3. Backfill all existing visits as 'gaming_identified_rated'

4. Make column NOT NULL after backfill

5. Include NOTIFY pgrst, 'reload schema';

Reference: docs/00-vision/EXEC-SPEC-visit-service-evolution.md section 4 Phase A
```

---

### WS-1B: Migration - player_id nullable

**Agent:** `backend-service-builder`

**Depends on:** WS-1A

**Prompt:**
```
Create migration: supabase/migrations/YYYYMMDDHHMMSS_visit_player_id_nullable.sql

Requirements:
1. Drop existing FK constraint visit_player_id_fkey

2. Make player_id nullable: ALTER TABLE visit ALTER COLUMN player_id DROP NOT NULL

3. Re-add FK with ON DELETE SET NULL

4. Add CHECK constraint chk_visit_kind_player_presence:
   - Ghost visits (gaming_ghost_unrated) MUST have NULL player_id
   - Non-ghost visits MUST have NOT NULL player_id

5. Include NOTIFY pgrst, 'reload schema';

Reference: docs/00-vision/EXEC-SPEC-visit-service-evolution.md section 4 Phase A Migration 2
```

---

### WS-1C: Migration - unique index updates

**Agent:** `backend-service-builder`

**Depends on:** WS-1B

**Prompt:**
```
Create migration: supabase/migrations/YYYYMMDDHHMMSS_visit_unique_index_updates.sql

Requirements:
1. Drop old unique index: uq_visit_single_active_per_player_casino

2. Create new partial unique index for identified visits only:
   CREATE UNIQUE INDEX uq_visit_single_active_identified
   ON visit (player_id, casino_id)
   WHERE ended_at IS NULL AND player_id IS NOT NULL;

3. Note: Ghost visits do not need player-level uniqueness

4. Include NOTIFY pgrst, 'reload schema';

Reference: docs/00-vision/EXEC-SPEC-visit-service-evolution.md section 4 Phase A Migration 3

Note: Optional future constraint on (casino_id, table_id, seat) for ghost visits remains deferred.
```

---

### WS-1D: Migration - rating_slip NOT NULL

**Agent:** `backend-service-builder`

**Depends on:** GATE-1

**Pre-check Required:**
```sql
SELECT 'visit_id nulls' AS check_type, COUNT(*) AS count FROM rating_slip WHERE visit_id IS NULL
UNION ALL
SELECT 'table_id nulls', COUNT(*) FROM rating_slip WHERE table_id IS NULL;
-- MUST return 0 for both before proceeding
```

**Prompt:**
```
Create migration: supabase/migrations/YYYYMMDDHHMMSS_rating_slip_not_null_constraints.sql

Requirements:
1. Verify pre-check query returns 0 nulls (fail if not)

2. Harden rating_slip:
   ALTER TABLE rating_slip ALTER COLUMN visit_id SET NOT NULL;
   ALTER TABLE rating_slip ALTER COLUMN table_id SET NOT NULL;

3. Include NOTIFY pgrst, 'reload schema';

Reference: docs/00-vision/EXEC-SPEC-visit-service-evolution.md section 4 Phase B
```

---

### WS-2: VisitService DTOs & Schemas

**Agent:** `pt2-service-implementer`

**Depends on:** GATE-2 (needs visit_kind in database.types.ts and rating_slip hardened)

**Prompt:**
```
Update VisitService type definitions in services/visit/

Files to modify:
1. services/visit/dtos.ts
2. services/visit/schemas.ts

Requirements for dtos.ts:
1. Add VisitKind type derived from database:
   type VisitKind = 'reward_identified' | 'gaming_identified_rated' | 'gaming_ghost_unrated';

2. Update VisitDTO to include visit_kind and make player_id nullable:
   interface VisitDTO {
     id: string;
     player_id: string | null;  // Now nullable for ghost visits
     casino_id: string;
     visit_kind: VisitKind;
     started_at: string;
     ended_at: string | null;
   }

3. Add CreateGhostGamingVisitDTO:
   interface CreateGhostGamingVisitDTO {
     table_id: string;
     notes?: string;
   }

Requirements for schemas.ts:
1. Add createRewardVisitSchema (player_id required)
2. Add createGamingVisitSchema (player_id required)
3. Add createGhostGamingVisitSchema (table_id required, notes optional)
4. Add convertRewardToGamingSchema (visitId required)

Reference: docs/00-vision/EXEC-SPEC-visit-service-evolution.md section 4 Phase C
Follow Pattern B: Canonical CRUD per SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md
```

---

### WS-3: VisitService CRUD & Interface

**Agent:** `pt2-service-implementer`

**Depends on:** GATE-2 and WS-2

**Prompt:**
```
Update VisitService CRUD operations and interface in services/visit/

Files to modify:
1. services/visit/selects.ts - Add visit_kind to projections
2. services/visit/mappers.ts - Update mappers for nullable player_id and visit_kind
3. services/visit/crud.ts - Add new creation/conversion functions
4. services/visit/index.ts - Export new interface methods

New Interface Methods to Implement:
1. createRewardVisit(playerId: string, casinoId: string): Promise<VisitDTO>
   - Creates visit with visit_kind = 'reward_identified'
   - Requires player_id

2. createGamingVisit(playerId: string, casinoId: string): Promise<VisitDTO>
   - Creates visit with visit_kind = 'gaming_identified_rated'
   - Same as current startVisit behavior

3. createGhostGamingVisit(casinoId: string, tableId: string, notes?: string): Promise<VisitDTO>
   - Creates visit with visit_kind = 'gaming_ghost_unrated'
   - player_id = NULL
   - Store tableId and notes in metadata or separate fields

4. convertRewardToGaming(visitId: string): Promise<VisitDTO>
   - Updates visit_kind from 'reward_identified' to 'gaming_identified_rated'
   - Only allowed on active visits
   - Include audit logging

Backward Compatibility:
- Existing startVisit should default to 'gaming_identified_rated'
- All existing tests must pass

Test Coverage: 90% minimum on modified files

Reference: docs/00-vision/EXEC-SPEC-visit-service-evolution.md section 4 Phase C

Note: RatingSlipService rebuild (full Pattern B) is explicitly deferred to PRD-002; this spec covers schema hardening only.
```

---

### WS-4: RLS Policies for Ghost Visits

**Agent:** `backend-service-builder`

**Depends on:** GATE-3

**Prompt:**
```
Create migration: supabase/migrations/YYYYMMDDHHMMSS_visit_ghost_rls_policies.sql

Requirements:
1. Verify existing RLS policies handle ghost visits:
   - visit_select_same_casino already uses casino_id scoping
   - visit_insert_staff already uses casino + role scoping
   - visit_update_staff already uses casino + role scoping

2. Ghost visits have player_id = NULL but are still scoped by casino_id

3. No changes needed if existing policies use casino_id (not player_id) for scoping; optional future compliance role policy may broaden MTL/CTR access if required.

4. Optional: Add compliance role policy for broader MTL/CTR access

5. Include NOTIFY pgrst, 'reload schema';

Validation:
- Ghost visits insertable by pit_boss/admin
- Ghost visits visible to same-casino staff
- Existing identified visit RLS unchanged

Reference: docs/00-vision/EXEC-SPEC-visit-service-evolution.md section 4 Phase E

Note: Ghost visits use casino_id scoping; player_id-null cases must not break existing RLS.
```

---

### WS-5: Documentation & Governance

**Agent:** `lead-architect`

**Depends on:** GATE-4 (finalized after RLS)

**Prompt:**
```
Update governance documentation for Visit Service Evolution:

Files to modify:
1. docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
2. docs/00-vision/ADR-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md -> docs/80-adrs/ADR-XXX-ghost-gaming-visits.md

SRM Updates Required:

1. VisitService Section - Add:
   - Ghost gaming visit support (visit_kind = 'gaming_ghost_unrated')
   - Three visit archetypes table
   - Conversion flows (reward→gaming)
   - player_id nullable for ghost visits

2. RatingSlipService Section - Add:
   - visit_kind validation requirement
   - Rated vs compliance-only telemetry distinction
   - visit_id NOT NULL requirement

3. LoyaltyService Section - Add:
   - visit_kind filtering for accrual (gaming_identified_rated only)
   - Ghost visit exclusion from automated accrual

4. FinanceService Section - Add:
   - Uniform visit anchoring across all visit_kinds
   - Ghost visits are first-class for CTR/cash movement

ADR Formalization:
- Move ADR-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md to docs/80-adrs/ADR-XXX-ghost-gaming-visits.md
- Update status from "Draft" to "Accepted"
- Update date to implementation date

Reference: docs/00-vision/EXEC-SPEC-visit-service-evolution.md section 4 Phase F
```

---

## 5. Execution Commands

### Phase 1: Sequential Migrations (Schema Foundation)

```bash
# WS-1A: Create and apply visit_kind enum migration
# Agent: backend-service-builder

# WS-1B: Create and apply player_id nullable migration
# Agent: backend-service-builder

# WS-1C: Create and apply unique index migration
# Agent: backend-service-builder

# GATE-1 Verification
npm run db:types
npm run test -- --testPathPattern="visit"
```

### Phase 2: Rating Slip Hardening

```bash
# WS-1D (rating_slip hardening)
# Agent: backend-service-builder

# GATE-2 Verification
# - Pre-check nulls = 0
# - Migration applied
# - RPCs writing rating_slip still compile
```

### Phase 3: VisitService Evolution

```bash
# WS-2: DTOs & Schemas
# Agent: pt2-service-implementer

# WS-3: CRUD & Interface
# Agent: pt2-service-implementer

# GATE-3 Verification
npm run test -- --coverage --testPathPattern="visit"
```

### Phase 4: RLS Policies

```bash
# WS-4: RLS Policies
# Agent: backend-service-builder
```

### Phase 5: Documentation & Governance

```bash
# WS-5: Documentation
# Agent: lead-architect
```

### Phase 6: Final Verification

```bash
npm run build
npm run test
npm run lint
```

---

## 6. Definition of Done Checklist

### Schema (Phases A-B)
- [ ] All 5 migrations applied successfully
- [ ] `npm run db:types` regenerates clean types with `visit_kind`
- [ ] CHECK constraint `chk_visit_kind_player_presence` enforces invariant
- [ ] `rating_slip.visit_id` and `rating_slip.table_id` are NOT NULL

### VisitService (Phase C)
- [ ] Three creation flows work: `createRewardVisit`, `createGamingVisit`, `createGhostGamingVisit`
- [ ] `convertRewardToGaming` works with audit logging
- [ ] `startVisit` backward-compatible (defaults to `gaming_identified_rated`)
- [ ] 90% test coverage on modified service

### RLS (Phase E)
- [ ] Ghost visits insertable by authorized staff
- [ ] Ghost visits visible to same-casino staff
- [ ] Existing RLS for identified visits unchanged

### Documentation (Phase F)
- [ ] SRM updated for VisitService, RatingSlipService, LoyaltyService, FinanceService
- [ ] ADR formalized in `docs/80-adrs/`
- [ ] This EXEC-SPEC marked as "Implemented"

### Code Quality
- [ ] No `as any` or `console.*` in production code
- [ ] Pattern B structure maintained

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking change to player_id FK | High | Phased migration with backfill before constraint |
| NULL visit_id in existing rating_slips | High | Pre-check query MUST return 0 before Phase 2 |
| RLS policies fail for ghost visits | Medium | Ghost visits use same casino_id scoping |
| Downstream services not ready | Low | SRM updates only; code deferred to later phases/PRD-002 |

# EXECUTION-SPEC: Visit Service Evolution

**Status:** APPROVED
**Date:** 2025-12-05
**Author:** Lead Architect
**Sources:**
- `docs/00-vision/visit_service_enhancement_plan_v2.md`
- `docs/00-vision/ADR-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md`

---

## 0. Approval Gate

> **ACTION REQUIRED:** Review this execution specification and approve before implementation begins.

| Approver | Role | Status | Date |
|----------|------|--------|------|
| ___________ | Product Owner | ⏳ Pending | |
| ___________ | Tech Lead | ⏳ Pending | |

---

## 1. Executive Summary

Implement the Visit Service Enhancement Plan v2 to support **three visit archetypes** for PT-2:

| `visit_kind` | Identity | Gaming | Loyalty | Use Case |
|-------------|----------|--------|---------|----------|
| `reward_identified` | Player exists | No | Redemptions only | Comps, vouchers, customer care |
| `gaming_identified_rated` | Player exists | Yes | Accrual eligible | Standard rated play |
| `gaming_ghost_unrated` | No player record exists | Yes | Compliance only | Ghost gaming for finance/MTL |

**Key Architectural Correction:** All gaming slips require `visit_id`. Ghost gaming is represented by `visit_kind = 'gaming_ghost_unrated'` with `player_id = NULL`, NOT by `visit_id = NULL`.

---

## 2. Scope Decisions

| Decision | Outcome | Rationale |
|----------|---------|-----------|
| Ghost→Identified Association | **DEFERRED** | Complex back-office flow; not MVP-critical |
| RatingSlipService Rebuild | **SEPARATE PRD-002** | This work = schema hardening only |
| Downstream Services | **SRM UPDATES ONLY** | LoyaltyService/FinanceService incomplete; document requirements only |

> **Explicit Constraint:** MVP must NOT perform ghost→identified reassignment of existing visits at the DB or service layer. Any comps for ghost play are handled as manual loyalty operations referencing the original ghost visit ID.

---

## 3. Current State Analysis

### Visit Table (Current)
- `player_id`: **NOT NULL** with FK cascade → Must become NULLABLE
- No `visit_kind` column → Must add
- Unique constraint `uq_visit_single_active_per_player_casino` on `(player_id, casino_id)` → Must handle NULL player_id

### Rating Slip Table (Current)
- `visit_id`: NULLABLE at DB (enforced at RPC) → Must be NOT NULL
- `table_id`: NULLABLE at DB (enforced at RPC) → Must be NOT NULL

### Service Layer Status
| Service | Current Status | Pattern |
|---------|----------------|---------|
| VisitService | ✅ Complete | Pattern B |
| RatingSlipService | ❌ DELETED | Needs rebuild (PRD-002) |
| LoyaltyService | 🔄 Keys only | Incomplete |
| FinanceService | 🔄 Keys only | Incomplete |

---

## 4. Implementation Phases

### PHASE A: Schema Foundation (BLOCKING)

**Migration 1: `YYYYMMDDHHMMSS_add_visit_kind_enum.sql`**
```sql
-- Create visit_kind enum with three supported archetypes
CREATE TYPE visit_kind AS ENUM (
  'reward_identified',
  'gaming_identified_rated',
  'gaming_ghost_unrated'
);

-- Add column (nullable initially for backfill)
ALTER TABLE visit ADD COLUMN visit_kind visit_kind;

-- Backfill all existing visits as standard rated gaming
UPDATE visit SET visit_kind = 'gaming_identified_rated' WHERE visit_kind IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE visit ALTER COLUMN visit_kind SET NOT NULL;

NOTIFY pgrst, 'reload schema';
```

**Migration 2: `YYYYMMDDHHMMSS_visit_player_id_nullable.sql`**
```sql
-- Drop existing FK constraint
ALTER TABLE visit DROP CONSTRAINT IF EXISTS visit_player_id_fkey;

-- Make player_id nullable
ALTER TABLE visit ALTER COLUMN player_id DROP NOT NULL;

-- Re-add FK with SET NULL on delete (allows NULL values)
ALTER TABLE visit ADD CONSTRAINT visit_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE SET NULL;

-- Add CHECK constraint: visit_kind ↔ player_id consistency
-- Ghost visits MUST have NULL player_id
-- Identified visits MUST have NOT NULL player_id
ALTER TABLE visit ADD CONSTRAINT chk_visit_kind_player_presence CHECK (
  (visit_kind = 'gaming_ghost_unrated' AND player_id IS NULL)
  OR (visit_kind <> 'gaming_ghost_unrated' AND player_id IS NOT NULL)
);

NOTIFY pgrst, 'reload schema';
```

**Migration 3: `YYYYMMDDHHMMSS_visit_unique_index_updates.sql`**
```sql
-- Drop old unique index (assumes player_id NOT NULL)
DROP INDEX IF EXISTS uq_visit_single_active_per_player_casino;

-- New unique index for identified visits only
-- Ensures one active visit per player per casino (for identified visits)
CREATE UNIQUE INDEX uq_visit_single_active_identified
  ON visit (player_id, casino_id)
  WHERE ended_at IS NULL AND player_id IS NOT NULL;

-- Note: Ghost visits (player_id IS NULL) do not need player-level uniqueness
-- Optional future: Add constraint on (casino_id, table_id, seat) for ghost visits

NOTIFY pgrst, 'reload schema';
```

**Gate A Verification:**
- [ ] `npm run db:types` regenerates with `visit_kind` enum
- [ ] Existing VisitService tests pass
- [ ] Backfill successful (all existing visits = `gaming_identified_rated`)

---

### PHASE B: Rating Slip Hardening (BLOCKING)

**Pre-check Query (MUST run before migration):**
```sql
-- Verify no NULL values exist before applying NOT NULL constraints
SELECT 'visit_id nulls' AS check_type, COUNT(*) AS count FROM rating_slip WHERE visit_id IS NULL
UNION ALL
SELECT 'table_id nulls', COUNT(*) FROM rating_slip WHERE table_id IS NULL;
```

**Migration 4: `YYYYMMDDHHMMSS_rating_slip_not_null_constraints.sql`**
```sql
-- Harden rating_slip: visit_id is required (no floating slips)
ALTER TABLE rating_slip ALTER COLUMN visit_id SET NOT NULL;

-- Harden rating_slip: table_id is required (PT-2 scope = table games only)
ALTER TABLE rating_slip ALTER COLUMN table_id SET NOT NULL;

NOTIFY pgrst, 'reload schema';
```

**Gate B Verification:**
- [ ] Pre-check query returns 0 for both checks
- [ ] Migration applies without error
- [ ] (If applicable) Any existing RPCs that write rating_slip still compile

---

### PHASE C: VisitService Evolution

**Files to Modify:**
| File | Changes |
|------|---------|
| `services/visit/selects.ts` | Add `visit_kind` to column projections |
| `services/visit/mappers.ts` | Update mappers to include `visit_kind` |
| `services/visit/dtos.ts` | Add `VisitKind` type, update DTOs |
| `services/visit/schemas.ts` | Add Zod schemas for new creation flows |
| `services/visit/crud.ts` | Add new creation/conversion functions |
| `services/visit/index.ts` | Export new interface methods |

**New VisitServiceInterface Methods:**
```typescript
interface VisitServiceInterface {
  // Existing methods (unchanged)
  list(filters?: VisitListFilters): Promise<{ items: VisitWithPlayerDTO[]; cursor: string | null }>;
  getById(visitId: string): Promise<VisitDTO | null>;
  getActiveForPlayer(playerId: string): Promise<ActiveVisitDTO>;
  startVisit(playerId: string, casinoId: string): Promise<VisitDTO>;
  closeVisit(visitId: string, input?: CloseVisitDTO): Promise<VisitDTO>;

  // NEW: Explicit creation flows by visit_kind
  createRewardVisit(playerId: string, casinoId: string): Promise<VisitDTO>;
  createGamingVisit(playerId: string, casinoId: string): Promise<VisitDTO>;
  createGhostGamingVisit(casinoId: string, tableId: string, notes?: string): Promise<VisitDTO>;

  // NEW: Conversion flow (reward→gaming only)
  convertRewardToGaming(visitId: string): Promise<VisitDTO>;

  // DEFERRED: associateGhostToPlayer (back-office, future phase)
}
```

> **Implementation Note:** All interface methods are defined here; individual flows may be wired incrementally across PRs, but all must exist with tests by the end of Phase C.

**New DTOs:**
```typescript
// Visit kind enum derived from database
type VisitKind = 'reward_identified' | 'gaming_identified_rated' | 'gaming_ghost_unrated';

// Updated VisitDTO includes visit_kind
interface VisitDTO {
  id: string;
  player_id: string | null;  // Now nullable for ghost visits
  casino_id: string;
  visit_kind: VisitKind;
  started_at: string;
  ended_at: string | null;
}

// Input for ghost gaming visit creation
interface CreateGhostGamingVisitDTO {
  table_id: string;
  notes?: string;
}
```

**Gate C Verification:**
- [ ] 90% test coverage on modified VisitService
- [ ] All three creation flows work correctly
- [ ] `convertRewardToGaming` works with audit logging
- [ ] `startVisit` defaults to `gaming_identified_rated` (backward compatible)

---

### PHASE D: RatingSlipService (DEFERRED TO PRD-002)

> **OUT OF SCOPE for this execution spec.**
>
> Full Pattern B rebuild is part of PRD-002 implementation.
> This work only applies schema hardening (Phase B).

**Future PRD-002 Requirements (documented for reference):**
1. Validate parent visit has gaming `visit_kind` before creating slip
2. Distinguish rated vs compliance-only telemetry based on `visit_kind`
3. Full Pattern B structure with 90% test coverage

---

### PHASE E: Ghost Visit RLS Policies

**Migration 5: `YYYYMMDDHHMMSS_visit_ghost_rls_policies.sql`**
```sql
-- Update existing RLS policies to handle ghost visits
-- Ghost visits have player_id = NULL but are still scoped by casino_id

-- No changes needed to visit_select_same_casino (already casino-scoped)
-- No changes needed to visit_insert_staff (already casino + role scoped)
-- No changes needed to visit_update_staff (already casino + role scoped)

-- Optional: Add compliance role for broader MTL/CTR access
-- CREATE POLICY visit_select_compliance ON visit
--   FOR SELECT USING (
--     current_setting('app.staff_role', true) = 'compliance'
--   );

NOTIFY pgrst, 'reload schema';
```

**Gate E Verification:**
- [ ] Ghost visits insertable by pit_boss/admin
- [ ] Ghost visits visible to same-casino staff
- [ ] RLS properly scopes access

---

### PHASE F: Documentation & Governance

**SRM Updates (docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md):**

1. **VisitService Section** - Add:
   - Ghost gaming visit support (visit_kind = 'gaming_ghost_unrated')
   - Three visit archetypes table
   - Conversion flows (reward→gaming)
   - player_id nullable for ghost visits

2. **RatingSlipService Section** - Add:
   - visit_kind validation requirement
   - Rated vs compliance-only telemetry distinction
   - visit_id NOT NULL requirement

3. **LoyaltyService Section** - Add:
   - visit_kind filtering for accrual (`gaming_identified_rated` only)
   - Ghost visit exclusion from automated accrual

4. **FinanceService Section** - Add:
   - Uniform visit anchoring across all visit_kinds
   - Ghost visits are first-class for CTR/cash movement

**ADR Formalization:**
- [ ] Move `docs/00-vision/ADR-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md` to `docs/80-adrs/ADR-XXX-ghost-gaming-visits.md`
- [ ] Update status from "Draft" to "Accepted"

---

## 5. File Manifest

### Migrations to Create
| File | Phase | Purpose |
|------|-------|---------|
| `supabase/migrations/YYYYMMDDHHMMSS_add_visit_kind_enum.sql` | A | Add visit_kind enum and column |
| `supabase/migrations/YYYYMMDDHHMMSS_visit_player_id_nullable.sql` | A | Make player_id nullable with CHECK |
| `supabase/migrations/YYYYMMDDHHMMSS_visit_unique_index_updates.sql` | A | Update unique index for ghost visits |
| `supabase/migrations/YYYYMMDDHHMMSS_rating_slip_not_null_constraints.sql` | B | Harden visit_id/table_id |
| `supabase/migrations/YYYYMMDDHHMMSS_visit_ghost_rls_policies.sql` | E | RLS for ghost visits |

### Service Files to Modify
| File | Phase | Changes |
|------|-------|---------|
| `services/visit/selects.ts` | C | Add visit_kind |
| `services/visit/mappers.ts` | C | Update mappers |
| `services/visit/dtos.ts` | C | Add VisitKind, update DTOs |
| `services/visit/schemas.ts` | C | New Zod schemas |
| `services/visit/crud.ts` | C | New creation/conversion functions |
| `services/visit/index.ts` | C | Export new interface |

### Governance Docs to Update
| File | Phase | Changes |
|------|-------|---------|
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | F | All affected services |
| `docs/80-adrs/ADR-XXX-ghost-gaming-visits.md` | F | Formalize ADR |

---

## 6. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking change to player_id FK | High | Phased migration with backfill before constraint |
| NULL visit_id in existing rating_slips | High | Pre-check query MUST return 0 before Phase B |
| RLS policies fail for ghost visits | Medium | Ghost visits use same casino_id scoping |
| Downstream services not ready | Low | SRM updates only; code deferred |

---

## 7. Definition of Done

**Schema (Phases A-B):**
- [ ] All 5 migrations applied successfully
- [ ] `npm run db:types` regenerates clean types with `visit_kind`
- [ ] CHECK constraint `chk_visit_kind_player_presence` enforces invariant
- [ ] `rating_slip.visit_id` and `rating_slip.table_id` are NOT NULL

**VisitService (Phase C):**
- [ ] Three creation flows work: `createRewardVisit`, `createGamingVisit`, `createGhostGamingVisit`
- [ ] `convertRewardToGaming` works with audit logging
- [ ] `startVisit` backward-compatible (defaults to `gaming_identified_rated`)
- [ ] 90% test coverage on modified service

**RLS (Phase E):**
- [ ] Ghost visits insertable by authorized staff
- [ ] Ghost visits visible to same-casino staff
- [ ] Existing RLS for identified visits unchanged

**Documentation (Phase F):**
- [ ] SRM updated for VisitService, RatingSlipService, LoyaltyService, FinanceService
- [ ] ADR formalized in `docs/80-adrs/`
- [ ] This EXEC-SPEC marked as "Implemented"

**Code Quality:**
- [ ] No `as any` or `console.*` in production code
- [ ] Pattern B structure maintained

---

## 8. Approval Signatures

By signing below, you approve this execution specification for implementation:

| Name | Role | Signature | Date |
|------|------|-----------|------|
| | Product Owner | | |
| | Tech Lead | | |

---

**Next Steps After Approval:**
1. Begin Phase A migrations
2. Run `npm run db:types` after each migration
3. Proceed through phases sequentially with gate verifications
4. Update this document status to "Implementing" → "Complete"

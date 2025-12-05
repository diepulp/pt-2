# Lead Architect Plan: Visit Service Enhancement & PRD Corrections

## Executive Summary

Enhance VisitService to support **three visit archetypes** per ADR-Ghost-Gaming-Visits, fix schema errors in `rating_slip.table_id`, and correct faulty assumptions in PRD-002.

**Reference ADR**: `docs/00-vision/ADR-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md`

---

## Three Conceptual Dimensions (Per ADR)

| Dimension | Values | Description |
|-----------|--------|-------------|
| **Identity Scope** | `identified` / `ghost` | Is patron tied to a `player` row? |
| **Engagement Mode** | `reward` / `gaming` | What is the visit used for? |
| **Loyalty Rating** | `rated` / `unrated` | Does telemetry drive loyalty accrual? |

---

## PT-2 Visit Archetypes (Supported)

| Archetype | Identity | Engagement | Rating | Use Case |
|-----------|----------|------------|--------|----------|
| **Reward-only (identified)** | identified | reward | n/a | Loyalty redemptions, comps, customer care |
| **Gaming (identified, rated)** | identified | gaming | rated | Standard rated play → Loyalty + Finance + MTL |
| **Ghost gaming (unrated)** | ghost | gaming | unrated | Compliance-only play → Finance + MTL (no loyalty) |

---

## User Decisions (Confirmed)

| Question | Decision |
|----------|----------|
| Default visit_type for existing visits | **`'rated'`** (backwards compatible) |
| Visit type mutability | **Mutable: `reward-only` → `gaming-rated`** when player starts gaming |
| Ghost → Identified conversion | **Manual, supervised back-office operation** (no auto-loyalty) |
| Downstream consumer for unrated | **LoyaltyService only** (rewards calculation concern) |

---

## Problem Statement

The current visit schema lacks the ability to distinguish between:

| Visit Type | Purpose | Gaming Action | Telemetry | Loyalty |
|------------|---------|---------------|-----------|---------|
| **Reward-only** | Loyalty redemption/service | No | None | Redeem existing points |
| **Gaming (rated)** | Player gaming session | Yes | Tracked via rating_slip | Accrues new points |
| **Ghost gaming** | Compliance-only play | Yes | Tracked for MTL/Finance | No loyalty accrual |

### Current Schema (Insufficient)
```sql
visit (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES player(id),  -- ❌ Cannot support ghost visits
  casino_id uuid NOT NULL REFERENCES casino(id),
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz  -- null = active
)
```

### Schema Errors Found
1. `visit.player_id` is NOT NULL but ghost visits have no player
2. `rating_slip.table_id` is nullable but business rule requires a table
3. PRD-002 has `closed_after_visit_end` flag based on faulty "checkout" assumption

---

## PlayerFinancialService Analysis (Per User Request)

**SRM Status**: PlayerFinancialService IS defined in SRM (line 653)

| Aspect | Details |
|--------|---------|
| **OWNS** | `player_financial_transaction` (append-only ledger) |
| **References** | Player (FK), Visit (FK - READ-ONLY), rating_slip (FK - compat), Casino (FK - temporal) |
| **Provides** | 3 aggregation views for reporting |
| **Consumers** | Visit consumes summaries (READ), MTL refs gaming-day aggregates |
| **Implementation Status** | **PARTIAL** per MVP-ROADMAP - keys.ts only, service pending |

**Conclusion**: PlayerFinancialService tracks monetary transactions (buy-ins, cash-outs), NOT reward redemptions. **LoyaltyService is the correct consumer** for unrated visits (reward redemption without gaming).

---

## Solution Design

### 1. Schema Migration: Evolve Visit for Three Archetypes

**File**: `supabase/migrations/YYYYMMDDHHMMSS_visit_archetypes.sql`

```sql
-- =============================================================
-- Visit Archetype Evolution (ADR: Ghost Gaming Visits)
-- =============================================================

-- 1. Create enums for the three dimensions
CREATE TYPE identity_scope AS ENUM ('identified', 'ghost');
CREATE TYPE engagement_mode AS ENUM ('reward', 'gaming');
CREATE TYPE loyalty_rating AS ENUM ('rated', 'unrated');

-- 2. Make player_id nullable (for ghost visits)
ALTER TABLE visit
ALTER COLUMN player_id DROP NOT NULL;

-- 3. Add archetype columns
ALTER TABLE visit
ADD COLUMN identity_scope identity_scope NOT NULL DEFAULT 'identified',
ADD COLUMN engagement_mode engagement_mode NOT NULL DEFAULT 'gaming',
ADD COLUMN loyalty_rating loyalty_rating NOT NULL DEFAULT 'rated';

-- 4. Add ghost visit metadata (optional free-form notes)
ALTER TABLE visit
ADD COLUMN ghost_notes text;

-- 5. Add constraint: identified visits MUST have player_id
ALTER TABLE visit
ADD CONSTRAINT chk_visit_identity_player CHECK (
  (identity_scope = 'identified' AND player_id IS NOT NULL) OR
  (identity_scope = 'ghost' AND player_id IS NULL)
);

-- 6. Add constraint: reward visits cannot have gaming rating
ALTER TABLE visit
ADD CONSTRAINT chk_visit_engagement_rating CHECK (
  (engagement_mode = 'reward' AND loyalty_rating = 'unrated') OR
  (engagement_mode = 'gaming')
);

-- 7. Add constraint: ghost visits are always unrated
ALTER TABLE visit
ADD CONSTRAINT chk_visit_ghost_unrated CHECK (
  (identity_scope = 'ghost' AND loyalty_rating = 'unrated') OR
  (identity_scope = 'identified')
);

-- 8. Indexes for common queries
CREATE INDEX idx_visit_identity_scope ON visit(identity_scope);
CREATE INDEX idx_visit_engagement_mode ON visit(engagement_mode);
CREATE INDEX idx_visit_loyalty_rating ON visit(loyalty_rating);

-- 9. Comments
COMMENT ON COLUMN visit.identity_scope IS
  'Whether patron is tied to a player record (identified) or anonymous (ghost)';
COMMENT ON COLUMN visit.engagement_mode IS
  'What the visit is for: reward (redemptions/service) or gaming (chips in action)';
COMMENT ON COLUMN visit.loyalty_rating IS
  'Whether telemetry drives loyalty accrual (rated) or compliance-only (unrated)';
COMMENT ON COLUMN visit.ghost_notes IS
  'Free-form notes for ghost visits (table, seat, physical description, etc.)';
```

### 2. Schema Migration: Fix `rating_slip.table_id` NOT NULL

**File**: `supabase/migrations/YYYYMMDDHHMMSS_rating_slip_table_id_not_null.sql`

```sql
-- Verify no null table_ids exist (should be empty)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM rating_slip WHERE table_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot add NOT NULL constraint: rating_slip rows with null table_id exist';
  END IF;
END $$;

-- Add NOT NULL constraint
ALTER TABLE rating_slip
ALTER COLUMN table_id SET NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN rating_slip.table_id IS
  'Gaming table where the rating slip is recorded. Required - slips cannot exist without a table.';
```

### 3. Update PRD-002: Remove faulty `closed_after_visit_end` flag

**File**: `docs/10-prd/PRD-002-rating-slip-service.md`

**Changes**:
- Remove `closed_after_visit_end` column from migration requirement
- Rewrite Q1 resolution with correct understanding:
  - Visit and RatingSlip have **independent lifecycles**
  - Both are controlled by pit boss (no "front-desk checkout")
  - Closing a slip does NOT depend on visit state
  - `visit_id` is nullable because slips can exist without visits (ghost gaming)

### 4. Update VisitService DTOs

**File**: `services/visit/dtos.ts`

```typescript
// New archetype types
export type IdentityScope = 'identified' | 'ghost';
export type EngagementMode = 'reward' | 'gaming';
export type LoyaltyRating = 'rated' | 'unrated';

// Updated VisitDTO with archetype fields
export type VisitDTO = Pick<
  VisitRow,
  'id' | 'player_id' | 'casino_id' | 'started_at' | 'ended_at' |
  'identity_scope' | 'engagement_mode' | 'loyalty_rating' | 'ghost_notes'
>;

// Creation DTOs for each archetype
export type CreateRewardVisitDTO = {
  player_id: string;  // Required for identified
};

export type CreateGamingVisitDTO = {
  player_id: string;  // Required for identified
};

export type CreateGhostGamingVisitDTO = {
  ghost_notes?: string;  // Optional metadata
};
```

### 5. Add Visit Creation & Conversion Logic

**New CRUD functions in** `services/visit/crud.ts`:

```typescript
// Create reward-only visit (identified)
export async function startRewardVisit(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string
): Promise<VisitDTO>;

// Create gaming visit (identified, rated)
export async function startGamingVisit(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string
): Promise<VisitDTO>;

// Create ghost gaming visit (compliance-only)
export async function startGhostGamingVisit(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  ghostNotes?: string
): Promise<VisitDTO>;

// Convert reward-only → gaming-rated (when player starts gaming)
export async function convertToGaming(
  supabase: SupabaseClient<Database>,
  visitId: string
): Promise<VisitDTO>;

// Associate ghost visit to player (back-office, supervised)
// Does NOT auto-grant loyalty - manual supervisor action required
export async function associateGhostToPlayer(
  supabase: SupabaseClient<Database>,
  visitId: string,
  playerId: string,
  supervisorId: string
): Promise<VisitDTO>;
```

### 6. Update SRM: Document Visit Archetypes

**File**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`

Add to VisitService section (per ADR §7.1):
- Three visit archetypes (reward-only, gaming-rated, ghost gaming)
- Identity/engagement/rating dimensions
- Conversion rules and constraints
- Ghost visit handling for compliance

Add to LoyaltyService section (per ADR §7.2):
- Loyalty eligibility rules (identified + gaming + rated only)
- Ghost visits visible for audit but no auto-accrual

---

## Implementation Workstreams

### WS1: Database Migrations (Blocking)
- [ ] Create migration for visit archetype enums and columns
- [ ] Make `player_id` nullable with check constraints
- [ ] Add `ghost_notes` column for ghost visit metadata
- [ ] Create migration for `rating_slip.table_id NOT NULL`
- [ ] Run `npm run db:types` to regenerate types
- [ ] Verify schema in `types/database.types.ts`

### WS2: VisitService Updates
- [ ] Update `dtos.ts` - add archetype types and creation DTOs
- [ ] Update `selects.ts` - add archetype columns to projections
- [ ] Update `mappers.ts` - handle archetype mapping
- [ ] Update `crud.ts`:
  - [ ] `startRewardVisit()` - reward-only identified
  - [ ] `startGamingVisit()` - gaming identified rated
  - [ ] `startGhostGamingVisit()` - ghost gaming unrated
  - [ ] `convertToGaming()` - reward-only → gaming-rated
  - [ ] `associateGhostToPlayer()` - back-office supervised
- [ ] Update `schemas.ts` - add archetype Zod validation
- [ ] Update `index.ts` - update service interface

### WS3: PRD-002 Corrections
- [ ] Remove `closed_after_visit_end` from Dependencies table
- [ ] Rewrite Q1 resolution (independent lifecycles)
- [ ] Remove DoD items related to `closed_after_visit_end`
- [ ] Update revision history

### WS4: Documentation Updates
- [ ] Update SRM VisitService section with archetypes (per ADR §7.1)
- [ ] Update SRM LoyaltyService section with eligibility rules (per ADR §7.2)
- [ ] Add visit archetype matrix to domain glossary
- [ ] Move ADR to `docs/80-adrs/` with proper ID

### WS5: Tests
- [ ] Add tests for reward-only visit creation
- [ ] Add tests for gaming-rated visit creation
- [ ] Add tests for ghost gaming visit creation
- [ ] Add tests for `convertToGaming()` conversion
- [ ] Add tests for `associateGhostToPlayer()` (supervisor audit)
- [ ] Verify rating_slip.table_id NOT NULL constraint
- [ ] Update existing visit tests for archetype fields

---

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `supabase/migrations/YYYYMMDDHHMMSS_visit_archetypes.sql` | CREATE | Add archetype enums, nullable player_id, constraints |
| `supabase/migrations/YYYYMMDDHHMMSS_rating_slip_table_id_not_null.sql` | CREATE | Fix table_id constraint |
| `services/visit/dtos.ts` | MODIFY | Add archetype types and creation DTOs |
| `services/visit/selects.ts` | MODIFY | Add archetype columns to selects |
| `services/visit/mappers.ts` | MODIFY | Handle archetype mapping |
| `services/visit/crud.ts` | MODIFY | Add archetype-specific creation and conversion functions |
| `services/visit/schemas.ts` | MODIFY | Add archetype Zod validation |
| `services/visit/index.ts` | MODIFY | Update interface with new functions |
| `docs/10-prd/PRD-002-rating-slip-service.md` | MODIFY | Remove faulty Q1 resolution |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | MODIFY | Document visit archetypes per ADR |
| `docs/80-adrs/ADR-XXX-ghost-gaming-visits.md` | CREATE | Move ADR to proper location with ID |

---

## Dependency Graph

```
WS1 (Migrations)
    ↓
WS2 (VisitService Updates) ← depends on WS1 (types regenerated)
    ↓
WS5 (Tests) ← depends on WS2

WS3 (PRD-002 Corrections) ← independent, can run in parallel
WS4 (Documentation) ← depends on WS1, WS3
```

---

## Validation Gates

- [ ] GATE-1: Migrations apply cleanly to local DB
- [ ] GATE-2: `npm run db:types` regenerates types without errors
- [ ] GATE-3: TypeScript compiles with no errors
- [ ] GATE-4: All visit service tests pass (including archetype tests)
- [ ] GATE-5: PRD-002 no longer references `closed_after_visit_end`
- [ ] GATE-6: Check constraints enforced (identified → player_id, ghost → unrated)
- [ ] GATE-7: SRM updated with visit archetype definitions per ADR

---

## Downstream Impact Analysis

### Services Affected by Visit Archetype Changes

| Service | Impact | Required Changes |
|---------|--------|------------------|
| **RatingSlipService** | Medium | Must check visit is `gaming` before attaching telemetry |
| **LoyaltyService** | High | Only accrue for `identified + gaming + rated` visits |
| **PlayerFinancialService** | Medium | Track cash for ALL gaming visits (including ghost) |
| **MTLService** | Medium | All gaming visits in scope regardless of identity |

### RLS Policy Updates Needed

Ghost visits have `player_id = NULL`, which affects RLS policies:
- Need new policies for ghost visit access (pit boss/supervisor only)
- Existing player-scoped policies won't match ghost visits

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing visit queries | Medium | High | Default values preserve backwards compatibility |
| Ghost visit abuse | Low | Medium | Supervisor audit trail, manual-only conversion |
| Loyalty leakage to ghost visits | Low | High | Database constraint + LoyaltyService eligibility check |
| Performance on archetype filters | Low | Low | Indexes on all three dimension columns |

---

## ADR Reference

**Source**: `docs/00-vision/ADR-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md`

**Key Principles** (from ADR):
1. VisitService tracks **all gaming sessions** regardless of player record
2. Loyalty is an opt-in layer on top of identified, rated visits
3. Ghost → Player association is **manual, supervised, no auto-loyalty**
4. Compliance (MTL, Finance) treats all gaming visits equally

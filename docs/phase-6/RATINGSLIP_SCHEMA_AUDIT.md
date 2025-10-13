# RatingSlip Schema Audit - Bounded Context Violations

**Date**: 2025-10-12
**Phase**: Phase 6 Wave 0 Prerequisites
**Status**: 🚨 Critical - Schema corrections required before implementation

---

## Executive Summary

The current RatingSlip schema (inherited from PT-1) contains **4 critical bounded context violations** that couple measurement/telemetry concerns with loyalty/reward concerns. These violations prevent proper implementation of the Phase 6 architecture where:

- **RatingSlipService** = Pure telemetry/measurement (what happened)
- **LoyaltyService** = Reward policy and point calculation (what it's worth)

**Impact**: Without schema corrections, we cannot achieve proper separation of concerns, mid-session rewards, or testable services.

---

## Violations Identified

### 🚨 Violation #1: `ratingslip.points` Column

**Location**: `supabase/migrations/20250828011313_init_corrected.sql:335`
**Migration**: `20250116093905_add_points_to_ratingslip`

```sql
-- AlterTable
ALTER TABLE "ratingslip" ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0;
```

**Problem**:
- Stores calculated loyalty points in telemetry table
- Implies RatingSlipService calculates points (wrong authority)
- Cannot distinguish between gameplay points, bonuses, promotions
- No audit trail for WHY points were assigned

**Architectural Violation**:
- **RatingSlip Domain**: "Player sat at Table 5, bet $50/hand, played for 2 hours" (telemetry)
- **Loyalty Domain**: "That session is worth 1,543 points based on our reward formula" (calculation)
- Mixing these domains in one table creates tight coupling

**Required Fix**: `DROP COLUMN points`

---

### 🚨 Violation #2: `accrual_history` Table

**Location**: `supabase/migrations/20250828011313_init_corrected.sql:1325-1349`
**Migration**: `20250808224233_add_lightweight_points_tracking`

```sql
CREATE TABLE "accrual_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" TEXT NOT NULL,           -- FK to ratingslip(id)
    "event_id" TEXT NOT NULL,
    "points" DECIMAL(10,2) NOT NULL,      -- Loyalty concern!
    "raw_theo" DECIMAL(10,2),             -- Loyalty calculation!
    "promo_applied" BOOLEAN NOT NULL DEFAULT false,
    "promo_details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "accrual_history_pkey" PRIMARY KEY ("id")
);

-- FK couples it directly to ratingslip
ALTER TABLE "accrual_history"
  ADD CONSTRAINT "accrual_history_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "ratingslip"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

**Problem**:
- Entire table is a **loyalty ledger**, not telemetry
- Stores point accruals, promotions, theoretical calculations (all loyalty concerns)
- Creates competing source of truth with `LoyaltyLedger` table
- Foreign key to `ratingslip` couples domains at database level

**Architectural Violation**:
This table is essentially a proto-loyalty-ledger that was created before proper bounded context separation. It should never have existed in the RatingSlip domain.

**Required Fix**: `DROP TABLE accrual_history CASCADE`

---

### 🚨 Violation #3: `close_player_session()` RPC Function

**Location**: `supabase/migrations/20250828011313_init_corrected.sql:574-631`
**Migration**: `20250130000000_add_close_player_session`

```sql
create or replace function close_player_session(
  p_rating_slip_id uuid,
  p_visit_id uuid,
  p_chips_taken numeric,
  p_end_time timestamp with time zone default now(),
  p_points numeric default 0                          -- ❌ Loyalty parameter!
)
returns json
language plpgsql
security definer
as $$
BEGIN
  -- Update rating slip (telemetry - correct)
  update ratingslip
  set
    status = 'CLOSED'::text,
    chips_taken = p_chips_taken,
    end_time = p_end_time,
    points = p_points,                                -- ❌ Assigns loyalty points!
    updated_at = now()
  where id = p_rating_slip_id and status = 'OPEN'::text;

  -- Update visit (correct)
  update visit
  set check_out_date = p_end_time, updated_at = now()
  where id = p_visit_id and check_out_date is null;

  return json_build_object(...);
END;
$$;
```

**Problem**:
- Single RPC mixes two domain operations in one transaction:
  1. ✅ Close rating slip (telemetry state transition)
  2. ❌ Assign loyalty points (reward calculation)
- Cannot test RatingSlip closure independently from point calculation
- Forces both domains to succeed/fail together (no partial operations)
- Prevents mid-session rewards (points only assigned at close)

**Architectural Violation**:
Database RPCs should be scoped to a single bounded context. This RPC violates single responsibility principle by handling both measurement finalization AND reward assignment.

**Required Fix**: Remove `p_points` parameter and `points` assignment logic

---

### 🚨 Violation #4: `LoyaltyLedger` Table Schema Insufficiency

**Location**: `supabase/migrations/20250828011313_init_corrected.sql:1831-1843`
**Migration**: `20250822075352_add_visit_modes_and_loyalty_ledger`

```sql
CREATE TABLE "LoyaltyLedger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "player_id" UUID NOT NULL,
    "visit_id" UUID,
    "points" INTEGER NOT NULL,                        -- Missing delta semantics
    "direction" "LedgerDirection" NOT NULL,           -- Should be signed points_change
    "description" TEXT NOT NULL,
    "transaction_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "balance_after" INTEGER NOT NULL,                 -- Denormalized calculation
    "metadata" JSONB DEFAULT '{}',
    CONSTRAINT "LoyaltyLedger_pkey" PRIMARY KEY ("id")
);
```

**Problem - Missing Columns for Phase 6 Requirements**:
- ❌ No `rating_slip_id` - Cannot link ledger entry to originating session
- ❌ No `session_id` - Cannot support mid-session + end-session linking
- ❌ No `transaction_type` - Cannot distinguish GAMEPLAY vs MANUAL_BONUS vs PROMOTION
- ❌ No `event_type` - No technical audit trail of triggers
- ❌ No `reason` - No human-readable explanation for manual rewards
- ❌ No `source` - Cannot distinguish system vs manual vs promotion sources

**Problem - Incompatible Column Design**:
- `points` + `direction` (CREDIT/DEBIT) → Should be signed `points_change` (delta)
- `balance_after` → Denormalized data; should be calculated via RPC, not stored

**Impact**:
- Cannot implement `manualReward()` for mid-session bonuses
- No idempotency protection (duplicate point assignments possible)
- Poor audit trail for compliance/debugging
- Cannot track which session generated which points

**Required Fix**: Replace with enhanced `loyalty_ledger` schema from PHASE_6_LOYALTY_PREREQUISITE.md

---

## Required Schema Changes

### Migration: `phase_6_wave_0_bounded_context_corrections.sql`

**Execution Order**: Wave 0 Prerequisites (BEFORE any service implementation)

```sql
-- =============================================================================
-- Phase 6 Wave 0: Bounded Context Corrections
-- Purpose: Remove RatingSlip/Loyalty coupling inherited from PT-1
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Create Enhanced Loyalty Ledger (New Schema)
-- -----------------------------------------------------------------------------

CREATE TABLE loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player(id),
  rating_slip_id UUID REFERENCES ratingslip(id),     -- Link to originating session
  visit_id UUID REFERENCES visit(id),
  session_id UUID,                                    -- Generic session identifier
  points_change INTEGER NOT NULL,                     -- Delta (positive or negative)
  transaction_type TEXT NOT NULL,                     -- 'GAMEPLAY', 'MANUAL_BONUS', 'PROMOTION', 'REDEMPTION'
  event_type TEXT,                                    -- 'RATINGS_SLIP_COMPLETED', 'POINTS_UPDATE_REQUESTED'
  reason TEXT,                                        -- Human-readable explanation
  source TEXT NOT NULL DEFAULT 'system',              -- 'system', 'manual', 'promotion'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Prevent duplicate accruals for same session/transaction/source
CREATE UNIQUE INDEX idx_loyalty_ledger_idempotency
  ON loyalty_ledger (session_id, transaction_type, source)
  WHERE session_id IS NOT NULL;

-- Performance indexes
CREATE INDEX idx_loyalty_ledger_player_created ON loyalty_ledger(player_id, created_at);
CREATE INDEX idx_loyalty_ledger_rating_slip ON loyalty_ledger(rating_slip_id);
CREATE INDEX idx_loyalty_ledger_visit ON loyalty_ledger(visit_id);

COMMENT ON TABLE loyalty_ledger IS 'Source of truth for loyalty point transactions - supports both end-of-session and mid-session accruals';
COMMENT ON COLUMN loyalty_ledger.session_id IS 'Generic session identifier for idempotency - typically rating_slip_id or visit_id';
COMMENT ON COLUMN loyalty_ledger.points_change IS 'Point delta (positive for accrual, negative for redemption)';
COMMENT ON COLUMN loyalty_ledger.transaction_type IS 'Business category: GAMEPLAY, MANUAL_BONUS, PROMOTION, REDEMPTION';
COMMENT ON COLUMN loyalty_ledger.source IS 'Origin: system (automated), manual (staff), promotion (marketing)';

-- -----------------------------------------------------------------------------
-- STEP 2: Migrate Existing LoyaltyLedger Data (Optional - if preserving history)
-- -----------------------------------------------------------------------------

-- Migrate existing LoyaltyLedger entries to new loyalty_ledger
INSERT INTO loyalty_ledger (
  player_id,
  visit_id,
  rating_slip_id,
  session_id,
  points_change,
  transaction_type,
  event_type,
  reason,
  source,
  created_at
)
SELECT
  ll.player_id,
  ll.visit_id,
  NULL,  -- Old schema doesn't track rating_slip_id
  ll.visit_id,  -- Use visit_id as session_id
  CASE
    WHEN ll.direction = 'CREDIT' THEN ll.points
    WHEN ll.direction = 'DEBIT' THEN -ll.points
  END,
  'GAMEPLAY',  -- Assume all legacy entries are gameplay
  NULL,
  ll.description,
  'system',
  ll.transaction_date
FROM "LoyaltyLedger" ll;

-- Drop old LoyaltyLedger table
DROP TABLE IF EXISTS "LoyaltyLedger" CASCADE;

-- -----------------------------------------------------------------------------
-- STEP 3: Migrate ratingslip.points to loyalty_ledger (Optional - if preserving)
-- -----------------------------------------------------------------------------

-- Migrate existing points from closed rating slips
INSERT INTO loyalty_ledger (
  player_id,
  rating_slip_id,
  visit_id,
  session_id,
  points_change,
  transaction_type,
  event_type,
  reason,
  source,
  created_at
)
SELECT
  rs.playerId,
  rs.id,
  rs.visit_id,
  rs.id,  -- session_id = rating_slip_id
  rs.points,
  'GAMEPLAY',
  'RATINGS_SLIP_COMPLETED',
  'Migrated from legacy ratingslip.points column',
  'system',
  COALESCE(rs.end_time, rs.start_time)
FROM ratingslip rs
WHERE rs.points > 0 AND rs.status = 'CLOSED'
ON CONFLICT (session_id, transaction_type, source) DO NOTHING;  -- Skip duplicates

-- -----------------------------------------------------------------------------
-- STEP 4: Remove Bounded Context Violations
-- -----------------------------------------------------------------------------

-- Drop accrual_history table (entire table is loyalty concern)
DROP TABLE IF EXISTS accrual_history CASCADE;

-- Drop points column from ratingslip (loyalty concern)
ALTER TABLE ratingslip DROP COLUMN IF EXISTS points;

-- -----------------------------------------------------------------------------
-- STEP 5: Replace close_player_session RPC (Remove Loyalty Logic)
-- -----------------------------------------------------------------------------

-- Drop old function with points parameter
DROP FUNCTION IF EXISTS close_player_session(uuid, uuid, numeric, timestamp with time zone, numeric);

-- Create new function WITHOUT points logic
CREATE OR REPLACE FUNCTION close_player_session(
  p_rating_slip_id uuid,
  p_visit_id uuid,
  p_chips_taken numeric,
  p_end_time timestamp with time zone DEFAULT now()
  -- REMOVED: p_points numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
  v_rows_affected integer;
BEGIN
  -- Update rating slip (ONLY telemetry state)
  UPDATE ratingslip
  SET
    status = 'CLOSED'::text,
    chips_taken = p_chips_taken,
    end_time = p_end_time
    -- REMOVED: points = p_points
  WHERE id = p_rating_slip_id
    AND status = 'OPEN'::text;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  -- Update visit if applicable
  IF p_visit_id IS NOT NULL THEN
    UPDATE visit
    SET check_out_date = p_end_time
    WHERE id = p_visit_id
      AND check_out_date IS NULL;
  END IF;

  -- Return result
  IF v_rows_affected > 0 THEN
    SELECT json_build_object(
      'success', true,
      'message', 'Player session closed successfully',
      'rating_slip_id', p_rating_slip_id,
      'visit_id', p_visit_id,
      'end_time', p_end_time
    ) INTO v_result;
  ELSE
    SELECT json_build_object(
      'success', false,
      'message', 'No open rating slip found with provided ID'
    ) INTO v_result;
  END IF;

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to close player session: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION close_player_session IS 'Closes rating slip and visit (telemetry only) - loyalty point assignment is handled separately by LoyaltyService';

-- -----------------------------------------------------------------------------
-- STEP 6: Create Loyalty RPC for Atomic Point Updates
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION increment_player_loyalty(
  player_id_param UUID,
  delta_points INTEGER
)
RETURNS TABLE(current_balance INTEGER, tier TEXT) AS $$
DECLARE
  new_balance INTEGER;
  new_tier TEXT;
BEGIN
  -- Update balance
  UPDATE player_loyalty
  SET
    current_balance = player_loyalty.current_balance + delta_points,
    lifetime_points = player_loyalty.lifetime_points + delta_points,
    updated_at = now()
  WHERE player_loyalty.player_id = player_id_param
  RETURNING player_loyalty.current_balance INTO new_balance;

  -- If no row found, initialize player loyalty
  IF NOT FOUND THEN
    INSERT INTO player_loyalty (player_id, current_balance, lifetime_points, tier)
    VALUES (player_id_param, delta_points, delta_points, 'BRONZE')
    RETURNING player_loyalty.current_balance INTO new_balance;
    new_tier := 'BRONZE';
  ELSE
    -- Determine new tier based on balance
    SELECT lt.tier INTO new_tier
    FROM loyalty_tier lt
    WHERE new_balance >= lt.threshold_points
    ORDER BY lt.threshold_points DESC
    LIMIT 1;

    -- Update tier if changed
    IF new_tier IS NOT NULL THEN
      UPDATE player_loyalty
      SET tier = new_tier
      WHERE player_loyalty.player_id = player_id_param;
    ELSE
      new_tier := 'BRONZE';  -- Default tier
    END IF;
  END IF;

  -- Return current state
  RETURN QUERY
  SELECT new_balance, new_tier;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_player_loyalty IS 'Atomically updates player points and recalculates tier - called by LoyaltyService only';

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Verify ratingslip no longer has points column
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'ratingslip' AND column_name = 'points';
-- Should return 0 rows

-- Verify accrual_history table is gone
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'accrual_history';
-- Should return 0 rows

-- Verify loyalty_ledger exists with correct schema
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'loyalty_ledger'
ORDER BY ordinal_position;
-- Should show: id, player_id, rating_slip_id, visit_id, session_id,
--              points_change, transaction_type, event_type, reason, source, created_at

-- Verify close_player_session no longer has points parameter
SELECT routine_name, parameter_name, data_type
FROM information_schema.parameters
WHERE specific_name LIKE '%close_player_session%'
ORDER BY ordinal_position;
-- Should NOT show p_points parameter
```

---

## Architecture Impact

### Before (PT-1 Coupled Architecture)

```
┌─────────────────────────────────────┐
│      RatingSlipService              │
│  ┌──────────────────────────────┐   │
│  │ Measures telemetry           │   │
│  │ + Calculates loyalty points! │◀──┼─ Violation: Mixed concerns
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
         │ writes to
         ▼
┌─────────────────────────────────────┐
│      ratingslip table               │
│  • average_bet (telemetry)          │
│  • duration (telemetry)             │
│  • points (LOYALTY!)            ◀───┼─ Violation: Wrong domain
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│   accrual_history table         ◀───┼─ Violation: Loyalty table in
│  • points, promo_details            │  RatingSlip domain
└─────────────────────────────────────┘
```

### After (Phase 6 Bounded Contexts)

```
┌─────────────────────────────────────┐
│      RatingSlipService              │
│  ┌──────────────────────────────┐   │
│  │ Measures telemetry ONLY      │   │
│  │ Returns: avgBet, duration    │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
         │ writes telemetry
         ▼
┌─────────────────────────────────────┐
│      ratingslip table               │
│  • average_bet                      │
│  • accumulated_seconds              │
│  • NO points column                 │ ✅ Pure telemetry
└─────────────────────────────────────┘
         │ emits event/returns data
         ▼
┌─────────────────────────────────────┐
│      LoyaltyService                 │
│  ┌──────────────────────────────┐   │
│  │ Receives telemetry           │   │
│  │ Calculates points            │   │
│  │ Assigns via RPC              │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
         │ writes rewards
         ▼
┌─────────────────────────────────────┐
│      loyalty_ledger table           │
│  • points_change                    │
│  • transaction_type                 │
│  • session_id, reason, source       │ ✅ Full audit trail
└─────────────────────────────────────┘
```

---

## Data Migration Decision Matrix

| Scenario | Recommendation | SQL Strategy |
|----------|----------------|--------------|
| **Fresh PT-2 development** | Clean break | DROP points column without migration |
| **PT-1 production data exists** | Preserve history | Migrate points to loyalty_ledger before DROP |
| **Testing/staging only** | Clean break | DROP points column without migration |
| **Compliance requires audit** | Preserve history | Migrate + archive old schema |

**For Phase 6 (Current State)**: Use **Clean Break** approach - PT-2 is new architecture, no production data to preserve.

---

## Service Code Impact

### RatingSlipService Changes Required

**Before (PT-1 pattern - DO NOT USE)**:
```typescript
// ❌ WRONG: RatingSlip calculating points
async function endSession(slipId: string) {
  const telemetry = await getTelemetry(slipId);
  const points = calculatePoints(telemetry); // ← Wrong domain!

  await supabase.rpc('close_player_session', {
    p_rating_slip_id: slipId,
    p_visit_id: visitId,
    p_chips_taken: chipsTaken,
    p_points: points  // ← Loyalty concern in telemetry RPC!
  });
}
```

**After (Phase 6 architecture - CORRECT)**:
```typescript
// ✅ CORRECT: RatingSlip returns ONLY telemetry
async function endSession(slipId: string): Promise<RatingSlipTelemetry> {
  const telemetry = await getTelemetry(slipId);

  // ONLY finalize telemetry state
  await supabase.rpc('close_player_session', {
    p_rating_slip_id: slipId,
    p_visit_id: telemetry.visitId,
    p_chips_taken: telemetry.chipsTaken
    // NO p_points parameter!
  });

  // Return telemetry for Loyalty to consume
  return {
    ratingSlipId: slipId,
    playerId: telemetry.playerId,
    visitId: telemetry.visitId,
    averageBet: telemetry.averageBet,
    durationSeconds: telemetry.accumulatedSeconds,
    gameSettings: telemetry.gameSettings
  };
}
```

### Server Action Orchestration Pattern

```typescript
// app/actions/ratingslip-actions.ts
export async function completeRatingSlip(slipId: string) {
  const supabase = createClient();

  // 1. Finalize telemetry (RatingSlipService)
  const telemetry = await RatingSlipService.endSession(supabase, slipId);

  if (!telemetry.success) {
    return { success: false, error: telemetry.error };
  }

  // 2. Calculate and assign points (LoyaltyService)
  const loyalty = await LoyaltyService.calculateAndAssignPoints(supabase, {
    ratingSlipId: telemetry.data.ratingSlipId,
    playerId: telemetry.data.playerId,
    visitId: telemetry.data.visitId,
    averageBet: telemetry.data.averageBet,
    durationSeconds: telemetry.data.durationSeconds,
    gameSettings: telemetry.data.gameSettings
  });

  return {
    success: true,
    data: {
      telemetry: telemetry.data,
      loyalty: loyalty.data
    }
  };
}
```

---

## Testing Impact

### Before (Coupled Testing)

```typescript
// Cannot test telemetry without testing point calculation
test('endSession closes rating slip', async () => {
  const result = await endSession(slipId);

  // Must verify BOTH telemetry AND points
  expect(result.status).toBe('CLOSED');
  expect(result.points).toBe(1543); // ← Forced to test loyalty logic!
});
```

### After (Independent Testing)

```typescript
// RatingSlip tests ONLY telemetry
test('endSession closes rating slip', async () => {
  const result = await RatingSlipService.endSession(supabase, slipId);

  expect(result.success).toBe(true);
  expect(result.data.durationSeconds).toBe(7200);
  expect(result.data.averageBet).toBe(50);
  // NO points assertion - not RatingSlip's concern!
});

// Loyalty tests ONLY point calculation
test('calculateAndAssignPoints computes correct points', async () => {
  const result = await LoyaltyService.calculateAndAssignPoints(supabase, {
    averageBet: 50,
    durationSeconds: 7200,
    gameSettings: mockGameSettings,
    playerTier: 'BRONZE'
  });

  expect(result.data.pointsEarned).toBe(1543);
  // NO telemetry assertions - not Loyalty's concern!
});
```

---

## Quality Gates

### Wave 0 Prerequisites - Schema Corrections ✅

- [ ] Migration script created: `phase_6_wave_0_bounded_context_corrections.sql`
- [ ] Migration tested on local database
- [ ] Verification queries pass (no points column, no accrual_history)
- [ ] loyalty_ledger table created with correct schema
- [ ] increment_player_loyalty() RPC functional
- [ ] close_player_session() RPC updated (no p_points parameter)
- [ ] database.types.ts regenerated (no points in ratingslip Row type)
- [ ] Service interfaces updated (no points in RatingSlipService return types)

### Wave 0 Implementation - Service Separation ✅

- [ ] RatingSlipService returns ONLY telemetry (no point calculation)
- [ ] LoyaltyService calculates AND assigns points (sole authority)
- [ ] Server actions orchestrate both services sequentially
- [ ] Unit tests for RatingSlip do NOT test point calculation
- [ ] Unit tests for Loyalty do NOT test telemetry measurement
- [ ] Integration test validates full flow: telemetry → points

---

## References

- [PHASE_6_LOYALTY_PREREQUISITE.md](./PHASE_6_LOYALTY_PREREQUISITE.md) - Enhanced loyalty_ledger schema specification
- [SERVICE_RESPONSIBILITY_MATRIX.md](../patterns/SERVICE_RESPONSIBILITY_MATRIX.md) - Bounded context definitions
- [BALANCED_ARCHITECTURE_QUICK.md](../patterns/BALANCED_ARCHITECTURE_QUICK.md) - Vertical vs horizontal slicing

---

**Document Version**: 1.0.0
**Created**: 2025-10-12
**Status**: Audit Complete - Migration Ready
**Next Action**: Execute migration in Wave 0 Prerequisites before service implementation

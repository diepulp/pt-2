-- =====================================================
-- Phase 6 Wave 0: Bounded Context Corrections
-- =====================================================
-- Migration: 20251012185626_phase_6_wave_0_bounded_context_corrections
-- Purpose: Enforce bounded context separation between RatingSlip (telemetry) and Loyalty (rewards)
--
-- Key Changes:
-- 1. Create loyalty_ledger table (new bounded context for all point mutations)
-- 2. Add idempotency index to prevent duplicate point awards
-- 3. Update player_loyalty schema to match Phase 6 requirements
-- 4. Seed loyalty_tier reference data
-- 5. Migrate data from legacy LoyaltyLedger to new loyalty_ledger
-- 6. Drop legacy tables (accrual_history, LoyaltyLedger)
-- 7. Drop ratingslip.points column (RatingSlip should NOT store points)
-- 8. Replace close_player_session() RPC (remove points parameter)
-- 9. Create increment_player_loyalty() RPC with row-level locking
-- =====================================================

-- =====================================================
-- STEP 1: Create loyalty_ledger table (New Bounded Context)
-- =====================================================
-- This table is the SINGLE source of truth for all loyalty point transactions
-- Every point change (gameplay, manual reward, promotion) must be recorded here
CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  rating_slip_id UUID REFERENCES ratingslip(id) ON DELETE SET NULL,
  visit_id UUID REFERENCES visit(id) ON DELETE SET NULL,
  session_id TEXT,  -- Generic session identifier for idempotency (stored as text for flexibility)
  transaction_type TEXT NOT NULL
    CHECK (transaction_type IN ('GAMEPLAY', 'MANUAL_BONUS', 'PROMOTION', 'ADJUSTMENT')),
  event_type TEXT,  -- 'RATINGS_SLIP_COMPLETED', 'POINTS_UPDATE_REQUESTED', etc.
  points_change INTEGER NOT NULL,
  reason TEXT,  -- Human-readable explanation for auditing
  source TEXT NOT NULL DEFAULT 'system'
    CHECK (source IN ('system', 'manual', 'promotion', 'adjustment')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE loyalty_ledger IS 'Immutable ledger of all loyalty point transactions - bounded context for rewards';
COMMENT ON COLUMN loyalty_ledger.session_id IS 'Generic session identifier for idempotency - typically ratingslip.id';
COMMENT ON COLUMN loyalty_ledger.transaction_type IS 'GAMEPLAY: earned from play, MANUAL_BONUS: staff-issued, PROMOTION: marketing campaign, ADJUSTMENT: correction';
COMMENT ON COLUMN loyalty_ledger.event_type IS 'Domain event that triggered this transaction (event-driven architecture)';
COMMENT ON COLUMN loyalty_ledger.points_change IS 'Delta points (positive for credit, negative for debit)';

-- =====================================================
-- STEP 2: Create Idempotency Index
-- =====================================================
-- Prevents duplicate point awards for the same session
-- Critical for mid-session rewards and event replay scenarios
CREATE UNIQUE INDEX idx_loyalty_ledger_session_type_source
  ON loyalty_ledger (session_id, transaction_type, source)
  WHERE session_id IS NOT NULL;

COMMENT ON INDEX idx_loyalty_ledger_session_type_source IS 'Enforces idempotency - prevents duplicate point awards for same session+type+source';

-- =====================================================
-- STEP 3: Create Performance Indexes
-- =====================================================
CREATE INDEX idx_loyalty_ledger_player_created
  ON loyalty_ledger(player_id, created_at DESC);

CREATE INDEX idx_loyalty_ledger_rating_slip
  ON loyalty_ledger(rating_slip_id)
  WHERE rating_slip_id IS NOT NULL;

CREATE INDEX idx_loyalty_ledger_visit
  ON loyalty_ledger(visit_id)
  WHERE visit_id IS NOT NULL;

-- =====================================================
-- STEP 4: Create/Update player_loyalty Table
-- =====================================================
-- This is the denormalized aggregate view of loyalty_ledger
-- Updated via increment_player_loyalty() RPC only
DO $$
BEGIN
  -- Check if we need to update existing table schema
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'player_loyalty') THEN
    -- Drop ALL existing tier constraints first (they may have different names)
    ALTER TABLE player_loyalty DROP CONSTRAINT IF EXISTS player_loyalty_tier_check;
    ALTER TABLE player_loyalty DROP CONSTRAINT IF EXISTS check_loyalty_tier;
    ALTER TABLE player_loyalty DROP CONSTRAINT IF EXISTS chk_tier_valid;

    -- Drop tier_progress constraints
    ALTER TABLE player_loyalty DROP CONSTRAINT IF EXISTS player_loyalty_tier_progress_check;
    ALTER TABLE player_loyalty DROP CONSTRAINT IF EXISTS chk_tier_progress_percent;

    -- Drop old columns if they don't match new schema
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_loyalty' AND column_name = 'points_balance') THEN
      ALTER TABLE player_loyalty RENAME COLUMN points_balance TO current_balance;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_loyalty' AND column_name = 'points_earned_total') THEN
      ALTER TABLE player_loyalty RENAME COLUMN points_earned_total TO lifetime_points;
    END IF;

    -- Add new columns if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_loyalty' AND column_name = 'current_balance') THEN
      ALTER TABLE player_loyalty ADD COLUMN current_balance INTEGER NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_loyalty' AND column_name = 'lifetime_points') THEN
      ALTER TABLE player_loyalty ADD COLUMN lifetime_points INTEGER NOT NULL DEFAULT 0;
    END IF;

    -- Remove columns we don't need anymore
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_loyalty' AND column_name = 'points_redeemed_total') THEN
      ALTER TABLE player_loyalty DROP COLUMN points_redeemed_total;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_loyalty' AND column_name = 'benefits') THEN
      ALTER TABLE player_loyalty DROP COLUMN benefits;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_loyalty' AND column_name = 'achievements') THEN
      ALTER TABLE player_loyalty DROP COLUMN achievements;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_loyalty' AND column_name = 'milestones') THEN
      ALTER TABLE player_loyalty DROP COLUMN milestones;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_loyalty' AND column_name = 'tier_expires_at') THEN
      ALTER TABLE player_loyalty DROP COLUMN tier_expires_at;
    END IF;

    -- Add new tier constraints
    ALTER TABLE player_loyalty ADD CONSTRAINT player_loyalty_tier_check
      CHECK (tier IN ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM'));

    -- Add tier_progress constraints
    ALTER TABLE player_loyalty ADD CONSTRAINT player_loyalty_tier_progress_check
      CHECK (tier_progress BETWEEN 0 AND 100);

  ELSE
    -- Create table from scratch
    CREATE TABLE player_loyalty (
      player_id UUID PRIMARY KEY REFERENCES player(id) ON DELETE CASCADE,
      current_balance INTEGER NOT NULL DEFAULT 0,
      lifetime_points INTEGER NOT NULL DEFAULT 0,
      tier TEXT NOT NULL DEFAULT 'BRONZE',
      tier_progress INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chk_balance_non_negative CHECK (current_balance >= 0),
      CONSTRAINT chk_lifetime_non_negative CHECK (lifetime_points >= 0),
      CONSTRAINT chk_tier_valid CHECK (tier IN ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM')),
      CONSTRAINT chk_tier_progress_percent CHECK (tier_progress BETWEEN 0 AND 100)
    );
  END IF;
END $$;

COMMENT ON TABLE player_loyalty IS 'Denormalized aggregate of loyalty_ledger - current balance and tier status';
COMMENT ON COLUMN player_loyalty.current_balance IS 'Current redeemable points balance (can decrease from redemptions)';
COMMENT ON COLUMN player_loyalty.lifetime_points IS 'Total points ever earned (monotonically increasing)';
COMMENT ON COLUMN player_loyalty.tier IS 'Current loyalty tier: BRONZE, SILVER, GOLD, PLATINUM';
COMMENT ON COLUMN player_loyalty.tier_progress IS 'Progress to next tier (0-100%)';

-- =====================================================
-- STEP 5: Create loyalty_tier Reference Table
-- =====================================================
CREATE TABLE IF NOT EXISTS loyalty_tier (
  tier TEXT PRIMARY KEY,
  threshold_points INTEGER NOT NULL,
  multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  CONSTRAINT chk_threshold_non_negative CHECK (threshold_points >= 0),
  CONSTRAINT chk_multiplier_positive CHECK (multiplier > 0)
);

COMMENT ON TABLE loyalty_tier IS 'Reference data for loyalty tier thresholds and multipliers';

-- Seed tier data
INSERT INTO loyalty_tier (tier, threshold_points, multiplier) VALUES
  ('BRONZE', 0, 1.0),
  ('SILVER', 10000, 1.25),
  ('GOLD', 50000, 1.5),
  ('PLATINUM', 100000, 2.0)
ON CONFLICT (tier) DO UPDATE SET
  threshold_points = EXCLUDED.threshold_points,
  multiplier = EXCLUDED.multiplier;

-- =====================================================
-- STEP 6: Migrate Data from LoyaltyLedger to loyalty_ledger
-- =====================================================
-- Preserve all historical loyalty data
INSERT INTO loyalty_ledger (
  player_id,
  visit_id,
  session_id,
  transaction_type,
  points_change,
  reason,
  source,
  created_at
)
SELECT
  player_id,
  visit_id,
  id::text AS session_id,  -- Use LoyaltyLedger.id as session_id
  CASE
    WHEN direction = 'CREDIT' THEN 'GAMEPLAY'
    WHEN direction = 'DEBIT' THEN 'ADJUSTMENT'
    ELSE 'ADJUSTMENT'
  END AS transaction_type,
  CASE
    WHEN direction = 'CREDIT' THEN points
    WHEN direction = 'DEBIT' THEN -points
    ELSE 0
  END AS points_change,
  description AS reason,
  'system' AS source,
  transaction_date AS created_at
FROM "LoyaltyLedger"
WHERE NOT EXISTS (
  -- Avoid duplicate migration if this script runs multiple times
  SELECT 1 FROM loyalty_ledger ll
  WHERE ll.player_id = "LoyaltyLedger".player_id
    AND ll.created_at = "LoyaltyLedger".transaction_date
);

-- =====================================================
-- STEP 7: Backfill player_loyalty from loyalty_ledger
-- =====================================================
-- Recalculate all balances from source of truth (loyalty_ledger)
INSERT INTO player_loyalty (player_id, current_balance, lifetime_points, tier, tier_progress, updated_at)
SELECT
  player_id,
  SUM(points_change) as current_balance,
  SUM(CASE WHEN points_change > 0 THEN points_change ELSE 0 END) as lifetime_points,
  CASE
    WHEN SUM(CASE WHEN points_change > 0 THEN points_change ELSE 0 END) >= 100000 THEN 'PLATINUM'
    WHEN SUM(CASE WHEN points_change > 0 THEN points_change ELSE 0 END) >= 50000 THEN 'GOLD'
    WHEN SUM(CASE WHEN points_change > 0 THEN points_change ELSE 0 END) >= 10000 THEN 'SILVER'
    ELSE 'BRONZE'
  END as tier,
  0 as tier_progress,  -- Will be calculated by application logic
  now() as updated_at
FROM loyalty_ledger
GROUP BY player_id
ON CONFLICT (player_id) DO UPDATE SET
  current_balance = EXCLUDED.current_balance,
  lifetime_points = EXCLUDED.lifetime_points,
  tier = EXCLUDED.tier,
  updated_at = now();

-- =====================================================
-- STEP 8: Drop Legacy Tables
-- =====================================================
-- These tables violate bounded context separation
DROP TABLE IF EXISTS accrual_history CASCADE;
DROP TABLE IF EXISTS "LoyaltyLedger" CASCADE;

-- =====================================================
-- STEP 9: Drop ratingslip.points Column
-- =====================================================
-- RatingSlip is for TELEMETRY only, not loyalty points
-- Points are now calculated by LoyaltyService and stored in loyalty_ledger
ALTER TABLE ratingslip DROP COLUMN IF EXISTS points CASCADE;

-- =====================================================
-- STEP 10: Replace close_player_session() RPC
-- =====================================================
-- Remove p_points parameter - RatingSlip no longer handles points
CREATE OR REPLACE FUNCTION close_player_session(
  p_rating_slip_id UUID,
  p_visit_id UUID,
  p_chips_taken NUMERIC,
  p_end_time TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update rating slip status to CLOSED
  UPDATE ratingslip
  SET
    status = 'CLOSED',
    end_time = p_end_time,
    chips_taken = p_chips_taken
  WHERE id = p_rating_slip_id;

  -- Note: NO POINTS LOGIC HERE
  -- Points are now calculated by LoyaltyService via event-driven architecture
  -- RatingSlip emits RATINGS_SLIP_COMPLETED event → LoyaltyService calculates points
END;
$$;

COMMENT ON FUNCTION close_player_session(UUID, UUID, NUMERIC, TIMESTAMPTZ) IS 'Closes a rating slip session - NO LONGER HANDLES POINTS (bounded context separation)';

-- =====================================================
-- STEP 11: Create increment_player_loyalty() RPC
-- =====================================================
-- This is the ONLY way to update player_loyalty table
-- Uses FOR UPDATE lock to prevent race conditions
CREATE OR REPLACE FUNCTION increment_player_loyalty(
  p_player_id UUID,
  p_delta_points INTEGER
)
RETURNS TABLE(current_balance INTEGER, tier TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance INTEGER;
  v_lifetime INTEGER;
  v_new_tier TEXT;
BEGIN
  -- Lock the row for update (prevents concurrent modification)
  SELECT
    current_balance + p_delta_points,
    lifetime_points + CASE WHEN p_delta_points > 0 THEN p_delta_points ELSE 0 END
  INTO v_new_balance, v_lifetime
  FROM player_loyalty
  WHERE player_id = p_player_id
  FOR UPDATE;

  -- If player doesn't exist in player_loyalty, insert them
  IF NOT FOUND THEN
    INSERT INTO player_loyalty (player_id, current_balance, lifetime_points, tier, tier_progress)
    VALUES (
      p_player_id,
      GREATEST(p_delta_points, 0),  -- Balance can't go negative on first insert
      CASE WHEN p_delta_points > 0 THEN p_delta_points ELSE 0 END,
      'BRONZE',
      0
    );

    v_new_balance := GREATEST(p_delta_points, 0);
    v_lifetime := CASE WHEN p_delta_points > 0 THEN p_delta_points ELSE 0 END;
  END IF;

  -- Determine tier based on lifetime points
  SELECT t.tier INTO v_new_tier
  FROM loyalty_tier t
  WHERE t.threshold_points <= v_lifetime
  ORDER BY t.threshold_points DESC
  LIMIT 1;

  -- Update player_loyalty with new values
  UPDATE player_loyalty
  SET
    current_balance = v_new_balance,
    lifetime_points = v_lifetime,
    tier = v_new_tier,
    updated_at = now()
  WHERE player_id = p_player_id;

  -- Return the updated values
  RETURN QUERY
  SELECT v_new_balance, v_new_tier;
END;
$$;

COMMENT ON FUNCTION increment_player_loyalty IS 'Atomically updates player loyalty balance and tier - uses row-level locking to prevent race conditions';

-- =====================================================
-- STEP 12: Grant Permissions
-- =====================================================
-- Allow authenticated users to read loyalty data
GRANT SELECT ON loyalty_ledger TO authenticated;
GRANT SELECT ON player_loyalty TO authenticated;
GRANT SELECT ON loyalty_tier TO authenticated;

-- Allow authenticated users to insert into loyalty_ledger (via service layer)
GRANT INSERT ON loyalty_ledger TO authenticated;

-- Only allow RPC updates to player_loyalty (no direct INSERT/UPDATE)
GRANT EXECUTE ON FUNCTION increment_player_loyalty TO authenticated;

-- Service role has full access
GRANT ALL ON loyalty_ledger TO service_role;
GRANT ALL ON player_loyalty TO service_role;
GRANT ALL ON loyalty_tier TO service_role;

-- =====================================================
-- Migration Complete
-- =====================================================
-- Next Steps (Post-Migration):
-- 1. Run verification queries (see PHASE_6_DEVELOPER_CHECKLIST.md Task 0.3)
-- 2. Regenerate TypeScript types: npm run db:types
-- 3. Verify all Wave 0 exit criteria before starting Wave 1
-- =====================================================

-- =====================================================
-- Wave 2 Schema Hardening Migration
-- Track 0: Schema + Loyalty Service Integration
-- =====================================================
-- Purpose: Add audit/tracing columns and enhance RPC for production resilience
-- Dependencies: 20251013_fix_increment_player_loyalty_rpc.sql
-- Quality Gates:
--   - Migration applies cleanly
--   - RPC returns 9 columns (including before/after, row_locked)
--   - Indexes created for correlation_id and staff_id
-- =====================================================

BEGIN;

-- =====================================================
-- STEP 1: Add Audit/Tracing Columns to loyalty_ledger
-- =====================================================

ALTER TABLE loyalty_ledger
  ADD COLUMN IF NOT EXISTS staff_id TEXT,
  ADD COLUMN IF NOT EXISTS balance_before INTEGER,
  ADD COLUMN IF NOT EXISTS balance_after INTEGER,
  ADD COLUMN IF NOT EXISTS tier_before TEXT,
  ADD COLUMN IF NOT EXISTS tier_after TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT;

-- Add comments for documentation
COMMENT ON COLUMN loyalty_ledger.staff_id IS 'Staff member who initiated manual rewards (NULL for automated transactions)';
COMMENT ON COLUMN loyalty_ledger.balance_before IS 'Player balance snapshot before transaction';
COMMENT ON COLUMN loyalty_ledger.balance_after IS 'Player balance snapshot after transaction';
COMMENT ON COLUMN loyalty_ledger.tier_before IS 'Player tier snapshot before transaction';
COMMENT ON COLUMN loyalty_ledger.tier_after IS 'Player tier snapshot after transaction';
COMMENT ON COLUMN loyalty_ledger.correlation_id IS 'Request-scoped correlation ID for distributed tracing';

-- =====================================================
-- STEP 2: Create Performance Indexes
-- =====================================================

-- Index for correlation-based lookups (distributed tracing)
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_correlation
  ON loyalty_ledger(correlation_id)
  WHERE correlation_id IS NOT NULL;

-- Index for staff audit trails (manual reward analysis)
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_staff
  ON loyalty_ledger(staff_id, created_at DESC)
  WHERE staff_id IS NOT NULL;

-- =====================================================
-- STEP 3: Update increment_player_loyalty RPC
-- =====================================================
-- Enhancement: Return before/after snapshots + row_locked flag
-- This provides transaction audit trail and concurrency awareness
-- NOTE: Must drop function first since we're changing return type

DROP FUNCTION IF EXISTS increment_player_loyalty(UUID, INTEGER);

CREATE OR REPLACE FUNCTION increment_player_loyalty(
  p_player_id UUID,
  p_delta_points INTEGER
)
RETURNS TABLE(
  player_id UUID,
  balance_before INTEGER,
  balance_after INTEGER,
  tier_before TEXT,
  tier_after TEXT,
  current_balance INTEGER,
  lifetime_points INTEGER,
  tier TEXT,
  tier_progress INTEGER,
  updated_at TIMESTAMPTZ,
  row_locked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_before INTEGER;
  v_tier_before TEXT;
  v_new_balance INTEGER;
  v_lifetime INTEGER;
  v_new_tier TEXT;
  v_tier_progress INTEGER;
  v_updated_at TIMESTAMPTZ;
  v_row_locked BOOLEAN := TRUE;
BEGIN
  -- Capture before state (with row lock)
  SELECT
    pl.current_balance,
    pl.tier,
    pl.current_balance + p_delta_points,
    pl.lifetime_points + CASE WHEN p_delta_points > 0 THEN p_delta_points ELSE 0 END
  INTO v_balance_before, v_tier_before, v_new_balance, v_lifetime
  FROM player_loyalty pl
  WHERE pl.player_id = p_player_id
  FOR UPDATE;

  -- If player doesn't exist in player_loyalty, insert them
  IF NOT FOUND THEN
    v_row_locked := FALSE;  -- No lock acquired (new player)
    v_balance_before := 0;
    v_tier_before := 'BRONZE';

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

  -- Calculate tier progress (percentage to next tier)
  SELECT
    CASE
      WHEN v_new_tier = 'PLATINUM' THEN 100
      WHEN v_new_tier = 'GOLD' THEN ROUND(((v_lifetime - 5000)::NUMERIC / (20000 - 5000)::NUMERIC) * 100)
      WHEN v_new_tier = 'SILVER' THEN ROUND(((v_lifetime - 1000)::NUMERIC / (5000 - 1000)::NUMERIC) * 100)
      ELSE ROUND((v_lifetime::NUMERIC / 1000::NUMERIC) * 100)
    END
  INTO v_tier_progress;

  v_tier_progress := LEAST(GREATEST(v_tier_progress, 0), 100);
  v_updated_at := now();

  -- Update player_loyalty with new values (if row exists)
  IF v_row_locked THEN
    UPDATE player_loyalty
    SET
      current_balance = v_new_balance,
      lifetime_points = v_lifetime,
      tier = v_new_tier,
      tier_progress = v_tier_progress,
      updated_at = v_updated_at
    WHERE player_loyalty.player_id = p_player_id;
  END IF;

  -- Return enhanced result set with before/after snapshots
  RETURN QUERY
  SELECT
    p_player_id,
    v_balance_before,
    v_new_balance,
    v_tier_before,
    v_new_tier,
    v_new_balance,       -- current_balance (for backwards compatibility)
    v_lifetime,          -- lifetime_points
    v_new_tier,          -- tier (for backwards compatibility)
    v_tier_progress,
    v_updated_at,
    v_row_locked;
END;
$$;

COMMENT ON FUNCTION increment_player_loyalty IS 'Atomically updates player loyalty with before/after snapshots for audit trails - Wave 2 enhanced version';

COMMIT;

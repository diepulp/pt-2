-- Fix increment_player_loyalty RPC function
-- Issue: Ambiguous column references and incomplete return type
-- Tests expect: player_id, current_balance, lifetime_points, tier, tier_progress, updated_at

DROP FUNCTION IF EXISTS increment_player_loyalty(UUID, INTEGER);

CREATE OR REPLACE FUNCTION increment_player_loyalty(
  p_player_id UUID,
  p_delta_points INTEGER
)
RETURNS TABLE(
  player_id UUID,
  current_balance INTEGER,
  lifetime_points INTEGER,
  tier TEXT,
  tier_progress INTEGER,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance INTEGER;
  v_lifetime INTEGER;
  v_new_tier TEXT;
  v_tier_progress INTEGER;
  v_updated_at TIMESTAMPTZ;
BEGIN
  -- Lock the row for update (prevents concurrent modification)
  SELECT
    pl.current_balance + p_delta_points,
    pl.lifetime_points + CASE WHEN p_delta_points > 0 THEN p_delta_points ELSE 0 END
  INTO v_new_balance, v_lifetime
  FROM player_loyalty pl
  WHERE pl.player_id = p_player_id
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

  -- Calculate tier progress (percentage to next tier)
  SELECT
    CASE
      WHEN v_new_tier = 'PLATINUM' THEN 100
      WHEN v_new_tier = 'GOLD' THEN ROUND(((v_lifetime - 5000)::NUMERIC / (20000 - 5000)::NUMERIC) * 100)
      WHEN v_new_tier = 'SILVER' THEN ROUND(((v_lifetime - 1000)::NUMERIC / (5000 - 1000)::NUMERIC) * 100)
      ELSE ROUND((v_lifetime::NUMERIC / 1000::NUMERIC) * 100)
    END INTO v_tier_progress;

  -- Clamp tier_progress to 0-100 range
  v_tier_progress := LEAST(100, GREATEST(0, v_tier_progress));

  -- Update player_loyalty with new values
  UPDATE player_loyalty pl
  SET
    current_balance = v_new_balance,
    lifetime_points = v_lifetime,
    tier = v_new_tier,
    tier_progress = v_tier_progress,
    updated_at = now()
  WHERE pl.player_id = p_player_id
  RETURNING pl.updated_at INTO v_updated_at;

  -- Return the updated values (explicitly qualify to avoid ambiguity)
  RETURN QUERY
  SELECT
    p_player_id,
    v_new_balance,
    v_lifetime,
    v_new_tier,
    v_tier_progress,
    v_updated_at;
END;
$$;

COMMENT ON FUNCTION increment_player_loyalty IS 'Atomically updates player loyalty balance, tier, and progress - uses row-level locking to prevent race conditions';

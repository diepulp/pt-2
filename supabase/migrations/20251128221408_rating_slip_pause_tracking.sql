-- Migration: Rating Slip Pause Tracking
-- Created: 2025-11-28
-- Spec: SPEC-PRD-002-table-rating-core.md
-- Purpose: Add pause tracking table, unique constraint, and lifecycle RPCs for rating slips

-- =====================================================================
-- 1. CREATE rating_slip_pause TABLE
-- =====================================================================

CREATE TABLE public.rating_slip_pause (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_slip_id UUID NOT NULL REFERENCES rating_slip(id) ON DELETE CASCADE,
  casino_id UUID NOT NULL REFERENCES casino(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  CONSTRAINT valid_pause_interval CHECK (ended_at IS NULL OR ended_at > started_at)
);

-- Index for efficient duration calculation
CREATE INDEX ix_slip_pause_slip_id ON rating_slip_pause(rating_slip_id, started_at);

-- Enable RLS
ALTER TABLE rating_slip_pause ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "rating_slip_pause_read_same_casino"
  ON rating_slip_pause FOR SELECT USING (
    casino_id = current_setting('app.casino_id')::uuid
  );

CREATE POLICY "rating_slip_pause_write_pit_boss"
  ON rating_slip_pause FOR INSERT WITH CHECK (
    casino_id = current_setting('app.casino_id')::uuid
  );

CREATE POLICY "rating_slip_pause_update_pit_boss"
  ON rating_slip_pause FOR UPDATE USING (
    casino_id = current_setting('app.casino_id')::uuid
  );

-- =====================================================================
-- 2. CREATE UNIQUE CONSTRAINT ON rating_slip
-- =====================================================================

-- Partial unique index: Only one open/paused slip per player per table
CREATE UNIQUE INDEX ux_rating_slip_player_table_active
  ON rating_slip (player_id, table_id)
  WHERE status IN ('open', 'paused');

-- =====================================================================
-- 3. CREATE RPC FUNCTIONS
-- =====================================================================

-- =====================================================================
-- 3.1 rpc_update_table_status
-- =====================================================================

CREATE OR REPLACE FUNCTION rpc_update_table_status(
  p_casino_id UUID,
  p_table_id UUID,
  p_new_status table_status,
  p_actor_id UUID
) RETURNS gaming_table
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status table_status;
  v_result gaming_table;
BEGIN
  -- Get current status with row lock
  SELECT status INTO v_current_status
  FROM gaming_table
  WHERE id = p_table_id AND casino_id = p_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Table % not found', p_table_id;
  END IF;

  -- Validate state transition
  -- Valid: inactive → active, active → inactive, active → closed
  -- Invalid: closed → anything (terminal state)
  IF NOT (
    (v_current_status = 'inactive' AND p_new_status = 'active') OR
    (v_current_status = 'active' AND p_new_status IN ('inactive', 'closed'))
  ) THEN
    RAISE EXCEPTION 'TABLE_INVALID_TRANSITION: Cannot transition from % to %',
      v_current_status, p_new_status;
  END IF;

  -- Update status
  UPDATE gaming_table
  SET status = p_new_status
  WHERE id = p_table_id AND casino_id = p_casino_id
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'table-context',
    p_actor_id,
    'update_table_status',
    jsonb_build_object(
      'table_id', p_table_id,
      'from_status', v_current_status,
      'to_status', p_new_status
    )
  );

  RETURN v_result;
END;
$$;

-- =====================================================================
-- 3.2 rpc_start_rating_slip
-- =====================================================================

CREATE OR REPLACE FUNCTION rpc_start_rating_slip(
  p_casino_id UUID,
  p_player_id UUID,
  p_visit_id UUID,
  p_table_id UUID,
  p_seat_number TEXT,
  p_game_settings JSONB,
  p_actor_id UUID
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result rating_slip;
BEGIN
  -- Validate visit is open
  IF NOT EXISTS (
    SELECT 1 FROM visit
    WHERE id = p_visit_id
      AND player_id = p_player_id
      AND casino_id = p_casino_id
      AND ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'VISIT_NOT_OPEN: Visit % is not active', p_visit_id;
  END IF;

  -- Validate table is active
  IF NOT EXISTS (
    SELECT 1 FROM gaming_table
    WHERE id = p_table_id
      AND casino_id = p_casino_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'TABLE_NOT_ACTIVE: Table % is not active', p_table_id;
  END IF;

  -- Create slip (unique constraint prevents duplicates)
  INSERT INTO rating_slip (
    casino_id, player_id, visit_id, table_id,
    seat_number, game_settings, status, start_time
  )
  VALUES (
    p_casino_id, p_player_id, p_visit_id, p_table_id,
    p_seat_number, p_game_settings, 'open', now()
  )
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating-slip',
    p_actor_id,
    'start_rating_slip',
    jsonb_build_object(
      'rating_slip_id', v_result.id,
      'player_id', p_player_id,
      'table_id', p_table_id
    )
  );

  RETURN v_result;
END;
$$;

-- =====================================================================
-- 3.3 rpc_pause_rating_slip
-- =====================================================================

CREATE OR REPLACE FUNCTION rpc_pause_rating_slip(
  p_casino_id UUID,
  p_rating_slip_id UUID,
  p_actor_id UUID
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result rating_slip;
BEGIN
  -- Validate slip is open
  IF NOT EXISTS (
    SELECT 1 FROM rating_slip
    WHERE id = p_rating_slip_id
      AND casino_id = p_casino_id
      AND status = 'open'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_OPEN: Slip % cannot be paused', p_rating_slip_id;
  END IF;

  -- Create pause record
  INSERT INTO rating_slip_pause (rating_slip_id, casino_id, started_at, created_by)
  VALUES (p_rating_slip_id, p_casino_id, now(), p_actor_id);

  -- Update slip status
  UPDATE rating_slip
  SET status = 'paused'
  WHERE id = p_rating_slip_id AND casino_id = p_casino_id
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating-slip',
    p_actor_id,
    'pause_rating_slip',
    jsonb_build_object('rating_slip_id', p_rating_slip_id)
  );

  RETURN v_result;
END;
$$;

-- =====================================================================
-- 3.4 rpc_resume_rating_slip
-- =====================================================================

CREATE OR REPLACE FUNCTION rpc_resume_rating_slip(
  p_casino_id UUID,
  p_rating_slip_id UUID,
  p_actor_id UUID
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result rating_slip;
BEGIN
  -- Validate slip is paused
  IF NOT EXISTS (
    SELECT 1 FROM rating_slip
    WHERE id = p_rating_slip_id
      AND casino_id = p_casino_id
      AND status = 'paused'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_PAUSED: Slip % cannot be resumed', p_rating_slip_id;
  END IF;

  -- Close current pause interval
  UPDATE rating_slip_pause
  SET ended_at = now()
  WHERE rating_slip_id = p_rating_slip_id
    AND casino_id = p_casino_id
    AND ended_at IS NULL;

  -- Update slip status
  UPDATE rating_slip
  SET status = 'open'
  WHERE id = p_rating_slip_id AND casino_id = p_casino_id
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating-slip',
    p_actor_id,
    'resume_rating_slip',
    jsonb_build_object('rating_slip_id', p_rating_slip_id)
  );

  RETURN v_result;
END;
$$;

-- =====================================================================
-- 3.5 rpc_close_rating_slip
-- =====================================================================

CREATE OR REPLACE FUNCTION rpc_close_rating_slip(
  p_casino_id UUID,
  p_rating_slip_id UUID,
  p_actor_id UUID,
  p_average_bet NUMERIC DEFAULT NULL
) RETURNS TABLE (
  slip rating_slip,
  duration_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result rating_slip;
  v_duration INTEGER;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ := now();
  v_paused_ms BIGINT;
BEGIN
  -- Validate slip is open or paused
  SELECT start_time INTO v_start_time
  FROM rating_slip
  WHERE id = p_rating_slip_id
    AND casino_id = p_casino_id
    AND status IN ('open', 'paused')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_INVALID_STATE: Slip % cannot be closed', p_rating_slip_id;
  END IF;

  -- Close any open pause interval
  UPDATE rating_slip_pause
  SET ended_at = v_end_time
  WHERE rating_slip_id = p_rating_slip_id
    AND casino_id = p_casino_id
    AND ended_at IS NULL;

  -- Calculate paused duration
  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (COALESCE(ended_at, v_end_time) - started_at)) * 1000
  ), 0)::BIGINT INTO v_paused_ms
  FROM rating_slip_pause
  WHERE rating_slip_id = p_rating_slip_id;

  -- Calculate active duration (total - paused)
  v_duration := GREATEST(0,
    FLOOR((EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000 - v_paused_ms) / 1000)
  )::INTEGER;

  -- Update slip
  UPDATE rating_slip
  SET
    status = 'closed',
    end_time = v_end_time,
    average_bet = COALESCE(p_average_bet, average_bet)
  WHERE id = p_rating_slip_id AND casino_id = p_casino_id
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating-slip',
    p_actor_id,
    'close_rating_slip',
    jsonb_build_object(
      'rating_slip_id', p_rating_slip_id,
      'duration_seconds', v_duration,
      'average_bet', p_average_bet
    )
  );

  RETURN QUERY SELECT v_result, v_duration;
END;
$$;

-- =====================================================================
-- 3.6 rpc_get_rating_slip_duration
-- =====================================================================

CREATE OR REPLACE FUNCTION rpc_get_rating_slip_duration(
  p_rating_slip_id UUID,
  p_as_of TIMESTAMPTZ DEFAULT now()
) RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_status rating_slip_status;
  v_paused_ms BIGINT;
BEGIN
  SELECT start_time, end_time, status
  INTO v_start_time, v_end_time, v_status
  FROM rating_slip
  WHERE id = p_rating_slip_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Use end_time if closed, otherwise as_of
  IF v_status = 'closed' AND v_end_time IS NOT NULL THEN
    v_end_time := v_end_time;
  ELSE
    v_end_time := p_as_of;
  END IF;

  -- Calculate paused duration
  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (COALESCE(ended_at, v_end_time) - started_at)) * 1000
  ), 0)::BIGINT INTO v_paused_ms
  FROM rating_slip_pause
  WHERE rating_slip_id = p_rating_slip_id
    AND started_at <= v_end_time;

  -- Return active seconds
  RETURN GREATEST(0,
    FLOOR((EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000 - v_paused_ms) / 1000)
  )::INTEGER;
END;
$$;

-- Migration: SEC-007 Rating Slip RPC Hardening
-- Created: 2025-12-12
-- Purpose: Add Template 5 context validation to rating slip and table status RPCs
-- Reference: SEC-007, ADR-015, ADR-018, SEC-001 Template 5
-- Audit: Post-SEC-006 infrastructure gap report v2
--
-- SECTIONS:
--   1. rpc_update_table_status - Table status transitions
--   2. rpc_start_rating_slip - Create new rating slip
--   3. rpc_pause_rating_slip - Pause rating slip
--   4. rpc_resume_rating_slip - Resume paused rating slip
--   5. rpc_close_rating_slip - Close rating slip with duration
--
-- VERIFIED_SAFE

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- CLEANUP: Drop old function signatures before recreating
-- The original rpc_start_rating_slip had p_player_id parameter (7 params)
-- Migration 20251207024918 removed p_player_id (6 params) but left both in DB
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS rpc_start_rating_slip(UUID, UUID, UUID, UUID, TEXT, JSONB, UUID);
-- Note: The 6-param version will be replaced by CREATE OR REPLACE below

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1: rpc_update_table_status
-- Add context validation for table status changes
-- Reference: SEC-007 Finding #2
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_context_casino_id uuid;
  v_current_status table_status;
  v_result gaming_table;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-007)
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;
  -- ═══════════════════════════════════════════════════════════════════════

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

COMMENT ON FUNCTION rpc_update_table_status(UUID, UUID, table_status, UUID) IS
  'Updates table status with state transition validation. SEC-007 hardened with Template 5 context validation.';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2: rpc_start_rating_slip
-- Add context validation for new rating slip creation
-- Reference: SEC-007 Finding #2
-- Note: Uses signature from 20251207024918 (no p_player_id parameter)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rpc_start_rating_slip(
  p_casino_id UUID,
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
  v_context_casino_id uuid;
  v_result rating_slip;
  v_player_id UUID;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-007)
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;
  -- ═══════════════════════════════════════════════════════════════════════

  -- Validate visit is open and get player_id for audit
  SELECT player_id INTO v_player_id
  FROM visit
  WHERE id = p_visit_id
    AND casino_id = p_casino_id
    AND ended_at IS NULL;

  IF NOT FOUND THEN
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

  -- Create slip (unique constraint prevents duplicates per visit/table)
  INSERT INTO rating_slip (
    casino_id, visit_id, table_id,
    seat_number, game_settings, status, start_time
  )
  VALUES (
    p_casino_id, p_visit_id, p_table_id,
    p_seat_number, p_game_settings, 'open', now()
  )
  RETURNING * INTO v_result;

  -- Audit log (include player_id from visit for reference)
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating-slip',
    p_actor_id,
    'start_rating_slip',
    jsonb_build_object(
      'rating_slip_id', v_result.id,
      'visit_id', p_visit_id,
      'player_id', v_player_id,
      'table_id', p_table_id
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_start_rating_slip(UUID, UUID, UUID, TEXT, JSONB, UUID) IS
  'Creates new rating slip for active visit/table. SEC-007 hardened with Template 5 context validation.';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3: rpc_pause_rating_slip
-- Add context validation for rating slip pause
-- Reference: SEC-007 Finding #2
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_context_casino_id uuid;
  v_result rating_slip;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-007)
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;
  -- ═══════════════════════════════════════════════════════════════════════

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

COMMENT ON FUNCTION rpc_pause_rating_slip(UUID, UUID, UUID) IS
  'Pauses open rating slip. SEC-007 hardened with Template 5 context validation.';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4: rpc_resume_rating_slip
-- Add context validation for rating slip resume
-- Reference: SEC-007 Finding #2
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_context_casino_id uuid;
  v_result rating_slip;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-007)
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;
  -- ═══════════════════════════════════════════════════════════════════════

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

COMMENT ON FUNCTION rpc_resume_rating_slip(UUID, UUID, UUID) IS
  'Resumes paused rating slip. SEC-007 hardened with Template 5 context validation.';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5: rpc_close_rating_slip
-- Add context validation for rating slip close
-- Reference: SEC-007 Finding #2
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_context_casino_id uuid;
  v_result rating_slip;
  v_duration INTEGER;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ := now();
  v_paused_ms BIGINT;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-007)
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;
  -- ═══════════════════════════════════════════════════════════════════════

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

COMMENT ON FUNCTION rpc_close_rating_slip(UUID, UUID, UUID, NUMERIC) IS
  'Closes rating slip and calculates active duration. SEC-007 hardened with Template 5 context validation.';

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFY POSTGREST TO RELOAD SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (Run manually after migration)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Test context validation (should raise exception):
-- SELECT rpc_start_rating_slip(
--   '00000000-0000-0000-0000-000000000001'::uuid,  -- wrong casino
--   'visit-uuid'::uuid,
--   'table-uuid'::uuid,
--   '1',
--   '{}'::jsonb,
--   'actor-uuid'::uuid
-- );
-- Expected: 'casino_id mismatch: caller provided ... but context is ...'
--
-- Test without context (should raise exception):
-- SELECT rpc_pause_rating_slip(
--   'casino-uuid'::uuid,
--   'slip-uuid'::uuid,
--   'actor-uuid'::uuid
-- );
-- Expected: 'RLS context not set: app.casino_id is required'

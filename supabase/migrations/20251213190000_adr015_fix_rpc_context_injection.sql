-- Migration: ADR-015 Fix - RPC Context Self-Injection for Rating Slip RPCs
-- Description: Updates rating slip RPCs to call set_rls_context internally
-- Workstream: WS1 - Database RPC Layer
-- Issue: ISSUE-5AD0182D
--
-- Problem:
-- Currently, withServerAction middleware calls set_rls_context in one transaction,
-- then the handler makes separate RPC calls in different transactions.
-- In Supabase's transaction mode pooling (port 6543), each RPC may get a different
-- connection, causing the SET LOCAL context to be lost.
--
-- Solution:
-- Update all rating slip RPCs to call set_rls_context internally, ensuring context
-- is injected within the same transaction as the operation.
--
-- Pattern: RPC self-injection (Pattern C compliance with JWT fallback)
--
-- Affected RPCs:
-- - rpc_start_rating_slip
-- - rpc_pause_rating_slip
-- - rpc_resume_rating_slip
-- - rpc_close_rating_slip

-- ============================================================================
-- rpc_start_rating_slip - Self-injection update
-- ============================================================================
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
  v_context_actor_id uuid;
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_result rating_slip;
  v_player_id UUID;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: Call set_rls_context within same transaction
  -- =======================================================================
  -- Extract staff role from JWT claims if available, otherwise use default
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text,
    'pit_boss'  -- Default role for backward compatibility
  );

  -- Call set_rls_context to ensure context is available for RLS policies
  -- This handles both session variables (SET LOCAL) and JWT fallback
  PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);

  -- Now extract the validated context (will use JWT fallback if needed)
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

  -- Rest of original logic continues...
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
    'rating_slip',
    p_actor_id,
    'start',
    jsonb_build_object(
      'rating_slip_id', v_result.id,
      'visit_id', p_visit_id,
      'table_id', p_table_id,
      'seat_number', p_seat_number,
      'player_id', v_player_id
    )
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- rpc_pause_rating_slip - Self-injection update
-- ============================================================================
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
  v_context_actor_id uuid;
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_result rating_slip;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: Call set_rls_context within same transaction
  -- =======================================================================
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text,
    'pit_boss'
  );

  PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);

  -- Extract and validate context
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

  -- Original logic continues...
  -- Lock and check state
  SELECT * INTO v_result
  FROM rating_slip
  WHERE id = p_rating_slip_id
  AND casino_id = p_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  IF v_result.status != 'open' THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_OPEN: Rating slip % is not in open state (status: %)',
      p_rating_slip_id, v_result.status;
  END IF;

  -- Update to paused state and record pause start
  UPDATE rating_slip
  SET
    status = 'paused',
    pause_intervals = array_append(
      COALESCE(pause_intervals, '{}'),
      tstzrange(now(), NULL)  -- Current timestamp to infinity (open-ended interval)
    )
  WHERE id = p_rating_slip_id
  RETURNING * INTO v_result;

  -- Audit log (include pause start time)
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating_slip',
    p_actor_id,
    'pause',
    jsonb_build_object(
      'rating_slip_id', p_rating_slip_id,
      'pause_start_time', now(),
      'previous_status', 'open',
      'visit_id', v_result.visit_id
    )
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- rpc_resume_rating_slip - Self-injection update
-- ============================================================================
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
  v_context_actor_id uuid;
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_result rating_slip;
  v_pause_range tstzrange;
  v_updated_intervals tstzrange[];
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: Call set_rls_context within same transaction
  -- =======================================================================
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text,
    'pit_boss'
  );

  PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);

  -- Extract and validate context
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

  -- Original logic continues...
  -- Lock and check state
  SELECT * INTO v_result
  FROM rating_slip
  WHERE id = p_rating_slip_id
  AND casino_id = p_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  IF v_result.status != 'paused' THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_PAUSED: Rating slip % is not in paused state (status: %)',
      p_rating_slip_id, v_result.status;
  END IF;

  -- Close the most recent pause interval
  IF v_result.pause_intervals IS NOT NULL AND array_length(v_result.pause_intervals, 1) > 0 THEN
    -- Get the last (most recent) pause interval
    v_pause_range := v_result.pause_intervals[array_length(v_result.pause_intervals, 1)];

    -- Update it to close at current time
    v_updated_intervals := v_result.pause_intervals;
    v_updated_intervals[array_length(v_updated_intervals, 1)] :=
      tstzrange(lower(v_pause_range), now());  -- Replace upper bound (NULL) with now()

    UPDATE rating_slip
    SET
      status = 'open',
      pause_intervals = v_updated_intervals
    WHERE id = p_rating_slip_id
    RETURNING * INTO v_result;

  ELSE
    RAISE EXCEPTION 'PAUSE_INTERVAL_NOT_FOUND: No pause intervals found for paused slip %', p_rating_slip_id;
  END IF;

  -- Audit log (include pause end time)
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating_slip',
    p_actor_id,
    'resume',
    jsonb_build_object(
      'rating_slip_id', p_rating_slip_id,
      'pause_end_time', now(),
      'previous_status', 'paused',
      'visit_id', v_result.visit_id,
      'pause_duration_seconds', EXTRACT(EPOCH FROM (now() - lower(v_pause_range)))::int
    )
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- rpc_close_rating_slip - Self-injection update
-- ============================================================================
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
  v_context_actor_id uuid;
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_row record;
  v_result rating_slip;
  v_duration INTEGER;
  v_current_pause_range tstzrange;
  v_final_intervals tstzrange[];
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: Call set_rls_context within same transaction
  -- =======================================================================
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text,
    'pit_boss'
  );

  PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);

  -- Extract and validate context
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

  -- Original logic continues...
  -- Lock the slip for update to prevent race conditions
  SELECT * INTO v_result
  FROM rating_slip
  WHERE id = p_rating_slip_id
  AND casino_id = p_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  IF v_result.status = 'closed' THEN
    RAISE EXCEPTION 'RATING_SLIP_ALREADY_CLOSED: Rating slip % is already closed', p_rating_slip_id;
  END IF;

  -- If currently paused, close the open pause interval first
  IF v_result.status = 'paused' AND v_result.pause_intervals IS NOT NULL THEN
    v_current_pause_range := v_result.pause_intervals[array_length(v_result.pause_intervals, 1)];

    -- Only update if upper bound is null (meaning it's still open)
    IF upper(v_current_pause_range) IS NULL THEN
      v_final_intervals := v_result.pause_intervals;
      v_final_intervals[array_length(v_final_intervals, 1)] :=
        tstzrange(lower(v_current_pause_range), now());

      v_result.pause_intervals := v_final_intervals;
    END IF;
  END IF;

  -- Calculate duration (excluding paused time)
  SELECT EXTRACT(EPOCH FROM (
    now() - v_result.start_time - COALESCE(
      SUM(upper(pause_range) - lower(pause_range)),
      INTERVAL '0 seconds'
    )
  ))::INTEGER INTO v_duration
  FROM unnest(COALESCE(v_result.pause_intervals, '{}')) AS pause_range;

  -- Update slip to closed state
  UPDATE rating_slip
  SET
    status = 'closed',
    end_time = now(),
    duration_seconds = v_duration,
    average_bet = COALESCE(p_average_bet, v_result.average_bet),
    final_average_bet = p_average_bet,  -- Record what was submitted at close
    pause_intervals = COALESCE(v_final_intervals, v_result.pause_intervals)
  WHERE id = p_rating_slip_id
  RETURNING * INTO v_result;

  -- Audit log (include final duration)
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating_slip',
    p_actor_id,
    'close',
    jsonb_build_object(
      'rating_slip_id', p_rating_slip_id,
      'duration_seconds', v_duration,
      'average_bet', COALESCE(p_average_bet, v_result.average_bet),
      'previous_status', v_result.status,
      'visit_id', v_result.visit_id
    )
  );

  RETURN QUERY SELECT v_result, v_duration;
END;
$$;

-- ============================================================================
-- Migration Completed
-- ============================================================================
-- All rating slip RPCs now self-inject RLS context within their transactions.
-- This ensures context persists across Supabase's transaction mode connection pooling.
--
-- Per ADR-015 Phase 1A (RPC self-injection pattern)
--
-- Next steps (Phase 3):
-- - Monitor for JWT vs. session variable consistency
-- - Once stable, migrate to JWT-only (Pattern A) by removing SET LOCAL
-- - Update service layer to stop passing redundant context parameters

COMMENT ON FUNCTION rpc_start_rating_slip IS 'ADR-015 Phase 1A: Self-injects RLS context via set_rls_context for connection pooling compatibility';
COMMENT ON FUNCTION rpc_pause_rating_slip IS 'ADR-015 Phase 1A: Self-injects RLS context via set_rls_context for connection pooling compatibility';
COMMENT ON FUNCTION rpc_resume_rating_slip IS 'ADR-015 Phase 1A: Self-injects RLS context via set_rls_context for connection pooling compatibility';
COMMENT ON FUNCTION rpc_close_rating_slip IS 'ADR-015 Phase 1A: Self-injects RLS context via set_rls_context for connection pooling compatibility';

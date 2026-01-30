-- =============================================================================
-- PERF-005 WS5: Inline final_duration_seconds in Close RPC
-- =============================================================================
-- Purpose: Eliminate redundant UPDATE after rpc_close_rating_slip.
--   Previously, crud.ts issued a SEPARATE UPDATE to persist final_duration_seconds
--   after the RPC returned. The RPC already has the v_duration value — just set it
--   in the existing UPDATE statement.
-- Saves: ~50-100ms per close operation (1 fewer database roundtrip).
-- ADR Reference: ADR-024 (authoritative context injection)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_close_rating_slip(
  p_casino_id uuid,
  p_rating_slip_id uuid,
  p_average_bet numeric DEFAULT NULL
) RETURNS TABLE(slip rating_slip, duration_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_actor_id uuid;
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_row record;
  v_result rating_slip;
  v_previous_status text;  -- FIX: Capture before UPDATE for accurate audit log
  v_duration INTEGER;
  v_current_pause_range tstzrange;
  v_final_intervals tstzrange[];
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Casino scope validation
  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot close rating slips', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

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

  -- FIX: Capture previous_status BEFORE any modifications for accurate audit log
  v_previous_status := v_result.status::text;

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
  -- PERF-005: Added final_duration_seconds = v_duration (was a separate UPDATE in crud.ts)
  UPDATE rating_slip
  SET
    status = 'closed',
    end_time = now(),
    duration_seconds = v_duration,
    final_duration_seconds = v_duration,
    average_bet = COALESCE(p_average_bet, v_result.average_bet),
    final_average_bet = p_average_bet,
    pause_intervals = COALESCE(v_final_intervals, v_result.pause_intervals)
  WHERE id = p_rating_slip_id
  RETURNING * INTO v_result;

  -- Audit log (FIX: Use v_previous_status captured before UPDATE)
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating_slip',
    v_context_actor_id,
    'close',
    jsonb_build_object(
      'rating_slip_id', p_rating_slip_id,
      'duration_seconds', v_duration,
      'average_bet', COALESCE(p_average_bet, v_result.average_bet),
      'previous_status', v_previous_status,
      'visit_id', v_result.visit_id
    )
  );

  RETURN QUERY SELECT v_result, v_duration;
END;
$$;

COMMENT ON FUNCTION rpc_close_rating_slip(uuid, uuid, numeric) IS
  'ADR-024 compliant: Uses set_rls_context_from_staff(). PERF-005: Inlines final_duration_seconds.';

NOTIFY pgrst, 'reload schema';

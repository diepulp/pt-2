-- EXEC-041 WS2: RatingSlip Validate-to-Derive (Phase A)
-- PRD-041: ADR-024 P2 Validate-to-Derive Remediation
--
-- Remove p_casino_id from 4 RatingSlip RPCs:
--   rpc_pause_rating_slip, rpc_resume_rating_slip,
--   rpc_close_rating_slip, rpc_move_player
--
-- Pattern: DROP old signature → CREATE new (derive v_casino_id from context)
-- search_path hardened to pg_catalog, public (no pg_temp)

BEGIN;

-- ============================================================================
-- 1. rpc_pause_rating_slip: Remove p_casino_id
-- Source: 20251231072655_adr024_security_definer_rpc_remediation.sql L843
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_pause_rating_slip(uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_pause_rating_slip(
  p_rating_slip_id uuid
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_casino_id uuid;
  v_result rating_slip;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context derivation (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Defense-in-depth: casino context must be available
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot pause rating slips', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- Lock and check state
  SELECT * INTO v_result
  FROM rating_slip
  WHERE id = p_rating_slip_id
  AND casino_id = v_casino_id
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
      tstzrange(now(), NULL)
    )
  WHERE id = p_rating_slip_id
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'rating_slip',
    v_context_actor_id,
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

COMMENT ON FUNCTION rpc_pause_rating_slip(uuid) IS
  'ADR-024 P2 compliant: Derives casino_id from context. No spoofable params.';

REVOKE ALL ON FUNCTION public.rpc_pause_rating_slip(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_pause_rating_slip(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_pause_rating_slip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_pause_rating_slip(uuid) TO service_role;

-- ============================================================================
-- 2. rpc_resume_rating_slip: Remove p_casino_id
-- Source: 20251231072655_adr024_security_definer_rpc_remediation.sql L1126
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_resume_rating_slip(uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_resume_rating_slip(
  p_rating_slip_id uuid
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_casino_id uuid;
  v_result rating_slip;
  v_pause_range tstzrange;
  v_updated_intervals tstzrange[];
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context derivation (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Defense-in-depth: casino context must be available
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot resume rating slips', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- Lock and check state
  SELECT * INTO v_result
  FROM rating_slip
  WHERE id = p_rating_slip_id
  AND casino_id = v_casino_id
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
    v_pause_range := v_result.pause_intervals[array_length(v_result.pause_intervals, 1)];

    v_updated_intervals := v_result.pause_intervals;
    v_updated_intervals[array_length(v_updated_intervals, 1)] :=
      tstzrange(lower(v_pause_range), now());

    UPDATE rating_slip
    SET
      status = 'open',
      pause_intervals = v_updated_intervals
    WHERE id = p_rating_slip_id
    RETURNING * INTO v_result;

  ELSE
    RAISE EXCEPTION 'PAUSE_INTERVAL_NOT_FOUND: No pause intervals found for paused slip %', p_rating_slip_id;
  END IF;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'rating_slip',
    v_context_actor_id,
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

COMMENT ON FUNCTION rpc_resume_rating_slip(uuid) IS
  'ADR-024 P2 compliant: Derives casino_id from context. No spoofable params.';

REVOKE ALL ON FUNCTION public.rpc_resume_rating_slip(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_resume_rating_slip(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_resume_rating_slip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_resume_rating_slip(uuid) TO service_role;

-- ============================================================================
-- 3. rpc_close_rating_slip: Remove p_casino_id
-- Source: 20260129100000_perf005_close_rpc_inline_duration.sql
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_close_rating_slip(uuid, uuid, numeric);

CREATE OR REPLACE FUNCTION public.rpc_close_rating_slip(
  p_rating_slip_id uuid,
  p_average_bet numeric DEFAULT NULL
) RETURNS TABLE(slip rating_slip, duration_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_casino_id uuid;
  v_row record;
  v_result rating_slip;
  v_previous_status text;  -- FIX: Capture before UPDATE for accurate audit log
  v_duration INTEGER;
  v_current_pause_range tstzrange;
  v_final_intervals tstzrange[];
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context derivation (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Defense-in-depth: casino context must be available
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
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
  AND casino_id = v_casino_id
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
    v_casino_id,
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

COMMENT ON FUNCTION rpc_close_rating_slip(uuid, numeric) IS
  'ADR-024 P2 compliant: Derives casino_id from context. PERF-005: Inlines final_duration_seconds.';

REVOKE ALL ON FUNCTION public.rpc_close_rating_slip(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_close_rating_slip(uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_close_rating_slip(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_close_rating_slip(uuid, numeric) TO service_role;

-- ============================================================================
-- 4. rpc_move_player: Remove p_casino_id
-- Source: 20260114022828_add_seat_number_validation.sql L22
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_move_player(uuid, uuid, uuid, text, numeric);

CREATE OR REPLACE FUNCTION public.rpc_move_player(
  p_slip_id uuid,
  p_new_table_id uuid,
  p_new_seat_number text DEFAULT NULL,
  p_average_bet numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_current_slip rating_slip;
  v_closed_slip rating_slip;
  v_new_slip rating_slip;
  v_source_table_id UUID;
  v_duration INTEGER;
  v_move_group_id UUID;
  v_accumulated_seconds INTEGER;
  v_source_seats TEXT[];
  v_dest_seats TEXT[];
  v_policy_snapshot JSONB;
  v_game_settings_jsonb JSONB;
  v_dest_table_type text;
  v_house_edge NUMERIC;
  v_decisions_per_hour INTEGER;
  v_points_conversion_rate NUMERIC;
  v_point_multiplier NUMERIC;
  v_min_bet NUMERIC;
  v_max_bet NUMERIC;
  v_seats_available INTEGER;
  v_seat_as_int INTEGER;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context derivation (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Defense-in-depth: casino context must be available
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot move players', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- 1. LOCK AND VALIDATE CURRENT SLIP
  SELECT * INTO v_current_slip
  FROM rating_slip
  WHERE id = p_slip_id AND casino_id = v_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_slip.status = 'closed' THEN
    RAISE EXCEPTION 'RATING_SLIP_ALREADY_CLOSED' USING ERRCODE = 'P0003';
  END IF;

  v_source_table_id := v_current_slip.table_id;

  -- =======================================================================
  -- 2. VALIDATE DESTINATION SEAT (Range validation)
  -- =======================================================================
  IF p_new_seat_number IS NOT NULL THEN
    -- 2a. Validate seat number is a positive integer
    BEGIN
      v_seat_as_int := p_new_seat_number::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_SEAT_NUMBER: Seat must be a positive integer, got "%"', p_new_seat_number
        USING ERRCODE = 'P0005';
    END;

    IF v_seat_as_int <= 0 THEN
      RAISE EXCEPTION 'INVALID_SEAT_NUMBER: Seat must be a positive integer, got "%"', p_new_seat_number
        USING ERRCODE = 'P0005';
    END IF;

    -- 2b. Get destination table's game type
    SELECT gt.type INTO v_dest_table_type
    FROM gaming_table gt
    WHERE gt.id = p_new_table_id AND gt.casino_id = v_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'TABLE_NOT_FOUND: Destination table % not found', p_new_table_id
        USING ERRCODE = 'P0006';
    END IF;

    -- 2c. Get seats_available from game_settings for this table type
    SELECT gs.seats_available INTO v_seats_available
    FROM game_settings gs
    WHERE gs.casino_id = v_casino_id AND gs.game_type = v_dest_table_type::game_type
    LIMIT 1;

    -- Default to 7 if no game_settings found (standard blackjack table)
    v_seats_available := COALESCE(v_seats_available, 7);

    -- 2d. Validate seat is within valid range
    IF v_seat_as_int > v_seats_available THEN
      RAISE EXCEPTION 'SEAT_OUT_OF_RANGE: Seat % exceeds maximum % for this table', v_seat_as_int, v_seats_available
        USING ERRCODE = 'P0007';
    END IF;

    -- 2e. Check seat is not already occupied (compare normalized seat number)
    IF EXISTS (
      SELECT 1 FROM rating_slip
      WHERE table_id = p_new_table_id
        AND seat_number = v_seat_as_int::TEXT
        AND status IN ('open', 'paused')
        AND casino_id = v_casino_id
    ) THEN
      RAISE EXCEPTION 'SEAT_OCCUPIED' USING ERRCODE = 'P0004';
    END IF;

    -- Normalize seat number to integer string (strips leading zeros)
    p_new_seat_number := v_seat_as_int::TEXT;
  END IF;

  -- 3. CLOSE CURRENT SLIP WITH DURATION CALCULATION
  v_duration := EXTRACT(EPOCH FROM (now() - v_current_slip.start_time))::INTEGER;

  -- Build policy_snapshot for the NEW slip (inherited from current slip or freshly captured)
  -- Get destination table type for game settings lookup
  SELECT gt.type::text INTO v_dest_table_type
  FROM gaming_table gt
  WHERE gt.id = p_new_table_id AND gt.casino_id = v_casino_id;

  -- Get game settings for destination table
  SELECT
    gs.house_edge,
    gs.decisions_per_hour,
    gs.points_conversion_rate,
    gs.point_multiplier,
    gs.min_bet,
    gs.max_bet,
    gs.seats_available
  INTO
    v_house_edge,
    v_decisions_per_hour,
    v_points_conversion_rate,
    v_point_multiplier,
    v_min_bet,
    v_max_bet,
    v_seats_available
  FROM game_settings gs
  WHERE gs.casino_id = v_casino_id
    AND gs.game_type = v_dest_table_type::game_type
  LIMIT 1;

  -- Build game_settings JSONB
  v_game_settings_jsonb := jsonb_build_object(
    'game_type', v_dest_table_type,
    'house_edge', COALESCE(v_house_edge, 1.5),
    'decisions_per_hour', COALESCE(v_decisions_per_hour, 70),
    'min_bet', COALESCE(v_min_bet, 5),
    'max_bet', COALESCE(v_max_bet, 500)
  );

  -- Build policy_snapshot JSONB (for loyalty calculations on new slip)
  v_policy_snapshot := jsonb_build_object(
    'loyalty', jsonb_build_object(
      'house_edge', COALESCE(v_house_edge, 1.5),
      'decisions_per_hour', COALESCE(v_decisions_per_hour, 70),
      'points_conversion_rate', COALESCE(v_points_conversion_rate, 10),
      'point_multiplier', COALESCE(v_point_multiplier, 1),
      'policy_version', 'v2024.1'
    )
  );

  UPDATE rating_slip SET
    status = 'closed',
    end_time = now(),
    duration_seconds = v_duration,
    final_duration_seconds = v_duration,
    average_bet = COALESCE(p_average_bet, v_current_slip.average_bet),
    final_average_bet = COALESCE(p_average_bet, v_current_slip.average_bet)
  WHERE id = p_slip_id
  RETURNING * INTO v_closed_slip;

  -- 4. CREATE NEW SLIP AT DESTINATION WITH CONTINUITY METADATA
  v_move_group_id := COALESCE(v_current_slip.move_group_id, v_current_slip.id);
  v_accumulated_seconds := COALESCE(v_current_slip.accumulated_seconds, 0) + v_duration;

  INSERT INTO rating_slip (
    casino_id, visit_id, table_id, seat_number, status, start_time,
    previous_slip_id, move_group_id, accumulated_seconds, average_bet,
    game_settings, policy_snapshot
  ) VALUES (
    v_casino_id,
    v_current_slip.visit_id,
    p_new_table_id,
    p_new_seat_number,
    'open',
    now(),
    p_slip_id,
    v_move_group_id,
    v_accumulated_seconds,
    p_average_bet,
    v_game_settings_jsonb,
    v_policy_snapshot
  )
  RETURNING * INTO v_new_slip;

  -- 5. GET UPDATED SEAT OCCUPANCY FOR BOTH TABLES
  SELECT ARRAY_AGG(seat_number ORDER BY seat_number) INTO v_source_seats
  FROM rating_slip
  WHERE table_id = v_source_table_id
    AND status IN ('open', 'paused')
    AND casino_id = v_casino_id
    AND seat_number IS NOT NULL;

  SELECT ARRAY_AGG(seat_number ORDER BY seat_number) INTO v_dest_seats
  FROM rating_slip
  WHERE table_id = p_new_table_id
    AND status IN ('open', 'paused')
    AND casino_id = v_casino_id
    AND seat_number IS NOT NULL;

  -- 6. AUDIT LOG
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (v_casino_id, 'rating_slip', v_context_actor_id, 'move', jsonb_build_object(
    'from_slip_id', p_slip_id,
    'to_slip_id', v_new_slip.id,
    'from_table_id', v_source_table_id,
    'to_table_id', p_new_table_id,
    'from_seat_number', v_current_slip.seat_number,
    'to_seat_number', p_new_seat_number,
    'accumulated_seconds', v_accumulated_seconds
  ));

  -- 7. RETURN ENHANCED RESPONSE
  RETURN jsonb_build_object(
    'closedSlipId', v_closed_slip.id,
    'newSlipId', v_new_slip.id,
    'moveGroupId', v_move_group_id,
    'accumulatedSeconds', v_accumulated_seconds,
    'sourceTableId', v_source_table_id,
    'sourceTableSeats', COALESCE(v_source_seats, ARRAY[]::TEXT[]),
    'destinationTableSeats', COALESCE(v_dest_seats, ARRAY[]::TEXT[]),
    'newSlip', jsonb_build_object(
      'id', v_new_slip.id,
      'tableId', v_new_slip.table_id,
      'seatNumber', v_new_slip.seat_number,
      'status', v_new_slip.status,
      'startTime', v_new_slip.start_time
    )
  );
END;
$$;

COMMENT ON FUNCTION rpc_move_player(uuid, uuid, text, numeric) IS
  'ADR-024 P2 compliant: Derives casino_id from context. PRD-020 move with seat validation.';

REVOKE ALL ON FUNCTION public.rpc_move_player(uuid, uuid, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_move_player(uuid, uuid, text, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_move_player(uuid, uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_move_player(uuid, uuid, text, numeric) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ADR-039 D3: Materialize computed_theo_cents in all slip-closing RPCs
-- Bounded context: RatingSlipService (Telemetry)
-- DA P0-1 fix: CHECK constraint in same migration as RPC updates (not before)
-- DA P0-2 fix: All 3 slip-closing RPCs updated

-- ============================================================
-- RPC 1: rpc_close_rating_slip — primary close path
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_close_rating_slip(
  p_rating_slip_id uuid,
  p_average_bet numeric DEFAULT NULL
) RETURNS TABLE(slip rating_slip, duration_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_casino_id uuid;
  v_row record;
  v_result rating_slip;
  v_previous_status text;
  v_duration INTEGER;
  v_current_pause_range tstzrange;
  v_final_intervals tstzrange[];
  -- ADR-039 D3: Theo computation
  v_loyalty_snapshot jsonb;
  v_theo numeric;
  v_computed_theo_cents bigint := 0;
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

  -- =======================================================================
  -- ADR-039 D3: Compute theo before UPDATE
  -- DA P1-2 fix: exception handler prevents malformed snapshots from blocking close
  -- =======================================================================
  v_loyalty_snapshot := v_result.policy_snapshot->'loyalty';
  IF v_loyalty_snapshot IS NOT NULL THEN
    BEGIN
      v_result.average_bet := COALESCE(p_average_bet, v_result.average_bet);
      v_result.duration_seconds := v_duration;
      v_theo := calculate_theo_from_snapshot(v_result, v_loyalty_snapshot);
      v_computed_theo_cents := GREATEST((v_theo * 100)::bigint, 0);
    EXCEPTION WHEN OTHERS THEN
      -- Malformed snapshot must not block slip close; default to 0
      v_computed_theo_cents := 0;
    END;
  ELSE
    v_computed_theo_cents := 0;
  END IF;
  -- NOTE: Defaulting to 0 preserves write-path availability but can mask data-quality issues.
  -- Surface via discrepancy query: WHERE status='closed' AND computed_theo_cents=0 AND duration_seconds>0
  -- =======================================================================

  -- Update slip to closed state
  UPDATE rating_slip
  SET
    status = 'closed',
    end_time = now(),
    duration_seconds = v_duration,
    final_duration_seconds = v_duration,
    average_bet = COALESCE(p_average_bet, v_result.average_bet),
    final_average_bet = p_average_bet,
    pause_intervals = COALESCE(v_final_intervals, v_result.pause_intervals),
    computed_theo_cents = v_computed_theo_cents
  WHERE id = p_rating_slip_id
  RETURNING * INTO v_result;

  -- Audit log
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
      'visit_id', v_result.visit_id,
      'computed_theo_cents', v_computed_theo_cents
    )
  );

  RETURN QUERY SELECT v_result, v_duration;
END;
$$;

COMMENT ON FUNCTION rpc_close_rating_slip(uuid, numeric) IS
  'ADR-024 P2 compliant. ADR-039 D3: materializes computed_theo_cents at close.';

REVOKE ALL ON FUNCTION public.rpc_close_rating_slip(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_close_rating_slip(uuid, numeric) TO authenticated;

-- ============================================================
-- RPC 2: rpc_move_player — closes source slip on table move
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_move_player(
  p_slip_id uuid,
  p_new_table_id uuid,
  p_new_seat_number text DEFAULT NULL,
  p_average_bet numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  -- ADR-039 D3: Theo computation
  v_loyalty_snapshot jsonb;
  v_theo numeric;
  v_computed_theo_cents bigint := 0;
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

  -- =======================================================================
  -- ADR-039 D3: Compute theo for SOURCE slip before closing
  -- Uses v_current_slip (not v_result) — this is the source slip being closed
  -- =======================================================================
  v_loyalty_snapshot := v_current_slip.policy_snapshot->'loyalty';
  IF v_loyalty_snapshot IS NOT NULL THEN
    BEGIN
      v_current_slip.average_bet := COALESCE(p_average_bet, v_current_slip.average_bet);
      v_current_slip.duration_seconds := v_duration;
      v_theo := calculate_theo_from_snapshot(v_current_slip, v_loyalty_snapshot);
      v_computed_theo_cents := GREATEST((v_theo * 100)::bigint, 0);
    EXCEPTION WHEN OTHERS THEN
      v_computed_theo_cents := 0;
    END;
  ELSE
    v_computed_theo_cents := 0;
  END IF;
  -- =======================================================================

  UPDATE rating_slip SET
    status = 'closed',
    end_time = now(),
    duration_seconds = v_duration,
    final_duration_seconds = v_duration,
    average_bet = COALESCE(p_average_bet, v_current_slip.average_bet),
    final_average_bet = COALESCE(p_average_bet, v_current_slip.average_bet),
    computed_theo_cents = v_computed_theo_cents
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
    'accumulated_seconds', v_accumulated_seconds,
    'computed_theo_cents', v_computed_theo_cents
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
  'ADR-024 P2 compliant. ADR-039 D3: materializes computed_theo_cents on source slip close.';

REVOKE ALL ON FUNCTION public.rpc_move_player(uuid, uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_move_player(uuid, uuid, text, numeric) TO authenticated;

-- ============================================================
-- RPC 3: rpc_start_or_resume_visit — stale slip closure on gaming day rollover
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_start_or_resume_visit(
  p_player_id uuid
) RETURNS TABLE(
  visit public.visit,
  is_new boolean,
  resumed boolean,
  gaming_day date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_gaming_day date;
  v_existing public.visit;
  v_stale_group uuid;
  v_stale_visit_ids uuid[];
  v_closed_slip_count int := 0;
BEGIN
  -- =========================================================================
  -- STEP 1: Context Injection (ADR-024 Required)
  -- =========================================================================
  PERFORM set_rls_context_from_staff();

  -- =========================================================================
  -- STEP 2: Derive Context (NOT from parameters - ADR-024 INV-8)
  -- =========================================================================
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set (app.casino_id required)';
  END IF;

  -- =========================================================================
  -- STEP 3: Compute Gaming Day (canonical timezone-aware RPC - INV-1)
  -- =========================================================================
  v_gaming_day := compute_gaming_day(v_casino_id, now());

  -- =========================================================================
  -- STEP 4: Check for existing active visit for this gaming day
  -- =========================================================================
  SELECT * INTO v_existing
    FROM public.visit v
   WHERE v.casino_id = v_casino_id
     AND v.player_id = p_player_id
     AND v.gaming_day = v_gaming_day
     AND v.ended_at IS NULL
   LIMIT 1;

  IF FOUND THEN
    visit := v_existing;
    is_new := false;
    resumed := true;
    gaming_day := v_gaming_day;
    RETURN NEXT;
    RETURN;
  END IF;

  -- =========================================================================
  -- STEP 5: Close stale active visits from prior gaming days (INV-4)
  -- =========================================================================
  SELECT v.visit_group_id, ARRAY_AGG(v.id)
    INTO v_stale_group, v_stale_visit_ids
    FROM public.visit v
   WHERE v.casino_id = v_casino_id
     AND v.player_id = p_player_id
     AND v.ended_at IS NULL
     AND v.gaming_day <> v_gaming_day
   GROUP BY v.visit_group_id
   ORDER BY MAX(v.started_at) DESC
   LIMIT 1;

  -- =========================================================================
  -- STEP 6: Close rating slips for stale visits (INV-6)
  -- ADR-039 D3: Stale slips get computed_theo_cents = 0 (abandoned, no meaningful theo)
  -- =========================================================================
  IF v_stale_visit_ids IS NOT NULL AND array_length(v_stale_visit_ids, 1) > 0 THEN
    WITH closed_slips AS (
      UPDATE public.rating_slip rs
         SET status = 'closed',
             end_time = now(),
             -- Stale slips: computed_theo_cents = 0 (abandoned, no meaningful theo)
             computed_theo_cents = 0
       WHERE rs.casino_id = v_casino_id
         AND rs.status IN ('open', 'paused')
         AND rs.visit_id = ANY(v_stale_visit_ids)
       RETURNING rs.id
    )
    SELECT COUNT(*) INTO v_closed_slip_count FROM closed_slips;

    -- Close the stale visits
    UPDATE public.visit
       SET ended_at = now()
     WHERE id = ANY(v_stale_visit_ids);
  END IF;

  -- =========================================================================
  -- STEP 7: Create new visit (race safe via unique index)
  -- =========================================================================
  BEGIN
    INSERT INTO public.visit (
      casino_id,
      player_id,
      started_at,
      gaming_day,
      visit_group_id
    )
    VALUES (
      v_casino_id,
      p_player_id,
      now(),
      v_gaming_day,
      COALESCE(v_stale_group, gen_random_uuid())
    )
    RETURNING * INTO v_existing;

  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing
      FROM public.visit v
     WHERE v.casino_id = v_casino_id
       AND v.player_id = p_player_id
       AND v.gaming_day = v_gaming_day
       AND v.ended_at IS NULL
     LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RACE_CONDITION: Could not create or find visit after unique_violation';
    END IF;

    visit := v_existing;
    is_new := false;
    resumed := true;
    gaming_day := v_gaming_day;
    RETURN NEXT;
    RETURN;
  END;

  -- =========================================================================
  -- STEP 8: Write audit log for rollover
  -- =========================================================================
  IF v_stale_visit_ids IS NOT NULL AND array_length(v_stale_visit_ids, 1) > 0 THEN
    INSERT INTO public.audit_log (
      casino_id,
      actor_id,
      action,
      domain,
      details
    )
    VALUES (
      v_casino_id,
      v_actor_id,
      'visit_rollover',
      'visit',
      jsonb_build_object(
        'gaming_day', v_gaming_day,
        'new_visit_id', v_existing.id,
        'closed_visit_ids', v_stale_visit_ids,
        'closed_slip_count', v_closed_slip_count
      )
    );
  END IF;

  -- Return new visit
  visit := v_existing;
  is_new := true;
  resumed := false;
  gaming_day := v_gaming_day;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.rpc_start_or_resume_visit(uuid) IS
  'ADR-026: Start/resume visit. ADR-039 D3: stale slips get computed_theo_cents=0.';

GRANT EXECUTE ON FUNCTION public.rpc_start_or_resume_visit(uuid) TO authenticated;

-- ============================================================
-- CHECK constraint: enforce computed_theo_cents on closed slips
-- Added AFTER all RPCs are updated (DA P0-1 fix)
-- NOT VALID: enforces on new rows only; existing closed slips without theo are allowed
-- ============================================================
ALTER TABLE rating_slip
  ADD CONSTRAINT chk_closed_slip_has_theo
  CHECK (status::text != 'closed' OR computed_theo_cents IS NOT NULL)
  NOT VALID;

NOTIFY pgrst, 'reload schema';

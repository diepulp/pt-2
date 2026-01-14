-- ============================================================================
-- Migration: Add Seat Number Validation
-- ============================================================================
-- Purpose: Fix bug allowing invalid seat numbers (e.g., "02", "99" on 7-seat table)
-- Issue: Players could be seated at non-existent seats (ISSUE-SEAT-VALIDATION)
--
-- Changes:
-- 1. rpc_move_player: Add validation that seat number is within 1-seats_available
-- 2. rpc_get_rating_slip_modal_data: Add seatsAvailable to table options for client-side validation
--
-- Security: Uses existing game_settings.seats_available for validation
-- ============================================================================

-- ============================================================================
-- 1. UPDATE rpc_move_player WITH SEAT RANGE VALIDATION
-- ============================================================================
-- Adds validation that the destination seat number is:
-- - A positive integer
-- - Within the range 1 to seats_available for the destination table's game type
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_move_player(
  p_casino_id uuid,
  p_slip_id uuid,
  p_new_table_id uuid,
  p_new_seat_number text DEFAULT NULL,
  p_average_bet numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_casino_id uuid;
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
  WHERE id = p_slip_id AND casino_id = p_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_slip.status = 'closed' THEN
    RAISE EXCEPTION 'RATING_SLIP_ALREADY_CLOSED' USING ERRCODE = 'P0003';
  END IF;

  v_source_table_id := v_current_slip.table_id;

  -- =======================================================================
  -- 2. VALIDATE DESTINATION SEAT (NEW: Range validation)
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
    WHERE gt.id = p_new_table_id AND gt.casino_id = p_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'TABLE_NOT_FOUND: Destination table % not found', p_new_table_id
        USING ERRCODE = 'P0006';
    END IF;

    -- 2c. Get seats_available from game_settings for this table type
    SELECT gs.seats_available INTO v_seats_available
    FROM game_settings gs
    WHERE gs.casino_id = p_casino_id AND gs.game_type = v_dest_table_type::game_type
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
        AND casino_id = p_casino_id
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
  WHERE gt.id = p_new_table_id AND gt.casino_id = p_casino_id;

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
  WHERE gs.casino_id = p_casino_id
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
    p_casino_id,
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
    AND casino_id = p_casino_id
    AND seat_number IS NOT NULL;

  SELECT ARRAY_AGG(seat_number ORDER BY seat_number) INTO v_dest_seats
  FROM rating_slip
  WHERE table_id = p_new_table_id
    AND status IN ('open', 'paused')
    AND casino_id = p_casino_id
    AND seat_number IS NOT NULL;

  -- 6. AUDIT LOG
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (p_casino_id, 'rating_slip', v_context_actor_id, 'move', jsonb_build_object(
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

COMMENT ON FUNCTION rpc_move_player(uuid, uuid, uuid, text, numeric) IS
  'PRD-020: Consolidated move player operation with seat validation. Validates seat is within 1-seats_available range.';

-- ============================================================================
-- 2. UPDATE rpc_get_rating_slip_modal_data TO INCLUDE seatsAvailable
-- ============================================================================
-- Adds seatsAvailable to the tables array for client-side validation
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_get_rating_slip_modal_data(
  p_slip_id uuid,
  p_casino_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_context_actor_id uuid;
  v_slip record;
  v_visit record;
  v_table record;
  v_player record;
  v_loyalty record;
  v_financial record;
  v_active_tables jsonb;
  v_duration_seconds numeric;
  v_gaming_day text;
  v_loyalty_snapshot jsonb;
  v_theo numeric;
  v_suggested_points int;
  v_loyalty_suggestion jsonb;
  v_pauses jsonb;
  v_result jsonb;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- ADR-015 Phase 1A: RLS Context Self-Injection
  -- Required for Supabase transaction pooling (port 6543) where SET LOCAL
  -- context is lost between transactions. Re-inject context at RPC start.
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  v_context_actor_id := COALESCE(
    NULLIF(current_setting('app.actor_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
  );

  -- Self-inject context (required for transaction pooling)
  -- ADR-024: Use set_rls_context_from_staff() - derives context from auth.uid()
  PERFORM set_rls_context_from_staff();

  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Casino scope validation (defense in depth)
  -- Although SECURITY INVOKER inherits RLS, we validate p_casino_id matches
  -- the caller's context to prevent accidental cross-tenant queries.
  -- ADR-015 Pattern C (Hybrid): Session context with JWT fallback
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not set (app.casino_id required)';
  END IF;

  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH: Caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 1. FETCH RATING SLIP WITH PAUSE HISTORY
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT
    rs.id,
    rs.visit_id,
    rs.table_id,
    rs.seat_number,
    rs.average_bet,
    rs.start_time,
    rs.end_time,
    rs.status,
    rs.policy_snapshot,
    rs.duration_seconds AS stored_duration_seconds
  INTO v_slip
  FROM rating_slip rs
  WHERE rs.id = p_slip_id
    AND rs.casino_id = p_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND: Rating slip % not found', p_slip_id;
  END IF;

  -- Fetch pause history separately for JSONB aggregation
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', rsp.id,
        'pausedAt', rsp.started_at,
        'resumedAt', rsp.ended_at,
        'reason', NULL  -- rating_slip_pause doesn't have reason column
      ) ORDER BY rsp.started_at
    ) FILTER (WHERE rsp.id IS NOT NULL),
    '[]'::jsonb
  )
  INTO v_pauses
  FROM rating_slip_pause rsp
  WHERE rsp.rating_slip_id = p_slip_id
    AND rsp.casino_id = p_casino_id;

  -- Calculate duration (inline rpc_get_rating_slip_duration logic)
  -- Use stored duration_seconds if closed, otherwise calculate dynamically
  IF v_slip.status = 'closed' AND v_slip.stored_duration_seconds IS NOT NULL THEN
    v_duration_seconds := v_slip.stored_duration_seconds;
  ELSE
    -- Calculate paused time from pause records
    v_duration_seconds := EXTRACT(EPOCH FROM (
      COALESCE(v_slip.end_time, now()) - v_slip.start_time
    )) - COALESCE(
      (SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(rsp.ended_at, now()) - rsp.started_at)))
       FROM rating_slip_pause rsp
       WHERE rsp.rating_slip_id = p_slip_id
         AND rsp.casino_id = p_casino_id),
      0
    );
    -- Never return negative duration
    IF v_duration_seconds < 0 THEN
      v_duration_seconds := 0;
    END IF;
  END IF;

  -- Extract gaming day from start_time
  v_gaming_day := (v_slip.start_time::date)::text;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 2. FETCH VISIT AND PLAYER
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT
    v.id AS visit_id,
    v.player_id,
    p.first_name,
    p.last_name
  INTO v_visit
  FROM visit v
  LEFT JOIN player p ON p.id = v.player_id
  WHERE v.id = v_slip.visit_id
    AND v.casino_id = p_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_FOUND: Visit % not found', v_slip.visit_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 3. FETCH TABLE DETAILS
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT
    gt.id,
    gt.label,
    gt.type
  INTO v_table
  FROM gaming_table gt
  WHERE gt.id = v_slip.table_id
    AND gt.casino_id = p_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Gaming table % not found', v_slip.table_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 4. FETCH LOYALTY BALANCE AND SUGGESTION
  -- ═══════════════════════════════════════════════════════════════════════
  v_loyalty := NULL;
  v_loyalty_suggestion := NULL;

  IF v_visit.player_id IS NOT NULL THEN
    -- Fetch loyalty balance
    SELECT
      pl.current_balance,
      pl.tier
    INTO v_loyalty
    FROM player_loyalty pl
    WHERE pl.player_id = v_visit.player_id
      AND pl.casino_id = p_casino_id;

    -- Calculate loyalty suggestion for open slips
    v_loyalty_snapshot := v_slip.policy_snapshot -> 'loyalty';

    IF v_slip.status = 'open' AND v_loyalty_snapshot IS NOT NULL THEN
      v_theo := (
        COALESCE((v_loyalty_snapshot ->> 'avg_bet')::numeric, v_slip.average_bet, 0) *
        (COALESCE((v_loyalty_snapshot ->> 'house_edge')::numeric, 0) / 100.0) *
        (COALESCE(v_duration_seconds, 0) / 3600.0) *
        COALESCE((v_loyalty_snapshot ->> 'decisions_per_hour')::numeric, 60)
      );

      IF v_theo < 0 THEN
        v_theo := 0;
      END IF;

      v_suggested_points := ROUND(v_theo * COALESCE((v_loyalty_snapshot ->> 'points_conversion_rate')::numeric, 0));

      IF v_suggested_points < 0 THEN
        v_suggested_points := 0;
      END IF;

      v_loyalty_suggestion := jsonb_build_object(
        'suggestedPoints', v_suggested_points,
        'suggestedTheo', v_theo,
        'policyVersion', COALESCE(v_loyalty_snapshot ->> 'policy_version', 'unknown')
      );
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 5. AGGREGATE FINANCIAL SUMMARY
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT
    COALESCE(SUM(pft.amount) FILTER (WHERE pft.direction = 'in'), 0) AS total_in,
    COALESCE(SUM(pft.amount) FILTER (WHERE pft.direction = 'out'), 0) AS total_out,
    COALESCE(
      SUM(pft.amount) FILTER (WHERE pft.direction = 'in') -
      SUM(pft.amount) FILTER (WHERE pft.direction = 'out'),
      0
    ) AS net_amount
  INTO v_financial
  FROM player_financial_transaction pft
  WHERE pft.visit_id = v_slip.visit_id
    AND pft.casino_id = p_casino_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 6. FETCH ACTIVE TABLES WITH OCCUPIED SEATS AND SEATS AVAILABLE (BATCH)
  -- ═══════════════════════════════════════════════════════════════════════
  -- FIX: Added seatsAvailable from game_settings for client-side validation
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'label', t.label,
      'type', t.type,
      'status', t.status,
      'occupiedSeats', t.occupied_seats,
      'seatsAvailable', t.seats_available
    ) ORDER BY t.label
  ), '[]'::jsonb)
  INTO v_active_tables
  FROM (
    SELECT
      gt.id,
      gt.label,
      gt.type,
      gt.status,
      COALESCE(
        jsonb_agg(rs.seat_number ORDER BY rs.seat_number)
        FILTER (WHERE rs.seat_number IS NOT NULL AND rs.status IN ('open', 'paused')),
        '[]'::jsonb
      ) AS occupied_seats,
      COALESCE(gs.seats_available, 7) AS seats_available
    FROM gaming_table gt
    LEFT JOIN rating_slip rs ON rs.table_id = gt.id
      AND rs.status IN ('open', 'paused')
      AND rs.casino_id = p_casino_id
    LEFT JOIN game_settings gs ON gs.casino_id = p_casino_id AND gs.game_type = gt.type
    WHERE gt.casino_id = p_casino_id
      AND gt.status = 'active'
    GROUP BY gt.id, gt.label, gt.type, gt.status, gs.seats_available
  ) t;

  -- ═══════════════════════════════════════════════════════════════════════
  -- BUILD FINAL RESPONSE DTO
  -- ═══════════════════════════════════════════════════════════════════════
  v_result := jsonb_build_object(
    'slip', jsonb_build_object(
      'id', v_slip.id,
      'visitId', v_slip.visit_id,
      'tableId', v_slip.table_id,
      'tableLabel', v_table.label,
      'tableType', v_table.type,
      'seatNumber', v_slip.seat_number,
      'averageBet', COALESCE(v_slip.average_bet, 0),
      'startTime', v_slip.start_time,
      'endTime', v_slip.end_time,
      'status', v_slip.status,
      'gamingDay', v_gaming_day,
      'durationSeconds', ROUND(v_duration_seconds)
    ),
    'player', CASE
      WHEN v_visit.player_id IS NOT NULL THEN
        jsonb_build_object(
          'id', v_visit.player_id,
          'firstName', v_visit.first_name,
          'lastName', v_visit.last_name,
          'cardNumber', NULL
        )
      ELSE NULL
    END,
    'loyalty', CASE
      WHEN v_loyalty IS NOT NULL THEN
        jsonb_build_object(
          'currentBalance', COALESCE(v_loyalty.current_balance, 0),
          'tier', v_loyalty.tier,
          'suggestion', v_loyalty_suggestion
        )
      WHEN v_visit.player_id IS NOT NULL THEN
        jsonb_build_object(
          'currentBalance', 0,
          'tier', NULL,
          'suggestion', v_loyalty_suggestion
        )
      ELSE NULL
    END,
    'financial', jsonb_build_object(
      'totalCashIn', COALESCE(v_financial.total_in, 0),
      'totalChipsOut', COALESCE(v_financial.total_out, 0),
      'netPosition', COALESCE(v_financial.net_amount, 0)
    ),
    'tables', v_active_tables
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_get_rating_slip_modal_data(uuid, uuid) IS
  'BFF RPC: Single round trip aggregation for rating slip modal display. Now includes seatsAvailable in tables array for client-side validation.';

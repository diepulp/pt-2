-- ============================================================================
-- Migration: GAP-EXCL-ENFORCE-001 — Exclusion Enforcement Wiring
-- Created: 2026-03-29
-- EXEC-SPEC: EXEC-055-exclusion-enforcement-wiring.md
-- Purpose: Wire exclusion enforcement into activity-creating RPCs and add
--          auto-close behavior to rpc_create_player_exclusion on hard_block.
--
-- Changes:
--   1. rpc_start_rating_slip: add exclusion guard (v_player_id already available)
--   2. rpc_resume_rating_slip: derive v_player_id from visit, add exclusion guard
--   3. rpc_move_player: derive v_player_id from visit, add exclusion guard
--   4. rpc_create_player_exclusion: auto-close visits + slips on hard_block,
--      audit trail for forced closures
--   5. REVOKE get_player_exclusion_status from public/anon/authenticated
--      (defense-in-depth — internal helper only)
--
-- ADR References:
--   ADR-018: SECURITY DEFINER governance
--   ADR-024: Authoritative context derivation (INV-8)
--   ADR-030: Auth pipeline hardening (D4: session-var-only writes)
--   ADR-039 D3: computed_theo_cents = 0 for forced closures
--
-- Baselines:
--   rpc_start_rating_slip:      20260318131945_snapshot_rounding_policy.sql
--   rpc_resume_rating_slip:     20260303193305_prd041_phase_a_ratingslip_derive.sql
--   rpc_move_player:            20260307114918_adr039_close_slip_materialize_theo.sql
--   rpc_create_player_exclusion: 20260328132317_add_exclusion_write_rpcs.sql
-- ============================================================================


-- ============================================================================
-- 1. rpc_start_rating_slip — add exclusion guard
-- Baseline: 20260318131945 (4-param, v_player_id already derived from visit)
-- Change: Insert exclusion check after visit lookup, before table validation
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_start_rating_slip(
  p_visit_id UUID,
  p_table_id UUID,
  p_seat_number TEXT,
  p_game_settings JSONB
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_context_actor_id uuid;
  v_result rating_slip;
  v_player_id UUID;
  v_visit_kind visit_kind;
  v_accrual_kind text;
  v_policy_snapshot JSONB;
  v_game_settings_lookup RECORD;
BEGIN
  -- ADR-024: Authoritative RLS Context Injection
  PERFORM set_rls_context_from_staff();

  -- Derive casino_id from authoritative context (no parameter — ADR-024)
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id not set in RLS context';
  END IF;

  -- Derive actor_id from authoritative context (ADR-024)
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate visit is open and get player_id + visit_kind
  SELECT player_id, visit_kind INTO v_player_id, v_visit_kind
  FROM visit
  WHERE id = p_visit_id
    AND casino_id = v_casino_id
    AND ended_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_OPEN: Visit % is not active', p_visit_id;
  END IF;

  -- =====================================================================
  -- GAP-EXCL-ENFORCE-001: Exclusion enforcement
  -- Only hard_block is rejected. soft_alert/monitor pass through.
  -- Ghost visits (v_player_id IS NULL) skip the check.
  -- =====================================================================
  IF v_player_id IS NOT NULL
     AND get_player_exclusion_status(v_player_id, v_casino_id) = 'blocked' THEN
    RAISE EXCEPTION 'PLAYER_EXCLUDED: Player has active hard_block exclusion'
      USING ERRCODE = 'P0001';
  END IF;

  -- =====================================================================
  -- DETERMINE ACCRUAL_KIND (ADR-014 Ghost Gaming Support)
  -- =====================================================================
  v_accrual_kind := CASE
    WHEN v_visit_kind = 'gaming_ghost_unrated' THEN 'compliance_only'
    ELSE 'loyalty'
  END;

  -- Validate table is active
  IF NOT EXISTS (
    SELECT 1 FROM gaming_table
    WHERE id = p_table_id
      AND casino_id = v_casino_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'TABLE_NOT_ACTIVE: Table % is not active', p_table_id;
  END IF;

  -- =====================================================================
  -- PRD-057 + PRD-059: SESSION-GATED SEATING
  -- Enforce invariant: no player seated without an active table session.
  -- OPEN sessions excluded (no attestation — gameplay forbidden).
  -- RUNDOWN allowed per ADR-028 D6.2.1 (play continues during rundown).
  -- ADR-018: casino_id filter required in SECURITY DEFINER.
  -- =====================================================================
  IF NOT EXISTS (
    SELECT 1 FROM table_session
    WHERE gaming_table_id = p_table_id
      AND casino_id = v_casino_id
      AND status IN ('ACTIVE', 'RUNDOWN')
  ) THEN
    RAISE EXCEPTION 'NO_ACTIVE_SESSION'
      USING ERRCODE = 'P0007',
            HINT = 'Table has no active session. Open and activate a session before seating players.';
  END IF;

  -- =====================================================================
  -- BUILD POLICY_SNAPSHOT (ISSUE-752833A6, ADR-019 D2)
  -- =====================================================================
  SELECT gs.house_edge, gs.decisions_per_hour, gs.points_conversion_rate, gs.point_multiplier
  INTO v_game_settings_lookup
  FROM gaming_table gt
  LEFT JOIN game_settings gs
    ON gs.game_type = gt.type
    AND gs.casino_id = gt.casino_id
  WHERE gt.id = p_table_id
    AND gt.casino_id = v_casino_id;

  v_policy_snapshot := jsonb_build_object(
    'loyalty', jsonb_build_object(
      'house_edge', COALESCE(v_game_settings_lookup.house_edge, 1.5),
      'decisions_per_hour', COALESCE(v_game_settings_lookup.decisions_per_hour, 70),
      'points_conversion_rate', COALESCE(v_game_settings_lookup.points_conversion_rate, 10.0),
      'point_multiplier', COALESCE(v_game_settings_lookup.point_multiplier, 1.0),
      'rounding_policy', 'floor',
      'policy_version', 'loyalty_points_v2'
    ),
    '_source', jsonb_build_object(
      'house_edge', CASE WHEN v_game_settings_lookup.house_edge IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'decisions_per_hour', CASE WHEN v_game_settings_lookup.decisions_per_hour IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'points_conversion_rate', CASE WHEN v_game_settings_lookup.points_conversion_rate IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'point_multiplier', CASE WHEN v_game_settings_lookup.point_multiplier IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'rounding_policy', 'default'
    )
  );

  -- Create slip with policy_snapshot and accrual_kind
  INSERT INTO rating_slip (
    casino_id, visit_id, table_id,
    seat_number, game_settings, policy_snapshot, accrual_kind, status, start_time
  )
  VALUES (
    v_casino_id, p_visit_id, p_table_id,
    p_seat_number, p_game_settings, v_policy_snapshot, v_accrual_kind, 'open', now()
  )
  RETURNING * INTO v_result;

  -- Audit log: uses v_context_actor_id (authoritative, context-derived)
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'rating-slip',
    v_context_actor_id,
    'start_rating_slip',
    jsonb_build_object(
      'rating_slip_id', v_result.id,
      'visit_id', p_visit_id,
      'player_id', v_player_id,
      'table_id', p_table_id,
      'visit_kind', v_visit_kind,
      'accrual_kind', v_accrual_kind,
      'policy_snapshot_populated', true,
      'policy_snapshot_source', v_policy_snapshot->'_source',
      'policy_values', v_policy_snapshot->'loyalty'
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_start_rating_slip(UUID, UUID, TEXT, JSONB) IS
  'ADR-024: set_rls_context_from_staff(), no p_casino_id/p_actor_id params. '
  'ADR-019 D2: policy_snapshot.loyalty from game_settings. '
  'ADR-014: accrual_kind from visit_kind. '
  'GAP-EXCL-ENFORCE-001: exclusion guard (hard_block rejected). '
  'PRD-057+059: session-gated seating — rejects NO_ACTIVE_SESSION (P0007). '
  'v2: adds rounding_policy=floor to snapshot (pilot decision D3).';

REVOKE ALL ON FUNCTION rpc_start_rating_slip(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpc_start_rating_slip(UUID, UUID, TEXT, JSONB) TO authenticated, service_role;


-- ============================================================================
-- 2. rpc_resume_rating_slip — derive v_player_id, add exclusion guard
-- Baseline: 20260303193305 (1-param, no p_casino_id)
-- Change: Add v_player_id derivation from visit, exclusion check before resume
-- ============================================================================

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
  v_player_id uuid;  -- GAP-EXCL-ENFORCE-001: for exclusion check
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

  -- =====================================================================
  -- GAP-EXCL-ENFORCE-001: Derive player_id from visit, check exclusion
  -- Only hard_block is rejected. Ghost visits skip the check.
  -- =====================================================================
  SELECT v.player_id INTO v_player_id
  FROM visit v WHERE v.id = v_result.visit_id;

  IF v_player_id IS NOT NULL
     AND get_player_exclusion_status(v_player_id, v_casino_id) = 'blocked' THEN
    RAISE EXCEPTION 'PLAYER_EXCLUDED: Player has active hard_block exclusion'
      USING ERRCODE = 'P0001';
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
  'ADR-024 P2 compliant: Derives casino_id from context. '
  'GAP-EXCL-ENFORCE-001: exclusion guard (hard_block rejected).';

REVOKE ALL ON FUNCTION public.rpc_resume_rating_slip(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_resume_rating_slip(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_resume_rating_slip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_resume_rating_slip(uuid) TO service_role;


-- ============================================================================
-- 3. rpc_move_player — derive v_player_id, add exclusion guard
-- Baseline: 20260307114918 (4-param, ADR-039 D3 theo materialization)
-- Change: Add v_player_id derivation from visit, exclusion check after slip lock
-- ============================================================================

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
  v_player_id uuid;  -- GAP-EXCL-ENFORCE-001: for exclusion check
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

  -- =====================================================================
  -- GAP-EXCL-ENFORCE-001: Derive player_id from visit, check exclusion
  -- Only hard_block is rejected. Ghost visits skip the check.
  -- =====================================================================
  SELECT v.player_id INTO v_player_id
  FROM visit v WHERE v.id = v_current_slip.visit_id;

  IF v_player_id IS NOT NULL
     AND get_player_exclusion_status(v_player_id, v_casino_id) = 'blocked' THEN
    RAISE EXCEPTION 'PLAYER_EXCLUDED: Player has active hard_block exclusion'
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- PRD-057 + PRD-059: SESSION-GATED MOVE
  -- Destination table must have an ACTIVE or RUNDOWN session.
  -- OPEN sessions excluded (no attestation — gameplay forbidden).
  -- ADR-018: casino_id filter required in SECURITY DEFINER.
  -- =======================================================================
  IF NOT EXISTS (
    SELECT 1 FROM table_session
    WHERE gaming_table_id = p_new_table_id
      AND casino_id = v_casino_id
      AND status IN ('ACTIVE', 'RUNDOWN')
  ) THEN
    RAISE EXCEPTION 'NO_ACTIVE_SESSION'
      USING ERRCODE = 'P0007',
            HINT = 'Destination table has no active session. Open and activate a session before moving players.';
  END IF;

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
  'ADR-024 P2 compliant. ADR-039 D3: materializes computed_theo_cents. '
  'GAP-EXCL-ENFORCE-001: exclusion guard (hard_block rejected). '
  'PRD-057+059: session-gated move — rejects NO_ACTIVE_SESSION (P0007) on destination.';

REVOKE ALL ON FUNCTION public.rpc_move_player(uuid, uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_move_player(uuid, uuid, text, numeric) TO authenticated;


-- ============================================================================
-- 4. rpc_create_player_exclusion — auto-close visits + slips on hard_block
-- Baseline: 20260328132317 (9-param, SECURITY DEFINER)
-- Change: After INSERT, auto-close active visits + open/paused slips on
--         hard_block enforcement. Audit trail for forced closures.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_create_player_exclusion(
  p_player_id       uuid,
  p_exclusion_type  text,
  p_enforcement     text,
  p_reason          text,
  p_effective_from  timestamptz DEFAULT NULL,
  p_effective_until timestamptz DEFAULT NULL,
  p_review_date     timestamptz DEFAULT NULL,
  p_external_ref    text        DEFAULT NULL,
  p_jurisdiction    text        DEFAULT NULL
)
RETURNS SETOF player_exclusion
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_casino_id  uuid;
  v_actor_id   uuid;
  v_staff_role text;
  v_exclusion  player_exclusion;
  v_closed_slip_count  int := 0;
  v_closed_visit_count int := 0;
BEGIN
  -- STEP 1: Context injection (ADR-024, ADR-018 Template 5)
  PERFORM set_rls_context_from_staff();

  -- STEP 2: Derive context from session vars (ADR-024 INV-8: NOT from parameters)
  v_casino_id  := NULLIF(current_setting('app.casino_id',  true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id',   true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role',  true), '');

  -- STEP 3: Validate context is set (ADR-030 INV-030-5)
  IF v_casino_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not available'
      USING ERRCODE = 'P0001';
  END IF;

  -- STEP 4: Role authorization — pit_boss or admin only
  IF v_staff_role IS NULL OR v_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role "%" cannot create exclusions', COALESCE(v_staff_role, 'none')
      USING ERRCODE = 'P0001';
  END IF;

  -- STEP 5: INSERT with context-derived fields
  INSERT INTO player_exclusion (
    player_id, casino_id, created_by,
    exclusion_type, enforcement, reason,
    effective_from, effective_until, review_date,
    external_ref, jurisdiction
  ) VALUES (
    p_player_id, v_casino_id, v_actor_id,
    p_exclusion_type, p_enforcement, p_reason,
    COALESCE(p_effective_from, now()), p_effective_until, p_review_date,
    p_external_ref, p_jurisdiction
  )
  RETURNING * INTO v_exclusion;

  -- =====================================================================
  -- STEP 6: GAP-EXCL-ENFORCE-001 Layer 2 — Auto-close on hard_block
  -- Close all open/paused rating slips and active visits for this player.
  -- Pattern: matches stale-slip-closure in rpc_start_or_resume_visit STEP 5-6.
  -- ADR-039 D3: computed_theo_cents = 0 for forced closures.
  -- ADR-030 INV-030-7: SECURITY DEFINER context with session-var-derived casino_id.
  -- Note: Cross-context writes to visit (VisitService) and rating_slip
  --       (RatingSlipService). Follows rpc_start_or_resume_visit precedent.
  -- =====================================================================
  IF p_enforcement = 'hard_block' THEN
    -- Close all open/paused rating slips for this player at this casino
    WITH closed_slips AS (
      UPDATE rating_slip rs
      SET status = 'closed',
          end_time = now(),
          computed_theo_cents = 0  -- Forced closure, no meaningful theo (ADR-039 D3)
      WHERE rs.casino_id = v_casino_id
        AND rs.status IN ('open', 'paused')
        AND rs.visit_id IN (
          SELECT v.id FROM visit v
          WHERE v.player_id = p_player_id
            AND v.casino_id = v_casino_id
            AND v.ended_at IS NULL
        )
      RETURNING rs.id
    )
    SELECT COUNT(*) INTO v_closed_slip_count FROM closed_slips;

    -- Close active visit(s) for this player
    WITH closed_visits AS (
      UPDATE visit
      SET ended_at = now()
      WHERE player_id = p_player_id
        AND casino_id = v_casino_id
        AND ended_at IS NULL
      RETURNING id
    )
    SELECT COUNT(*) INTO v_closed_visit_count FROM closed_visits;

    -- Audit trail for forced closures (SEC-002 guardrail #7)
    IF v_closed_slip_count > 0 OR v_closed_visit_count > 0 THEN
      INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
      VALUES (
        v_casino_id,
        'player_exclusion',
        v_actor_id,
        'exclusion_auto_close',
        jsonb_build_object(
          'exclusion_id', v_exclusion.id,
          'player_id', p_player_id,
          'enforcement', p_enforcement,
          'closed_visit_count', v_closed_visit_count,
          'closed_slip_count', v_closed_slip_count
        )
      );
    END IF;
  END IF;

  RETURN NEXT v_exclusion;
END;
$function$;

COMMENT ON FUNCTION public.rpc_create_player_exclusion(uuid, text, text, text, timestamptz, timestamptz, timestamptz, text, text) IS
  'ISS-EXCL-001: Create player exclusion. SECURITY DEFINER, derives casino_id/created_by from RLS context (ADR-024). '
  'GAP-EXCL-ENFORCE-001: Auto-closes active visits + open/paused slips on hard_block.';

-- Privilege posture: REVOKE all, GRANT to authenticated + service_role
REVOKE ALL ON FUNCTION public.rpc_create_player_exclusion(uuid, text, text, text, timestamptz, timestamptz, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_player_exclusion(uuid, text, text, text, timestamptz, timestamptz, timestamptz, text, text) TO authenticated, service_role;


-- ============================================================================
-- 5. REVOKE get_player_exclusion_status from public/anon/authenticated
-- Defense-in-depth: internal helper should not be directly callable.
-- DA R1 Finding 1.3: Even though RLS provides a backstop, restricting
-- direct invocation follows project defense-in-depth standard.
-- ============================================================================

REVOKE ALL ON FUNCTION public.get_player_exclusion_status(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_exclusion_status(uuid, uuid) TO service_role;


-- ============================================================================
-- 6. PostgREST schema reload
-- ============================================================================

NOTIFY pgrst, 'reload schema';

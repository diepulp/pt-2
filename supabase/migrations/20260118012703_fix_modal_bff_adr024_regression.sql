-- ============================================================================
-- Migration: Fix ADR-024 Regression in rpc_get_rating_slip_modal_data
-- ============================================================================
-- Issue: Migration 20260118000000 reverted to deprecated set_rls_context() call
-- Cause: Copy-paste from older ADR-015 version instead of ADR-024 compliant version
-- Error: "permission denied for function set_rls_context" when opening rating slip modal
--
-- Fix: Replace deprecated set_rls_context() with set_rls_context_from_staff()
--      per ADR-024 security invariants (INV-1, INV-7)
--
-- Reference: ADR-024_DECISIONS.md, 20260116220542_adr026_bff_gaming_day_filter.sql
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
  v_loyalty_snapshot jsonb;
  v_theo numeric;
  v_suggested_points int;
  v_loyalty_suggestion jsonb;
  v_pauses jsonb;
  v_result jsonb;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- ADR-024: Authoritative context injection via set_rls_context_from_staff()
  -- Derives actor_id, casino_id, staff_role from auth.uid() binding to staff
  -- Required for Supabase transaction pooling (port 6543)
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context (set by set_rls_context_from_staff)
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Casino scope validation (defense in depth)
  -- Although SECURITY INVOKER inherits RLS, we validate p_casino_id matches
  -- the caller's context to prevent accidental cross-tenant queries.
  -- ═══════════════════════════════════════════════════════════════════════
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

  -- ═══════════════════════════════════════════════════════════════════════
  -- 2. FETCH VISIT AND PLAYER (with gaming_day from visit table)
  -- ═══════════════════════════════════════════════════════════════════════
  -- FIX: Fetch gaming_day from visit.gaming_day (computed via compute_gaming_day trigger)
  -- instead of extracting from rating_slip.start_time
  SELECT
    v.id AS visit_id,
    v.player_id,
    v.gaming_day,
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

    -- Calculate loyalty suggestion for open slips (inline evaluate_session_reward_suggestion logic)
    v_loyalty_snapshot := v_slip.policy_snapshot -> 'loyalty';

    IF v_slip.status = 'open' AND v_loyalty_snapshot IS NOT NULL THEN
      -- Build a record-like structure for calculate_theo_from_snapshot
      -- We need: average_bet, duration_seconds from the slip
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

      -- Never suggest negative points
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
  -- 6. FETCH ACTIVE TABLES WITH OCCUPIED SEATS (BATCH)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'label', t.label,
      'type', t.type,
      'status', t.status,
      'occupiedSeats', t.occupied_seats,
      'seatsAvailable', COALESCE(t.seats_available, 7)
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
      gs.seats_available
    FROM gaming_table gt
    LEFT JOIN rating_slip rs ON rs.table_id = gt.id
      AND rs.status IN ('open', 'paused')
      AND rs.casino_id = p_casino_id
    LEFT JOIN game_settings gs ON gs.game_type = gt.type AND gs.casino_id = p_casino_id
    WHERE gt.casino_id = p_casino_id
      AND gt.status = 'active'
    GROUP BY gt.id, gt.label, gt.type, gt.status, gs.seats_available
  ) t;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 7. BUILD FINAL JSONB RESPONSE
  -- ═══════════════════════════════════════════════════════════════════════
  v_result := jsonb_build_object(
    'slip', jsonb_build_object(
      'id', v_slip.id,
      'visitId', v_slip.visit_id,
      'casinoId', p_casino_id,
      'tableId', v_slip.table_id,
      'tableLabel', v_table.label,
      'tableType', v_table.type,
      'seatNumber', v_slip.seat_number,
      'averageBet', COALESCE(v_slip.average_bet, 0),
      'startTime', v_slip.start_time,
      'endTime', v_slip.end_time,
      'status', v_slip.status,
      'gamingDay', v_visit.gaming_day::text,  -- Use gaming_day from visit table
      'durationSeconds', ROUND(v_duration_seconds)
    ),
    'player', CASE
      WHEN v_visit.player_id IS NOT NULL THEN
        jsonb_build_object(
          'id', v_visit.player_id,
          'firstName', v_visit.first_name,
          'lastName', v_visit.last_name,
          'cardNumber', NULL  -- Card number from enrollment context, not available here
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
        -- Player exists but no loyalty record yet
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

COMMENT ON FUNCTION rpc_get_rating_slip_modal_data IS
  'BFF RPC: Single round trip aggregation for rating slip modal display. ADR-024 compliant - uses set_rls_context_from_staff(). SECURITY INVOKER (inherits RLS). Returns complete modal DTO as JSONB. Defense-in-depth casino_id validation. Uses gaming_day from visit table. See PRD-018, PERF-001 BFF-RPC-DESIGN.md';

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION rpc_get_rating_slip_modal_data(uuid, uuid) TO authenticated;

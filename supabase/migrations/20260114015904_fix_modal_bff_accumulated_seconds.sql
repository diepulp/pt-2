-- =====================================================
-- Migration: Fix Modal BFF to use accumulated_seconds for loyalty suggestion
-- Created: 2026-01-14 01:59:04
-- Issue: ISSUE-752833A6 (loyalty wipe on move)
-- Purpose: Include accumulated_seconds in duration calculation for moved slips
--          so loyalty suggestion reflects total session time, not just current slip
-- =====================================================
--
-- ROOT CAUSE:
--   When a player is moved, a new slip is created with start_time = now().
--   The modal BFF was calculating duration as (now() - start_time) for open slips,
--   which shows ~0 seconds for freshly moved players.
--
--   accumulated_seconds tracks total play time across all slips in the move group,
--   but was being ignored in the loyalty suggestion calculation.
--
-- FIX:
--   For open slips, calculate total duration as:
--   accumulated_seconds + (now() - start_time) - paused_time
--
--   This ensures loyalty suggestion reflects the player's full session time.
--
-- =====================================================

BEGIN;

-- ============================================================================
-- FIX: rpc_get_rating_slip_modal_data - Use accumulated_seconds for loyalty
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
  v_slip record;
  v_visit record;
  v_table record;
  v_player record;
  v_loyalty record;
  v_financial record;
  v_active_tables jsonb;
  v_duration_seconds numeric;
  v_current_slip_duration numeric;  -- Duration of current slip only
  v_total_session_duration numeric; -- FIX: Total duration including accumulated_seconds
  v_gaming_day text;
  v_loyalty_snapshot jsonb;
  v_theo numeric;
  v_suggested_points int;
  v_loyalty_suggestion jsonb;
  v_pauses jsonb;
  v_result jsonb;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- ADR-024: Authoritative RLS Context Injection
  -- Replaces vulnerable set_rls_context() pattern with secure staff-based lookup
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM set_rls_context_from_staff();

  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Casino scope validation (defense in depth)
  -- Although SECURITY INVOKER inherits RLS, we validate p_casino_id matches
  -- the caller's context to prevent accidental cross-tenant queries.
  -- ADR-024: Context now derived from staff table, not spoofable params
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
  -- FIX: Added accumulated_seconds to capture total session time across moves
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
    rs.duration_seconds AS stored_duration_seconds,
    rs.accumulated_seconds  -- FIX: Include accumulated time from previous slips
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

  -- ═══════════════════════════════════════════════════════════════════════
  -- Calculate duration
  -- FIX: Separate current slip duration from total session duration
  -- v_duration_seconds = current slip only (for display)
  -- v_total_session_duration = accumulated + current (for loyalty calculation)
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_slip.status = 'closed' AND v_slip.stored_duration_seconds IS NOT NULL THEN
    v_duration_seconds := v_slip.stored_duration_seconds;
    v_current_slip_duration := v_slip.stored_duration_seconds;
  ELSE
    -- Calculate paused time from pause records
    v_current_slip_duration := EXTRACT(EPOCH FROM (
      COALESCE(v_slip.end_time, now()) - v_slip.start_time
    )) - COALESCE(
      (SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(rsp.ended_at, now()) - rsp.started_at)))
       FROM rating_slip_pause rsp
       WHERE rsp.rating_slip_id = p_slip_id
         AND rsp.casino_id = p_casino_id),
      0
    );
    -- Never return negative duration
    IF v_current_slip_duration < 0 THEN
      v_current_slip_duration := 0;
    END IF;
    v_duration_seconds := v_current_slip_duration;
  END IF;

  -- FIX: Calculate total session duration including accumulated_seconds from moves
  -- This is used for loyalty suggestion to reflect full play time
  v_total_session_duration := COALESCE(v_slip.accumulated_seconds, 0) + v_current_slip_duration;

  -- Extract gaming day from start_time
  v_gaming_day := (v_slip.start_time::date)::text;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 2. FETCH VISIT AND PLAYER
  -- ═══════════════════════════════════════════════════════════════════════
  -- FIX: Removed duplicate "p.id AS player_id" that was overwriting v.player_id
  -- causing NULL when LEFT JOIN didn't match (ISSUE-AE49B5DD)
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
  -- FIX: Use v_total_session_duration for loyalty suggestion instead of
  --      v_duration_seconds to include accumulated time from moves
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
      -- FIX: Use v_total_session_duration instead of v_duration_seconds
      -- This ensures the suggestion reflects total play time, not just current slip
      v_theo := (
        COALESCE((v_loyalty_snapshot ->> 'avg_bet')::numeric, v_slip.average_bet, 0) *
        (COALESCE((v_loyalty_snapshot ->> 'house_edge')::numeric, 0) / 100.0) *
        (COALESCE(v_total_session_duration, 0) / 3600.0) *  -- FIX: Use total session duration
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
        'policyVersion', COALESCE(v_loyalty_snapshot ->> 'policy_version', 'unknown'),
        'accumulatedSeconds', COALESCE(v_slip.accumulated_seconds, 0)  -- FIX: Expose for debugging
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
      'occupiedSeats', t.occupied_seats
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
      ) AS occupied_seats
    FROM gaming_table gt
    LEFT JOIN rating_slip rs ON rs.table_id = gt.id
      AND rs.status IN ('open', 'paused')
      AND rs.casino_id = p_casino_id
    WHERE gt.casino_id = p_casino_id
      AND gt.status = 'active'
    GROUP BY gt.id, gt.label, gt.type, gt.status
  ) t;

  -- ═══════════════════════════════════════════════════════════════════════
  -- BUILD FINAL RESPONSE DTO
  -- Matches RatingSlipModalDTO structure from services/rating-slip-modal/dtos.ts
  -- FIX: durationSeconds now shows current slip only, suggestion uses total session
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
      'durationSeconds', ROUND(v_duration_seconds),
      'accumulatedSeconds', COALESCE(v_slip.accumulated_seconds, 0),  -- FIX: Expose for UI
      'totalSessionSeconds', ROUND(v_total_session_duration)          -- FIX: Total for display
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
  'ADR-024: Uses set_rls_context_from_staff() for authoritative context injection. '
  'BFF RPC: Single round trip aggregation for rating slip modal display. SECURITY INVOKER (inherits RLS). '
  'FIX ISSUE-752833A6: Uses accumulated_seconds for loyalty suggestion to include moved slip time. '
  'Returns complete modal DTO as JSONB. Defense-in-depth casino_id validation. See PRD-018, PERF-001 BFF-RPC-DESIGN.md';

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION rpc_get_rating_slip_modal_data(uuid, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFY POSTGREST TO RELOAD SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (Run manually after migration)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Test with a moved player (Nikson Bell):
-- SELECT
--   rpc_get_rating_slip_modal_data(
--     '0b0fbe06-7411-419c-ba89-fb93a75b4766'::uuid,
--     'ca000000-0000-0000-0000-000000000001'::uuid
--   )->'slip'->'totalSessionSeconds' AS total_session,
--   rpc_get_rating_slip_modal_data(
--     '0b0fbe06-7411-419c-ba89-fb93a75b4766'::uuid,
--     'ca000000-0000-0000-0000-000000000001'::uuid
--   )->'loyalty'->'suggestion'->'suggestedPoints' AS suggested_points;
--
-- Expected: totalSessionSeconds should be ~647,153+ and suggestedPoints should be ~27,000+
--

-- =====================================================
-- Migration: ADR-024 Dashboard RPCs - Secure Context Injection
-- Created: 2025-12-29 15:40:13
-- ADR Reference: docs/80-adrs/ADR-024_DECISIONS.md
-- EXEC-SPEC: docs/20-architecture/specs/ADR-024/EXEC-SPEC-024.md
-- Workstream: WS4 - Update Dashboard RPCs
-- =====================================================
-- Purpose: Replace vulnerable set_rls_context() calls with secure
--          set_rls_context_from_staff() in dashboard-related RPCs.
--
-- RPCs Updated:
--   1. rpc_get_visit_live_view
--   2. rpc_get_rating_slip_modal_data
--   3. rpc_get_dashboard_tables_with_counts
--   4. rpc_start_rating_slip
--
-- Security Pattern Change:
--   BEFORE (Vulnerable):
--     v_context_staff_role := COALESCE(...)
--     PERFORM set_rls_context(actor_id, casino_id, role)
--
--   AFTER (Secure):
--     PERFORM set_rls_context_from_staff()
--
-- Invariants Enforced:
--   INV-3: Staff identity bound to auth.uid()
--   INV-5: Context set via SET LOCAL (pooler-safe)
-- =====================================================

BEGIN;

-- ============================================================================
-- RPC 1: rpc_get_visit_live_view
-- ============================================================================
-- Drop existing function (different signature may exist)
DROP FUNCTION IF EXISTS rpc_get_visit_live_view(UUID, BOOLEAN, INTEGER, UUID);

CREATE OR REPLACE FUNCTION rpc_get_visit_live_view(
  p_visit_id UUID,
  p_include_segments BOOLEAN DEFAULT FALSE,
  p_segments_limit INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER  -- CRITICAL: Respects RLS under Supavisor pooling (ADR-015)
AS $$
DECLARE
  v_result JSONB;
  v_visit RECORD;
  v_current_segment RECORD;
  v_segments JSONB;
  v_total_duration_seconds INTEGER;
  v_total_buy_in NUMERIC;
  v_total_cash_out NUMERIC;
  v_total_net NUMERIC;
  v_points_earned INTEGER;
  v_segment_count INTEGER;
  v_active_slip_duration INTEGER;
BEGIN
  -- ============================================================================
  -- ADR-024: Authoritative RLS Context Injection
  -- Replaces vulnerable set_rls_context() pattern with secure staff-based lookup
  -- ============================================================================
  PERFORM set_rls_context_from_staff();

  -- ============================================================================
  -- 1. Fetch visit with player info
  -- ============================================================================
  SELECT
    v.id AS visit_id,
    v.player_id,
    p.first_name AS player_first_name,
    p.last_name AS player_last_name,
    CASE WHEN v.ended_at IS NULL THEN 'open' ELSE 'closed' END AS visit_status,
    v.started_at
  INTO v_visit
  FROM visit v
  INNER JOIN player p ON p.id = v.player_id
  WHERE v.id = p_visit_id;

  -- If visit not found (or RLS blocked), return NULL
  IF v_visit.visit_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- ============================================================================
  -- 2. Find current segment (active slip)
  -- ============================================================================
  SELECT
    rs.id AS slip_id,
    rs.table_id,
    gt.label AS table_name,
    rs.seat_number,
    rs.status,
    rs.start_time AS started_at,
    rs.average_bet
  INTO v_current_segment
  FROM rating_slip rs
  INNER JOIN gaming_table gt ON gt.id = rs.table_id
  WHERE rs.visit_id = p_visit_id
    AND rs.status IN ('open', 'paused')
  LIMIT 1;

  -- ============================================================================
  -- 3. Calculate session totals
  -- ============================================================================

  -- 3a. Total duration (all closed slips + active slip)
  SELECT COALESCE(SUM(final_duration_seconds), 0)
  INTO v_total_duration_seconds
  FROM rating_slip
  WHERE visit_id = p_visit_id
    AND final_duration_seconds IS NOT NULL;

  -- If there's an active slip, add its current duration
  IF v_current_segment.slip_id IS NOT NULL THEN
    -- Use rpc_get_rating_slip_duration for live calculation
    SELECT rpc_get_rating_slip_duration(v_current_segment.slip_id)
    INTO v_active_slip_duration;

    v_total_duration_seconds := v_total_duration_seconds + COALESCE(v_active_slip_duration, 0);
  END IF;

  -- 3b. Total buy-in (sum of 'in' direction transactions)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_buy_in
  FROM player_financial_transaction
  WHERE visit_id = p_visit_id
    AND direction = 'in';

  -- 3c. Total cash-out (sum of 'out' direction transactions)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_cash_out
  FROM player_financial_transaction
  WHERE visit_id = p_visit_id
    AND direction = 'out';

  -- 3d. Calculate net (buy_in - cash_out)
  v_total_net := v_total_buy_in - v_total_cash_out;

  -- 3e. Points earned (default to 0 as loyalty_accrual table doesn't exist yet)
  v_points_earned := 0;

  -- 3f. Segment count (total number of slips for this visit)
  SELECT COUNT(*)
  INTO v_segment_count
  FROM rating_slip
  WHERE visit_id = p_visit_id;

  -- ============================================================================
  -- 4. Build base result object
  -- ============================================================================
  v_result := jsonb_build_object(
    'visit_id', v_visit.visit_id,
    'player_id', v_visit.player_id,
    'player_first_name', v_visit.player_first_name,
    'player_last_name', v_visit.player_last_name,
    'visit_status', v_visit.visit_status,
    'started_at', v_visit.started_at,
    'current_segment_slip_id', v_current_segment.slip_id,
    'current_segment_table_id', v_current_segment.table_id,
    'current_segment_table_name', v_current_segment.table_name,
    'current_segment_seat_number', v_current_segment.seat_number,
    'current_segment_status', v_current_segment.status,
    'current_segment_started_at', v_current_segment.started_at,
    'current_segment_average_bet', v_current_segment.average_bet,
    'session_total_duration_seconds', v_total_duration_seconds,
    'session_total_buy_in', v_total_buy_in,
    'session_total_cash_out', v_total_cash_out,
    'session_net', v_total_net,
    'session_points_earned', v_points_earned,
    'session_segment_count', v_segment_count
  );

  -- ============================================================================
  -- 5. Optional segments array
  -- ============================================================================
  IF p_include_segments THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'slip_id', rs.id,
        'table_id', rs.table_id,
        'table_name', gt.label,
        'seat_number', rs.seat_number,
        'status', rs.status,
        'start_time', rs.start_time,
        'end_time', rs.end_time,
        'final_duration_seconds', rs.final_duration_seconds,
        'average_bet', rs.average_bet
      ) ORDER BY rs.start_time DESC
    )
    INTO v_segments
    FROM (
      SELECT rs.*
      FROM rating_slip rs
      WHERE rs.visit_id = p_visit_id
      ORDER BY rs.start_time DESC
      LIMIT p_segments_limit
    ) rs
    INNER JOIN gaming_table gt ON gt.id = rs.table_id;

    -- Add segments array to result
    v_result := v_result || jsonb_build_object('segments', COALESCE(v_segments, '[]'::jsonb));
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_get_visit_live_view(UUID, BOOLEAN, INTEGER) IS
'ADR-024: Uses set_rls_context_from_staff() for authoritative context injection.
Returns comprehensive session aggregate view for operators.
Includes visit metadata, current active segment, session totals, and optionally recent segments.
Returns NULL if visit not found or blocked by RLS.
SECURITY INVOKER: respects RLS policies.

Parameters:
- p_visit_id: UUID of the visit to query
- p_include_segments: Include array of recent slips (default: FALSE)
- p_segments_limit: Max number of segments to return (default: 10)

Session totals:
- duration: SUM(closed slips final_duration_seconds) + active slip current duration
- buy_in: SUM(financial transactions with direction=''in'')
- cash_out: SUM(financial transactions with direction=''out'')
- net: buy_in - cash_out
- points: 0 (loyalty_accrual table not yet implemented)
- segment_count: COUNT(rating_slips for visit)';

-- ============================================================================
-- RPC 2: rpc_get_rating_slip_modal_data
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
  'Returns complete modal DTO as JSONB. Defense-in-depth casino_id validation. See PRD-018, PERF-001 BFF-RPC-DESIGN.md';

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION rpc_get_rating_slip_modal_data(uuid, uuid) TO authenticated;

-- ============================================================================
-- RPC 3: rpc_get_dashboard_tables_with_counts
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_get_dashboard_tables_with_counts(
  p_casino_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_context_casino_id uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- ADR-024: Authoritative RLS Context Injection
  -- Replaces vulnerable set_rls_context() pattern with secure staff-based lookup
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM set_rls_context_from_staff();

  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, ISSUE-DD2C45CA)
  -- Validates that caller's RLS context matches the requested casino
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

  -- Return all gaming tables with active slip counts
  -- Structure matches DashboardTableDTO (extends GamingTableWithDealerDTO)
  RETURN (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', gt.id,
        'casino_id', gt.casino_id,
        'label', gt.label,
        'pit', gt.pit,
        'type', gt.type,
        'status', gt.status,
        'created_at', gt.created_at,
        'current_dealer', (
          SELECT jsonb_build_object(
            'staff_id', dr.staff_id,
            'started_at', dr.started_at
          )
          FROM dealer_rotation dr
          WHERE dr.table_id = gt.id
            AND dr.ended_at IS NULL
          ORDER BY dr.started_at DESC
          LIMIT 1
        ),
        'activeSlipsCount', COALESCE(slip_counts.count, 0)
      ) ORDER BY gt.label
    ), '[]'::jsonb)
    FROM gaming_table gt
    LEFT JOIN (
      SELECT table_id, COUNT(*)::int as count
      FROM rating_slip
      WHERE status IN ('open', 'paused')
        AND casino_id = p_casino_id
      GROUP BY table_id
    ) slip_counts ON slip_counts.table_id = gt.id
    WHERE gt.casino_id = p_casino_id
  );
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION rpc_get_dashboard_tables_with_counts(uuid) TO authenticated;

-- Document the function
COMMENT ON FUNCTION rpc_get_dashboard_tables_with_counts IS
  'ADR-024: Uses set_rls_context_from_staff() for authoritative context injection. '
  'ISSUE-DD2C45CA: Batch RPC for dashboard tables with active slip counts. '
  'Replaces N*2 HTTP pattern (8 requests -> 1). '
  'Returns jsonb array matching DashboardTableDTO[]. '
  'RLS context validated via SEC-001 Template 5 pattern.';

-- ============================================================================
-- RPC 4: rpc_start_rating_slip
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
  v_context_casino_id uuid;
  v_result rating_slip;
  v_player_id UUID;
  v_visit_kind visit_kind;
  v_accrual_kind text;
  v_policy_snapshot JSONB;
  v_game_settings_lookup RECORD;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative RLS Context Injection
  -- Replaces vulnerable set_rls_context() pattern with secure staff-based lookup
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

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

  -- Validate visit is open and get player_id + visit_kind for processing
  SELECT player_id, visit_kind INTO v_player_id, v_visit_kind
  FROM visit
  WHERE id = p_visit_id
    AND casino_id = p_casino_id
    AND ended_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_OPEN: Visit % is not active', p_visit_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- DETERMINE ACCRUAL_KIND (ADR-014 Ghost Gaming Support)
  -- Ghost visits (gaming_ghost_unrated) are compliance-only, no loyalty
  -- ═══════════════════════════════════════════════════════════════════════
  v_accrual_kind := CASE
    WHEN v_visit_kind = 'gaming_ghost_unrated' THEN 'compliance_only'
    ELSE 'loyalty'
  END;

  -- Validate table is active
  IF NOT EXISTS (
    SELECT 1 FROM gaming_table
    WHERE id = p_table_id
      AND casino_id = p_casino_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'TABLE_NOT_ACTIVE: Table % is not active', p_table_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- BUILD POLICY_SNAPSHOT (ISSUE-752833A6 Fix, ADR-019 D2)
  -- ═══════════════════════════════════════════════════════════════════════

  -- Lookup from game_settings table via gaming_table.type (AUTHORITATIVE)
  SELECT gs.house_edge, gs.decisions_per_hour, gs.points_conversion_rate, gs.point_multiplier
  INTO v_game_settings_lookup
  FROM gaming_table gt
  LEFT JOIN game_settings gs
    ON gs.game_type = gt.type
    AND gs.casino_id = gt.casino_id
  WHERE gt.id = p_table_id
    AND gt.casino_id = p_casino_id;

  -- Build snapshot from canonical sources only (NO p_game_settings for policy)
  v_policy_snapshot := jsonb_build_object(
    'loyalty', jsonb_build_object(
      'house_edge', COALESCE(v_game_settings_lookup.house_edge, 1.5),
      'decisions_per_hour', COALESCE(v_game_settings_lookup.decisions_per_hour, 70),
      'points_conversion_rate', COALESCE(v_game_settings_lookup.points_conversion_rate, 10.0),
      'point_multiplier', COALESCE(v_game_settings_lookup.point_multiplier, 1.0),
      'policy_version', 'loyalty_points_v1'
    ),
    '_source', jsonb_build_object(
      'house_edge', CASE WHEN v_game_settings_lookup.house_edge IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'decisions_per_hour', CASE WHEN v_game_settings_lookup.decisions_per_hour IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'points_conversion_rate', CASE WHEN v_game_settings_lookup.points_conversion_rate IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'point_multiplier', CASE WHEN v_game_settings_lookup.point_multiplier IS NOT NULL THEN 'game_settings' ELSE 'default' END
    )
  );
  -- ═══════════════════════════════════════════════════════════════════════

  -- Create slip with policy_snapshot and accrual_kind (ISSUE-752833A6 + ADR-014)
  INSERT INTO rating_slip (
    casino_id, visit_id, table_id,
    seat_number, game_settings, policy_snapshot, accrual_kind, status, start_time
  )
  VALUES (
    p_casino_id, p_visit_id, p_table_id,
    p_seat_number, p_game_settings, v_policy_snapshot, v_accrual_kind, 'open', now()
  )
  RETURNING * INTO v_result;

  -- Audit log with policy source tracking and accrual_kind
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

COMMENT ON FUNCTION rpc_start_rating_slip(UUID, UUID, UUID, TEXT, JSONB, UUID) IS
  'ADR-024: Uses set_rls_context_from_staff() for authoritative context injection. '
  'Creates new rating slip for active visit/table. SEC-007 hardened with Template 5 context validation. '
  'ISSUE-752833A6: Populates policy_snapshot.loyalty from game_settings (ADR-019 D2). '
  'ADR-014: Sets accrual_kind based on visit_kind (ghost visits are compliance_only).';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

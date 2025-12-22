-- Migration: PRD-016 RPC Live View ADR-015 Compliance
-- Purpose: Add RLS context self-injection to rpc_get_visit_live_view
-- Reference: ADR-015 Phase 1A, ISSUE-5FE4A689
--
-- Changes:
-- 1. Add optional p_casino_id parameter
-- 2. Add set_rls_context call at function start

-- Drop existing function (different signature)
DROP FUNCTION IF EXISTS rpc_get_visit_live_view(UUID, BOOLEAN, INTEGER);

-- Recreate with ADR-015 self-injection
CREATE OR REPLACE FUNCTION rpc_get_visit_live_view(
  p_visit_id UUID,
  p_include_segments BOOLEAN DEFAULT FALSE,
  p_segments_limit INTEGER DEFAULT 10,
  p_casino_id UUID DEFAULT NULL  -- ADR-015: For RLS context self-injection
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
  v_context_staff_role TEXT;
  v_context_actor_id UUID;
  v_context_casino_id UUID;
BEGIN
  -- ============================================================================
  -- ADR-015 Phase 1A: RLS Context Self-Injection
  -- Ensures context is available within same transaction for connection pooling
  -- ============================================================================
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  v_context_actor_id := COALESCE(
    NULLIF(current_setting('app.actor_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
  );

  v_context_casino_id := COALESCE(
    p_casino_id,
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  -- Inject context if we have the required values
  IF v_context_actor_id IS NOT NULL AND v_context_casino_id IS NOT NULL THEN
    PERFORM set_rls_context(v_context_actor_id, v_context_casino_id, v_context_staff_role);
  END IF;

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

COMMENT ON FUNCTION rpc_get_visit_live_view(UUID, BOOLEAN, INTEGER, UUID) IS
'ADR-015 Phase 1A: Self-injects RLS context via set_rls_context for connection pooling compatibility.
Returns comprehensive session aggregate view for operators.
Includes visit metadata, current active segment, session totals, and optionally recent segments.
Returns NULL if visit not found or blocked by RLS.
SECURITY INVOKER: respects RLS policies.

Parameters:
- p_visit_id: UUID of the visit to query
- p_include_segments: Include array of recent slips (default: FALSE)
- p_segments_limit: Max number of segments to return (default: 10)
- p_casino_id: Optional casino UUID for RLS context (falls back to session/JWT)

Session totals:
- duration: SUM(closed slips final_duration_seconds) + active slip current duration
- buy_in: SUM(financial transactions with direction=''in'')
- cash_out: SUM(financial transactions with direction=''out'')
- net: buy_in - cash_out
- points: 0 (loyalty_accrual table not yet implemented)
- segment_count: COUNT(rating_slips for visit)';

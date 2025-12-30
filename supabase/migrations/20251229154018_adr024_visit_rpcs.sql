-- =====================================================
-- Migration: ADR-024 WS3 - Visit/Analytics RPCs Remediation
-- Created: 2025-12-29 15:40:18
-- ADR Reference: docs/80-adrs/ADR-024_DECISIONS.md
-- EXEC-SPEC: docs/20-architecture/specs/ADR-024/EXEC-SPEC-024.md
-- Workstream: WS3 - Update Visit/Analytics RPCs (5)
-- =====================================================
-- This migration updates the following RPCs to use secure context injection:
--   1. rpc_check_table_seat_availability
--   2. rpc_get_visit_loyalty_summary
--   3. rpc_get_visit_last_segment
--   4. rpc_get_player_recent_sessions
--   5. rpc_get_player_last_session_context
--
-- Change: Replace vulnerable set_rls_context() self-injection pattern
--         with authoritative set_rls_context_from_staff()
--
-- Security Invariants Enforced:
--   INV-3: Staff identity bound to auth.uid() via staff table lookup
--   INV-5: Context set via SET LOCAL (pooler-safe)
-- =====================================================

BEGIN;

-- =============================================================
-- RPC 1: rpc_check_table_seat_availability
-- PRD-017: Table/Seat Availability Check RPC
-- Published contract for TableContextService
-- =============================================================

CREATE OR REPLACE FUNCTION rpc_check_table_seat_availability(
  p_table_id uuid,
  p_seat_number int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_table_record RECORD;
  v_seat_occupied boolean;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();
  -- =======================================================================

  -- 1. Check if table exists and get its status (RLS enforced)
  SELECT id, label, status, casino_id
  INTO v_table_record
  FROM gaming_table
  WHERE id = p_table_id;

  -- Table not found (or not accessible due to RLS)
  IF v_table_record IS NULL THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'table_not_found'
    );
  END IF;

  -- 2. Check table status
  IF v_table_record.status = 'inactive' THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'table_inactive',
      'table_name', v_table_record.label
    );
  END IF;

  IF v_table_record.status = 'closed' THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'table_closed',
      'table_name', v_table_record.label
    );
  END IF;

  -- 3. Check seat occupancy (open or paused rating slip at this table/seat)
  SELECT EXISTS(
    SELECT 1
    FROM rating_slip rs
    WHERE rs.table_id = p_table_id
      AND rs.seat_number = p_seat_number::text  -- seat_number is text in schema
      AND rs.status IN ('open', 'paused')
  ) INTO v_seat_occupied;

  IF v_seat_occupied THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'seat_occupied',
      'table_name', v_table_record.label
    );
  END IF;

  -- 4. Table is active and seat is available
  RETURN jsonb_build_object(
    'available', true,
    'table_name', v_table_record.label
  );
END;
$$;

COMMENT ON FUNCTION rpc_check_table_seat_availability(uuid, int) IS
  'PRD-017: Published contract for TableContextService. Checks if a table/seat is available for a new visit. Returns {available: boolean, reason?: string, table_name?: string}. SECURITY INVOKER - RLS enforced. ADR-024 compliant.';

-- =============================================================
-- RPC 2: rpc_get_visit_loyalty_summary
-- PRD-017: Visit Loyalty Summary RPC
-- Published contract for LoyaltyService
-- =============================================================

CREATE OR REPLACE FUNCTION rpc_get_visit_loyalty_summary(
  p_visit_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_points_earned numeric;
  v_visit_exists boolean;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();
  -- =======================================================================

  -- 1. Check if visit exists (RLS enforced)
  SELECT EXISTS(
    SELECT 1 FROM visit WHERE id = p_visit_id
  ) INTO v_visit_exists;

  IF NOT v_visit_exists THEN
    RETURN NULL;
  END IF;

  -- 2. Sum points from loyalty_ledger for this visit
  -- Only count positive points_delta (accruals, credits, promotions)
  SELECT COALESCE(SUM(
    CASE WHEN points_delta > 0 THEN points_delta ELSE 0 END
  ), 0)
  INTO v_points_earned
  FROM loyalty_ledger
  WHERE visit_id = p_visit_id;

  -- 3. Return summary
  RETURN jsonb_build_object(
    'points_earned', v_points_earned
  );
END;
$$;

COMMENT ON FUNCTION rpc_get_visit_loyalty_summary(uuid) IS
  'PRD-017: Published contract for LoyaltyService. Returns total points earned for a visit. Returns {points_earned: number}. SECURITY INVOKER - RLS enforced. ADR-024 compliant.';

-- =============================================================
-- RPC 3: rpc_get_visit_last_segment
-- PRD-017: Visit Last Segment RPC
-- Published contract for RatingSlipService
-- =============================================================

CREATE OR REPLACE FUNCTION rpc_get_visit_last_segment(
  p_visit_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_segment RECORD;
  v_visit_exists boolean;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();
  -- =======================================================================

  -- 1. Check if visit exists (RLS enforced)
  SELECT EXISTS(
    SELECT 1 FROM visit WHERE id = p_visit_id
  ) INTO v_visit_exists;

  IF NOT v_visit_exists THEN
    RETURN NULL;
  END IF;

  -- 2. Get the last rating slip (segment) for this visit
  -- Order by start_time DESC to get most recent, with id as tiebreaker
  SELECT
    rs.table_id,
    gt.label AS table_name,
    rs.seat_number::int AS seat_number,
    rs.game_settings,
    COALESCE(rs.final_average_bet, rs.average_bet) AS average_bet
  INTO v_segment
  FROM rating_slip rs
  LEFT JOIN gaming_table gt ON gt.id = rs.table_id
  WHERE rs.visit_id = p_visit_id
  ORDER BY rs.start_time DESC, rs.id DESC
  LIMIT 1;

  -- 3. Return null if no segments found
  IF v_segment IS NULL THEN
    RETURN NULL;
  END IF;

  -- 4. Build response
  RETURN jsonb_build_object(
    'table_id', v_segment.table_id,
    'table_name', v_segment.table_name,
    'seat_number', v_segment.seat_number,
    'game_settings', v_segment.game_settings,
    'average_bet', v_segment.average_bet
  );
END;
$$;

COMMENT ON FUNCTION rpc_get_visit_last_segment(uuid) IS
  'PRD-017: Published contract for RatingSlipService. Returns last segment (rating slip) context for a visit. Returns {table_id, table_name, seat_number, game_settings, average_bet} or null. SECURITY INVOKER - RLS enforced. ADR-024 compliant.';

-- =============================================================
-- RPC 4: rpc_get_player_recent_sessions
-- PRD-017: Player Recent Sessions RPC
-- Published contract for VisitService
-- =============================================================

CREATE OR REPLACE FUNCTION rpc_get_player_recent_sessions(
  p_casino_id uuid,
  p_player_id uuid,
  p_limit int DEFAULT 5,
  p_cursor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_cursor_ended_at timestamptz;
  v_cursor_visit_id uuid;
  v_open_visit RECORD;
  v_sessions jsonb := '[]'::jsonb;
  v_session_record RECORD;
  v_loyalty_summary jsonb;
  v_last_segment jsonb;
  v_financial_summary RECORD;
  v_segment_count int;
  v_next_cursor text := NULL;
  v_sessions_fetched int := 0;
  v_context_casino_id uuid;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Validate casino_id parameter matches caller's context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id mismatch';
  END IF;
  -- =======================================================================

  -- Validate inputs
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'INVALID_LIMIT: Limit must be between 1 and 100';
  END IF;

  -- 1. Parse cursor if provided (format: base64(ended_at_iso||'|'||visit_id))
  IF p_cursor IS NOT NULL THEN
    BEGIN
      -- Decode base64 cursor
      DECLARE
        v_decoded text;
        v_parts text[];
      BEGIN
        v_decoded := convert_from(decode(p_cursor, 'base64'), 'UTF8');
        v_parts := string_to_array(v_decoded, '|');

        IF array_length(v_parts, 1) <> 2 THEN
          RAISE EXCEPTION 'INVALID_CURSOR: Malformed cursor';
        END IF;

        v_cursor_ended_at := v_parts[1]::timestamptz;
        v_cursor_visit_id := v_parts[2]::uuid;
      END;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_CURSOR: %', SQLERRM;
    END;
  END IF;

  -- 2. Check for open visit (separate from closed sessions list)
  SELECT
    v.id AS visit_id,
    v.visit_group_id,
    v.started_at,
    v.ended_at,
    v.casino_id,
    v.player_id
  INTO v_open_visit
  FROM visit v
  WHERE v.casino_id = p_casino_id
    AND v.player_id = p_player_id
    AND v.ended_at IS NULL
  LIMIT 1;

  -- 3. Fetch closed sessions with pagination
  FOR v_session_record IN
    SELECT
      v.id AS visit_id,
      v.visit_group_id,
      v.started_at,
      v.ended_at,
      v.casino_id
    FROM visit v
    WHERE v.casino_id = p_casino_id
      AND v.player_id = p_player_id
      AND v.ended_at IS NOT NULL
      -- Only last 7 days by default
      AND v.ended_at >= (NOW() - INTERVAL '7 days')
      -- Cursor pagination with tie-breaking
      AND (
        p_cursor IS NULL
        OR v.ended_at < v_cursor_ended_at
        OR (v.ended_at = v_cursor_ended_at AND v.id < v_cursor_visit_id)
      )
    ORDER BY v.ended_at DESC, v.id DESC
    LIMIT p_limit + 1  -- Fetch one extra to determine if there's a next page
  LOOP
    -- Stop if we've hit the limit (extra row is for next_cursor)
    IF v_sessions_fetched >= p_limit THEN
      -- Build next cursor from this record
      v_next_cursor := encode(
        convert_to(
          to_char(v_session_record.ended_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|' || v_session_record.visit_id::text,
          'UTF8'
        ),
        'base64'
      );
      EXIT;
    END IF;

    -- Get loyalty summary from LoyaltyService published RPC
    v_loyalty_summary := rpc_get_visit_loyalty_summary(v_session_record.visit_id);

    -- Get last segment from RatingSlipService published RPC
    v_last_segment := rpc_get_visit_last_segment(v_session_record.visit_id);

    -- Get financial summary from PlayerFinancialService published view
    SELECT
      total_in,
      total_out,
      net_amount
    INTO v_financial_summary
    FROM visit_financial_summary
    WHERE visit_id = v_session_record.visit_id;

    -- Count segments for this visit
    SELECT COUNT(*)::int
    INTO v_segment_count
    FROM rating_slip
    WHERE visit_id = v_session_record.visit_id;

    -- Calculate total duration in seconds
    DECLARE
      v_duration_seconds int;
    BEGIN
      v_duration_seconds := EXTRACT(EPOCH FROM (v_session_record.ended_at - v_session_record.started_at))::int;
    END;

    -- Build session object
    v_sessions := v_sessions || jsonb_build_object(
      'visit_id', v_session_record.visit_id,
      'visit_group_id', v_session_record.visit_group_id,
      'started_at', to_char(v_session_record.started_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'ended_at', to_char(v_session_record.ended_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'last_table_id', COALESCE(v_last_segment->>'table_id', NULL),
      'last_table_name', COALESCE(v_last_segment->>'table_name', NULL),
      'last_seat_number', COALESCE((v_last_segment->>'seat_number')::int, NULL),
      'total_duration_seconds', EXTRACT(EPOCH FROM (v_session_record.ended_at - v_session_record.started_at))::int,
      'total_buy_in', COALESCE(v_financial_summary.total_in, 0),
      'total_cash_out', COALESCE(v_financial_summary.total_out, 0),
      'net', COALESCE(v_financial_summary.net_amount, 0),
      'points_earned', COALESCE((v_loyalty_summary->>'points_earned')::numeric, 0),
      'segment_count', v_segment_count
    );

    v_sessions_fetched := v_sessions_fetched + 1;
  END LOOP;

  -- 4. Build open_visit object if exists
  DECLARE
    v_open_visit_obj jsonb := NULL;
    v_open_loyalty jsonb;
    v_open_last_segment jsonb;
    v_open_financial RECORD;
    v_open_segment_count int;
  BEGIN
    IF v_open_visit IS NOT NULL THEN
      -- Get aggregates for open visit
      v_open_loyalty := rpc_get_visit_loyalty_summary(v_open_visit.visit_id);
      v_open_last_segment := rpc_get_visit_last_segment(v_open_visit.visit_id);

      SELECT
        total_in,
        total_out,
        net_amount
      INTO v_open_financial
      FROM visit_financial_summary
      WHERE visit_id = v_open_visit.visit_id;

      SELECT COUNT(*)::int
      INTO v_open_segment_count
      FROM rating_slip
      WHERE visit_id = v_open_visit.visit_id;

      v_open_visit_obj := jsonb_build_object(
        'visit_id', v_open_visit.visit_id,
        'visit_group_id', v_open_visit.visit_group_id,
        'started_at', to_char(v_open_visit.started_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'ended_at', NULL,
        'last_table_id', COALESCE(v_open_last_segment->>'table_id', NULL),
        'last_table_name', COALESCE(v_open_last_segment->>'table_name', NULL),
        'last_seat_number', COALESCE((v_open_last_segment->>'seat_number')::int, NULL),
        'total_duration_seconds', EXTRACT(EPOCH FROM (NOW() - v_open_visit.started_at))::int,
        'total_buy_in', COALESCE(v_open_financial.total_in, 0),
        'total_cash_out', COALESCE(v_open_financial.total_out, 0),
        'net', COALESCE(v_open_financial.net_amount, 0),
        'points_earned', COALESCE((v_open_loyalty->>'points_earned')::numeric, 0),
        'segment_count', v_open_segment_count
      );
    END IF;
  END;

  -- 5. Return final result
  RETURN jsonb_build_object(
    'sessions', v_sessions,
    'next_cursor', v_next_cursor,
    'open_visit', v_open_visit_obj
  );
END;
$$;

COMMENT ON FUNCTION rpc_get_player_recent_sessions(uuid, uuid, int, text) IS
  'PRD-017 WS5: Published contract for VisitService. Returns paginated recent closed sessions for a player with aggregates from multiple contexts. Separately returns any open visit. Returns {sessions: Array, next_cursor: string|null, open_visit: object|null}. SECURITY INVOKER - RLS enforced. ADR-024 compliant.';

-- =============================================================
-- RPC 5: rpc_get_player_last_session_context
-- PRD-017: Player Last Session Context RPC
-- Purpose: Retrieve last closed session context for prefilling "Start from previous" form
-- =============================================================

CREATE OR REPLACE FUNCTION rpc_get_player_last_session_context(
  p_casino_id uuid,
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_last_visit RECORD;
  v_last_segment jsonb;
  v_context_casino_id uuid;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Validate casino_id parameter matches caller's context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id mismatch';
  END IF;
  -- =======================================================================

  -- 1. Find the most recently closed visit for this player
  -- Order by ended_at DESC to get most recent, with id as tiebreaker
  SELECT
    id,
    visit_group_id,
    ended_at
  INTO v_last_visit
  FROM visit
  WHERE casino_id = p_casino_id
    AND player_id = p_player_id
    AND ended_at IS NOT NULL  -- Only closed sessions
  ORDER BY ended_at DESC, id DESC
  LIMIT 1;

  -- 2. Return null if player has no closed sessions
  IF v_last_visit IS NULL THEN
    RETURN NULL;
  END IF;

  -- 3. Get last segment context from RatingSlipService published contract
  -- Uses rpc_get_visit_last_segment (created in WS4)
  SELECT rpc_get_visit_last_segment(v_last_visit.id)
  INTO v_last_segment;

  -- 4. Return null if visit has no segments
  IF v_last_segment IS NULL THEN
    RETURN NULL;
  END IF;

  -- 5. Build response by composing visit + segment context
  RETURN jsonb_build_object(
    'visit_id', v_last_visit.id,
    'visit_group_id', v_last_visit.visit_group_id,
    'last_table_id', v_last_segment->>'table_id',
    'last_table_name', v_last_segment->>'table_name',
    'last_seat_number', (v_last_segment->>'seat_number')::int,
    'last_game_settings', v_last_segment->'game_settings',
    'last_average_bet',
      CASE
        WHEN v_last_segment->>'average_bet' IS NULL THEN NULL
        ELSE (v_last_segment->>'average_bet')::numeric
      END,
    'ended_at', v_last_visit.ended_at
  );
END;
$$;

COMMENT ON FUNCTION rpc_get_player_last_session_context(uuid, uuid) IS
  'PRD-017 WS6: Returns last closed session context for prefilling continuation form. Composes visit data with rpc_get_visit_last_segment (RatingSlipService). Returns {visit_id, visit_group_id, last_table_id, last_table_name, last_seat_number, last_game_settings, last_average_bet, ended_at} or null if no closed sessions. SECURITY INVOKER - RLS enforced. ADR-024 compliant.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================
-- PRD-017: Player Recent Sessions RPC
-- Published contract for VisitService
-- =============================================================
-- WS5: Read RPC for paginated closed sessions with aggregates
-- Composes from:
--   - visit table (owned by VisitService)
--   - rpc_get_visit_loyalty_summary (LoyaltyService)
--   - rpc_get_visit_last_segment (RatingSlipService)
--   - visit_financial_summary view (PlayerFinancialService)

-- Drop existing function if exists (for idempotency)
DROP FUNCTION IF EXISTS rpc_get_player_recent_sessions(uuid, uuid, int, text);

-- Create the recent sessions RPC
-- SECURITY INVOKER: RLS enforced via caller's context
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
  v_context_staff_role text;
  v_context_casino_id uuid;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling compatibility
  -- =======================================================================
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')
  );

  PERFORM set_rls_context(
    COALESCE(
      NULLIF(current_setting('app.actor_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
    ),
    p_casino_id,
    v_context_staff_role
  );

  -- Validate casino_id parameter matches caller's context
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

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

-- Add function comment for documentation
COMMENT ON FUNCTION rpc_get_player_recent_sessions(uuid, uuid, int, text) IS
  'PRD-017 WS5: Published contract for VisitService. Returns paginated recent closed sessions for a player with aggregates from multiple contexts. Separately returns any open visit. Returns {sessions: Array, next_cursor: string|null, open_visit: object|null}. SECURITY INVOKER - RLS enforced.';

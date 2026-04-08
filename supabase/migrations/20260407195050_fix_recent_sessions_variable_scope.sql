-- ============================================================================
-- Migration: Fix variable scope in rpc_get_player_recent_sessions
-- Created: 2026-04-07
-- Issue: v_open_visit_obj declared in nested DECLARE block goes out of scope
--        before the RETURN statement references it → runtime error:
--        "column v_open_visit_obj does not exist"
-- Fix: Move v_open_visit_obj (and related vars) to top-level DECLARE block,
--      remove nested DECLARE...BEGIN...END wrapper.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_get_player_recent_sessions(
  p_player_id uuid,
  p_limit integer DEFAULT 5,
  p_cursor text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
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
  v_casino_id uuid;
  -- Hoisted from nested block to fix scope bug
  v_open_visit_obj jsonb := NULL;
  v_open_loyalty jsonb;
  v_open_last_segment jsonb;
  v_open_financial RECORD;
  v_open_segment_count int;
BEGIN
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id not set in RLS context';
  END IF;

  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'INVALID_LIMIT: Limit must be between 1 and 100';
  END IF;

  IF p_cursor IS NOT NULL THEN
    BEGIN
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

  -- Check for open visit
  SELECT v.id AS visit_id, v.visit_group_id, v.started_at, v.ended_at, v.casino_id, v.player_id
  INTO v_open_visit
  FROM visit v
  WHERE v.casino_id = v_casino_id
    AND v.player_id = p_player_id
    AND v.ended_at IS NULL
  LIMIT 1;

  -- Fetch closed sessions (last 7 days)
  FOR v_session_record IN
    SELECT v.id AS visit_id, v.visit_group_id, v.started_at, v.ended_at, v.casino_id
    FROM visit v
    WHERE v.casino_id = v_casino_id
      AND v.player_id = p_player_id
      AND v.ended_at IS NOT NULL
      AND v.ended_at >= (NOW() - INTERVAL '7 days')
      AND (
        p_cursor IS NULL
        OR v.ended_at < v_cursor_ended_at
        OR (v.ended_at = v_cursor_ended_at AND v.id < v_cursor_visit_id)
      )
    ORDER BY v.ended_at DESC, v.id DESC
    LIMIT p_limit + 1
  LOOP
    IF v_sessions_fetched >= p_limit THEN
      v_next_cursor := encode(
        convert_to(
          to_char(v_session_record.ended_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|' || v_session_record.visit_id::text,
          'UTF8'
        ),
        'base64'
      );
      EXIT;
    END IF;

    v_loyalty_summary := rpc_get_visit_loyalty_summary(v_session_record.visit_id);
    v_last_segment := rpc_get_visit_last_segment(v_session_record.visit_id);

    SELECT total_in, total_out, net_amount
    INTO v_financial_summary
    FROM visit_financial_summary
    WHERE visit_id = v_session_record.visit_id;

    SELECT COUNT(*)::int INTO v_segment_count
    FROM rating_slip
    WHERE visit_id = v_session_record.visit_id;

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

  -- Build open_visit object if exists (variables now in top-level scope)
  IF v_open_visit IS NOT NULL THEN
    v_open_loyalty := rpc_get_visit_loyalty_summary(v_open_visit.visit_id);
    v_open_last_segment := rpc_get_visit_last_segment(v_open_visit.visit_id);

    SELECT total_in, total_out, net_amount
    INTO v_open_financial
    FROM visit_financial_summary
    WHERE visit_id = v_open_visit.visit_id;

    SELECT COUNT(*)::int INTO v_open_segment_count
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

  RETURN jsonb_build_object(
    'sessions', v_sessions,
    'next_cursor', v_next_cursor,
    'open_visit', v_open_visit_obj
  );
END;
$function$;

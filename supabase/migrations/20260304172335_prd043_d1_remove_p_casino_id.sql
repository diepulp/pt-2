-- ============================================================================
-- PRD-043 Day-1: Remove p_casino_id parameter from 6 RPCs
-- ============================================================================
-- Each RPC now derives casino_id from authoritative context (ADR-024)
-- instead of accepting it as a spoofable parameter.
--
-- RPCs remediated:
--   1. rpc_get_dashboard_tables_with_counts  (STABLE, INVOKER)
--   2. rpc_get_player_last_session_context   (VOLATILE, INVOKER)
--   3. rpc_get_player_recent_sessions        (VOLATILE, INVOKER)
--   4. rpc_get_rating_slip_modal_data        (STABLE, INVOKER)
--   5. rpc_start_rating_slip                 (VOLATILE, SECURITY DEFINER)
--   6. rpc_issue_mid_session_reward          (VOLATILE, INVOKER)
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1. rpc_get_dashboard_tables_with_counts
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.rpc_get_dashboard_tables_with_counts(uuid);

CREATE OR REPLACE FUNCTION public.rpc_get_dashboard_tables_with_counts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_casino_id uuid;
BEGIN
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id not set in RLS context';
  END IF;

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
        AND casino_id = v_casino_id
      GROUP BY table_id
    ) slip_counts ON slip_counts.table_id = gt.id
    WHERE gt.casino_id = v_casino_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_get_dashboard_tables_with_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_dashboard_tables_with_counts() TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. rpc_get_player_last_session_context
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.rpc_get_player_last_session_context(uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_get_player_last_session_context(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_last_visit RECORD;
  v_last_segment jsonb;
  v_casino_id uuid;
BEGIN
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id not set in RLS context';
  END IF;

  SELECT id, visit_group_id, ended_at
  INTO v_last_visit
  FROM visit
  WHERE casino_id = v_casino_id
    AND player_id = p_player_id
    AND ended_at IS NOT NULL
  ORDER BY ended_at DESC, id DESC
  LIMIT 1;

  IF v_last_visit IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT rpc_get_visit_last_segment(v_last_visit.id)
  INTO v_last_segment;

  IF v_last_segment IS NULL THEN
    RETURN NULL;
  END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.rpc_get_player_last_session_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_player_last_session_context(uuid) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. rpc_get_player_recent_sessions
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.rpc_get_player_recent_sessions(uuid, uuid, integer, text);

CREATE OR REPLACE FUNCTION public.rpc_get_player_recent_sessions(p_player_id uuid, p_limit integer DEFAULT 5, p_cursor text DEFAULT NULL::text)
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

  SELECT v.id AS visit_id, v.visit_group_id, v.started_at, v.ended_at, v.casino_id, v.player_id
  INTO v_open_visit
  FROM visit v
  WHERE v.casino_id = v_casino_id
    AND v.player_id = p_player_id
    AND v.ended_at IS NULL
  LIMIT 1;

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

    DECLARE
      v_duration_seconds int;
    BEGIN
      v_duration_seconds := EXTRACT(EPOCH FROM (v_session_record.ended_at - v_session_record.started_at))::int;
    END;

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

  DECLARE
    v_open_visit_obj jsonb := NULL;
    v_open_loyalty jsonb;
    v_open_last_segment jsonb;
    v_open_financial RECORD;
    v_open_segment_count int;
  BEGIN
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
  END;

  RETURN jsonb_build_object(
    'sessions', v_sessions,
    'next_cursor', v_next_cursor,
    'open_visit', v_open_visit_obj
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_get_player_recent_sessions(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_player_recent_sessions(uuid, integer, text) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. rpc_get_rating_slip_modal_data
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.rpc_get_rating_slip_modal_data(uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_get_rating_slip_modal_data(p_slip_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_casino_id uuid;
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
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id not set in RLS context';
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
    AND rs.casino_id = v_casino_id;

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
    AND rsp.casino_id = v_casino_id;

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
         AND rsp.casino_id = v_casino_id),
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
    AND v.casino_id = v_casino_id;

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
    AND gt.casino_id = v_casino_id;

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
      AND pl.casino_id = v_casino_id;

    -- Calculate loyalty suggestion for open slips (inline evaluate_session_reward_suggestion logic)
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
    COALESCE(vfs.total_in, 0) AS total_in,
    COALESCE(vfs.total_out, 0) AS total_out,
    COALESCE(vfs.net_amount, 0) AS net_amount
  INTO v_financial
  FROM visit_financial_summary vfs
  WHERE vfs.visit_id = v_slip.visit_id
    AND vfs.casino_id = v_casino_id;

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
      AND rs.casino_id = v_casino_id
    LEFT JOIN game_settings gs ON gs.game_type = gt.type AND gs.casino_id = v_casino_id
    WHERE gt.casino_id = v_casino_id
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
      'casinoId', v_casino_id,
      'tableId', v_slip.table_id,
      'tableLabel', v_table.label,
      'tableType', v_table.type,
      'seatNumber', v_slip.seat_number,
      'averageBet', COALESCE(v_slip.average_bet, 0),
      'startTime', v_slip.start_time,
      'endTime', v_slip.end_time,
      'status', v_slip.status,
      'gamingDay', v_visit.gaming_day::text,
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
$function$;

REVOKE ALL ON FUNCTION public.rpc_get_rating_slip_modal_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_rating_slip_modal_data(uuid) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. rpc_start_rating_slip (SECURITY DEFINER)
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.rpc_start_rating_slip(uuid, uuid, uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_start_rating_slip(p_visit_id uuid, p_table_id uuid, p_seat_number text, p_game_settings jsonb)
 RETURNS rating_slip
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, public
AS $function$
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
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id not set in RLS context';
  END IF;

  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT player_id, visit_kind INTO v_player_id, v_visit_kind
  FROM visit
  WHERE id = p_visit_id
    AND casino_id = v_casino_id
    AND ended_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_OPEN: Visit % is not active', p_visit_id;
  END IF;

  v_accrual_kind := CASE
    WHEN v_visit_kind = 'gaming_ghost_unrated' THEN 'compliance_only'
    ELSE 'loyalty'
  END;

  IF NOT EXISTS (
    SELECT 1 FROM gaming_table
    WHERE id = p_table_id
      AND casino_id = v_casino_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'TABLE_NOT_ACTIVE: Table % is not active', p_table_id;
  END IF;

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
      'policy_version', 'loyalty_points_v1'
    ),
    '_source', jsonb_build_object(
      'house_edge', CASE WHEN v_game_settings_lookup.house_edge IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'decisions_per_hour', CASE WHEN v_game_settings_lookup.decisions_per_hour IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'points_conversion_rate', CASE WHEN v_game_settings_lookup.points_conversion_rate IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'point_multiplier', CASE WHEN v_game_settings_lookup.point_multiplier IS NOT NULL THEN 'game_settings' ELSE 'default' END
    )
  );

  INSERT INTO rating_slip (
    casino_id, visit_id, table_id,
    seat_number, game_settings, policy_snapshot, accrual_kind, status, start_time
  )
  VALUES (
    v_casino_id, p_visit_id, p_table_id,
    p_seat_number, p_game_settings, v_policy_snapshot, v_accrual_kind, 'open', now()
  )
  RETURNING * INTO v_result;

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
$function$;

REVOKE ALL ON FUNCTION public.rpc_start_rating_slip(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_start_rating_slip(uuid, uuid, text, jsonb) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. rpc_issue_mid_session_reward
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.rpc_issue_mid_session_reward(uuid, uuid, uuid, integer, text, loyalty_reason);

CREATE OR REPLACE FUNCTION public.rpc_issue_mid_session_reward(p_player_id uuid, p_rating_slip_id uuid, p_points integer, p_idempotency_key text DEFAULT NULL::text, p_reason loyalty_reason DEFAULT 'manual_reward'::loyalty_reason)
 RETURNS TABLE(ledger_id uuid, balance_after integer)
 LANGUAGE plpgsql
 SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_ledger_id uuid;
  v_balance_after int;
  v_now timestamptz := now();
  v_casino_id uuid;
  v_context_actor_id uuid;
BEGIN
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id not set in RLS context';
  END IF;

  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_points <= 0 THEN
    RAISE EXCEPTION 'Points must be positive';
  END IF;

  PERFORM 1
    FROM rating_slip rs
    JOIN visit v ON v.id = rs.visit_id
   WHERE rs.id = p_rating_slip_id
     AND v.player_id = p_player_id
     AND rs.casino_id = v_casino_id
     AND rs.status IN ('open','paused');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rating slip not eligible for mid-session reward';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
        FROM loyalty_ledger
       WHERE idempotency_key = p_idempotency_key
         AND casino_id = v_casino_id
    ) THEN
      RETURN QUERY
        SELECT ll.id,
               (
                 SELECT current_balance
                   FROM player_loyalty
                  WHERE player_id = p_player_id
                    AND casino_id = v_casino_id
               )
          FROM loyalty_ledger ll
         WHERE ll.idempotency_key = p_idempotency_key
           AND ll.casino_id = v_casino_id;
      RETURN;
    END IF;
  END IF;

  INSERT INTO loyalty_ledger (
    casino_id, player_id, rating_slip_id, staff_id,
    points_delta, reason, idempotency_key, created_at
  )
  VALUES (
    v_casino_id, p_player_id, p_rating_slip_id,
    v_context_actor_id, p_points,
    COALESCE(p_reason, 'manual_reward'),
    p_idempotency_key, v_now
  )
  RETURNING id INTO v_ledger_id;

  INSERT INTO player_loyalty (player_id, casino_id, current_balance, updated_at)
  VALUES (p_player_id, v_casino_id, p_points, v_now)
  ON CONFLICT (player_id, casino_id)
  DO UPDATE SET
    current_balance = player_loyalty.current_balance + p_points,
    updated_at = v_now
  RETURNING current_balance INTO v_balance_after;

  RETURN QUERY SELECT v_ledger_id, v_balance_after;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_issue_mid_session_reward(uuid, uuid, integer, text, loyalty_reason) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_issue_mid_session_reward(uuid, uuid, integer, text, loyalty_reason) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- Reload PostgREST schema cache
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

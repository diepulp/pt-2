-- ============================================================================
-- Migration: Fix SEC-S3 — Set search_path on 36 functions (Option A)
-- Created: 2026-04-03
-- Source: SUPABASE-ADVISOR-REPORT-2026-04-02.md (SEC-S3)
-- ============================================================================
-- Functions without explicit search_path are vulnerable to search-path
-- hijacking (CWE-426). Setting search_path = '' forces all object
-- references to be schema-qualified at runtime.
--
-- PART 1: 17 functions that access tables/call other functions.
--         These require CREATE OR REPLACE with schema-qualified bodies
--         because ALTER FUNCTION alone would break runtime resolution.
--
-- PART 2: 19 functions that are pure computation, only touch NEW/OLD,
--         or already use schema-qualified references.
--         These use ALTER FUNCTION (metadata-only, safe).
-- ============================================================================


-- ============================================================================
-- PART 1: CREATE OR REPLACE — functions with unqualified references (17)
-- ============================================================================


-- 1/17: set_fin_txn_gaming_day()
-- Source: 20260116184731_fix_gaming_day_timezone_triggers.sql
CREATE OR REPLACE FUNCTION public.set_fin_txn_gaming_day()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.gaming_day := public.compute_gaming_day(NEW.casino_id, COALESCE(NEW.created_at, now()));
  RETURN NEW;
END;
$$;


-- 2/17: assert_table_context_casino()
-- Source: 00000000000000_baseline_srm.sql
CREATE OR REPLACE FUNCTION public.assert_table_context_casino()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_table_casino uuid;
BEGIN
  SELECT casino_id INTO v_table_casino
    FROM public.gaming_table
   WHERE id = NEW.table_id;

  IF v_table_casino IS NULL THEN
    RAISE EXCEPTION 'Gaming table % not found', NEW.table_id;
  END IF;

  IF NEW.casino_id <> v_table_casino THEN
    RAISE EXCEPTION 'Casino mismatch for table % (expected %, got %)',
      NEW.table_id, v_table_casino, NEW.casino_id;
  END IF;

  RETURN NEW;
END;
$$;


-- 3/17: compute_gaming_day(uuid, timestamptz) — Layer 2 casino-lookup overload
-- Source: 20251129161956_prd000_casino_foundation.sql
-- Note: SECURITY DEFINER preserved. GRANTs/REVOKEs from PRD-027 are retained
-- by CREATE OR REPLACE (only DROP + CREATE resets privileges).
CREATE OR REPLACE FUNCTION public.compute_gaming_day(
  p_casino_id uuid,
  p_timestamp timestamptz DEFAULT now()
) RETURNS date
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start_time time;
  v_timezone text;
  v_local_time timestamptz;
  v_local_date date;
  v_start_minutes int;
  v_current_minutes int;
BEGIN
  SELECT gaming_day_start_time::time, timezone
  INTO v_start_time, v_timezone
  FROM public.casino_settings
  WHERE casino_id = p_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASINO_SETTINGS_NOT_FOUND: No settings for casino %', p_casino_id
      USING ERRCODE = 'P0002';
  END IF;

  v_local_time := p_timestamp AT TIME ZONE v_timezone;
  v_local_date := v_local_time::date;

  v_start_minutes := EXTRACT(HOUR FROM v_start_time) * 60 + EXTRACT(MINUTE FROM v_start_time);
  v_current_minutes := EXTRACT(HOUR FROM v_local_time) * 60 + EXTRACT(MINUTE FROM v_local_time);

  IF v_current_minutes < v_start_minutes THEN
    RETURN v_local_date - 1;
  END IF;

  RETURN v_local_date;
END;
$$;


-- 4/17: evaluate_session_reward_suggestion(uuid, timestamptz)
-- Source: 20251213010000_prd004_loyalty_rpcs.sql
CREATE OR REPLACE FUNCTION public.evaluate_session_reward_suggestion(
  p_rating_slip_id uuid,
  p_as_of_ts timestamptz DEFAULT now()
)
RETURNS TABLE (
  suggested_theo numeric,
  suggested_points int,
  policy_version text,
  max_recommended_points int,
  notes text
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_slip record;
  v_loyalty_snapshot jsonb;
  v_theo numeric;
  v_points int;
BEGIN
  SELECT * INTO v_slip
  FROM public.rating_slip
  WHERE id = p_rating_slip_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  v_loyalty_snapshot := v_slip.policy_snapshot->'loyalty';

  IF v_loyalty_snapshot IS NULL THEN
    RETURN QUERY SELECT
      0::numeric,
      0::int,
      'unknown'::text,
      0::int,
      'No loyalty policy snapshot available for this slip'::text;
    RETURN;
  END IF;

  v_theo := public.calculate_theo_from_snapshot(v_slip, v_loyalty_snapshot);
  v_points := ROUND(v_theo * (v_loyalty_snapshot->>'points_conversion_rate')::numeric);

  IF v_points < 0 THEN
    v_points := 0;
  END IF;

  RETURN QUERY SELECT
    v_theo,
    v_points,
    COALESCE(v_loyalty_snapshot->>'policy_version', 'unknown'),
    v_points,
    'Suggested points based on session-to-date theo calculation'::text;
END;
$$;


-- 5/17: compute_slip_final_seconds(uuid)
-- Source: 20251222002623_prd016_compute_slip_final_seconds.sql
CREATE OR REPLACE FUNCTION public.compute_slip_final_seconds(p_slip_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_total_elapsed_seconds INTEGER;
  v_total_pause_seconds INTEGER;
BEGIN
  SELECT start_time, end_time
  INTO v_start_time, v_end_time
  FROM public.rating_slip
  WHERE id = p_slip_id;

  IF v_start_time IS NULL OR v_end_time IS NULL THEN
    RETURN NULL;
  END IF;

  v_total_elapsed_seconds := EXTRACT(EPOCH FROM (v_end_time - v_start_time))::INTEGER;

  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (
      COALESCE(ended_at, v_end_time) - started_at
    ))::INTEGER
  ), 0)
  INTO v_total_pause_seconds
  FROM public.rating_slip_pause
  WHERE rating_slip_id = p_slip_id
    AND started_at < v_end_time;

  RETURN GREATEST(0, v_total_elapsed_seconds - v_total_pause_seconds);
END;
$$;


-- 6/17: rpc_get_visit_live_view(uuid, boolean, integer)
-- Source: 20251229154013_adr024_dashboard_rpcs.sql
CREATE OR REPLACE FUNCTION public.rpc_get_visit_live_view(
  p_visit_id UUID,
  p_include_segments BOOLEAN DEFAULT FALSE,
  p_segments_limit INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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
  PERFORM public.set_rls_context_from_staff();

  SELECT
    v.id AS visit_id,
    v.player_id,
    p.first_name AS player_first_name,
    p.last_name AS player_last_name,
    CASE WHEN v.ended_at IS NULL THEN 'open' ELSE 'closed' END AS visit_status,
    v.started_at
  INTO v_visit
  FROM public.visit v
  INNER JOIN public.player p ON p.id = v.player_id
  WHERE v.id = p_visit_id;

  IF v_visit.visit_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    rs.id AS slip_id,
    rs.table_id,
    gt.label AS table_name,
    rs.seat_number,
    rs.status,
    rs.start_time AS started_at,
    rs.average_bet
  INTO v_current_segment
  FROM public.rating_slip rs
  INNER JOIN public.gaming_table gt ON gt.id = rs.table_id
  WHERE rs.visit_id = p_visit_id
    AND rs.status IN ('open', 'paused')
  LIMIT 1;

  SELECT COALESCE(SUM(final_duration_seconds), 0)
  INTO v_total_duration_seconds
  FROM public.rating_slip
  WHERE visit_id = p_visit_id
    AND final_duration_seconds IS NOT NULL;

  IF v_current_segment.slip_id IS NOT NULL THEN
    SELECT public.rpc_get_rating_slip_duration(v_current_segment.slip_id)
    INTO v_active_slip_duration;
    v_total_duration_seconds := v_total_duration_seconds + COALESCE(v_active_slip_duration, 0);
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_buy_in
  FROM public.player_financial_transaction
  WHERE visit_id = p_visit_id
    AND direction = 'in';

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_cash_out
  FROM public.player_financial_transaction
  WHERE visit_id = p_visit_id
    AND direction = 'out';

  v_total_net := v_total_buy_in - v_total_cash_out;
  v_points_earned := 0;

  SELECT COUNT(*)
  INTO v_segment_count
  FROM public.rating_slip
  WHERE visit_id = p_visit_id;

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
      FROM public.rating_slip rs
      WHERE rs.visit_id = p_visit_id
      ORDER BY rs.start_time DESC
      LIMIT p_segments_limit
    ) rs
    INNER JOIN public.gaming_table gt ON gt.id = rs.table_id;

    v_result := v_result || jsonb_build_object('segments', COALESCE(v_segments, '[]'::jsonb));
  END IF;

  RETURN v_result;
END;
$$;


-- 7/17: trg_pit_cash_observation_set_gaming_day()
-- Source: 20260106021105_prd_ops_cash_obs_001_pit_cash_observation.sql
CREATE OR REPLACE FUNCTION public.trg_pit_cash_observation_set_gaming_day()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.gaming_day := public.compute_gaming_day(NEW.casino_id, COALESCE(NEW.observed_at, now()));
  RETURN NEW;
END;
$$;


-- 8/17: set_table_session_gaming_day()
-- Source: 20260116184731_fix_gaming_day_timezone_triggers.sql
CREATE OR REPLACE FUNCTION public.set_table_session_gaming_day()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.gaming_day := public.compute_gaming_day(NEW.casino_id, COALESCE(NEW.opened_at, now()));
  RETURN NEW;
END;
$$;


-- 9/17: set_visit_gaming_day()
-- Source: 20260116194341_adr026_gaming_day_scoped_visits.sql
CREATE OR REPLACE FUNCTION public.set_visit_gaming_day()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.gaming_day := public.compute_gaming_day(NEW.casino_id, COALESCE(NEW.started_at, now()));
  RETURN NEW;
END;
$$;


-- 10/17: guard_stale_gaming_day_write()
-- Source: 20260117001606_guard_stale_gaming_day_writes.sql
CREATE OR REPLACE FUNCTION public.guard_stale_gaming_day_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_slip_gaming_day date;
  v_visit_gaming_day date;
  v_current_gaming_day date;
  v_casino_id uuid;
BEGIN
  v_casino_id := NEW.casino_id;

  v_current_gaming_day := public.compute_gaming_day(v_casino_id, now());

  IF NEW.rating_slip_id IS NOT NULL THEN
    SELECT v.gaming_day INTO v_slip_gaming_day
    FROM public.rating_slip rs
    JOIN public.visit v ON v.id = rs.visit_id
    WHERE rs.id = NEW.rating_slip_id
      AND rs.casino_id = v_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND: slip % not found for casino %',
        NEW.rating_slip_id, v_casino_id
        USING ERRCODE = 'P0002';
    END IF;

    IF v_slip_gaming_day <> v_current_gaming_day THEN
      RAISE EXCEPTION 'STALE_GAMING_DAY_CONTEXT: Cannot record transaction for gaming day % (current: %)',
        v_slip_gaming_day, v_current_gaming_day
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.visit_id IS NOT NULL THEN
    SELECT gaming_day INTO v_visit_gaming_day
    FROM public.visit
    WHERE id = NEW.visit_id
      AND casino_id = v_casino_id;

    IF FOUND AND v_visit_gaming_day <> v_current_gaming_day THEN
      RAISE EXCEPTION 'STALE_GAMING_DAY_CONTEXT: Cannot record transaction for visit gaming day % (current: %)',
        v_visit_gaming_day, v_current_gaming_day
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- 11/17: rpc_shift_active_visitors_summary()
-- Source: 20260119201552_add_active_visitors_summary_rpc.sql
CREATE OR REPLACE FUNCTION public.rpc_shift_active_visitors_summary()
RETURNS TABLE (
  rated_count bigint,
  unrated_count bigint,
  total_count bigint,
  rated_percentage numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_casino_id uuid;
BEGIN
  PERFORM public.set_rls_context_from_staff();
  v_casino_id := current_setting('app.casino_id', true)::uuid;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE v.visit_kind = 'gaming_identified_rated') AS rated_count,
    COUNT(*) FILTER (WHERE v.visit_kind = 'gaming_ghost_unrated') AS unrated_count,
    COUNT(*) AS total_count,
    ROUND(
      COUNT(*) FILTER (WHERE v.visit_kind = 'gaming_identified_rated')::numeric /
      NULLIF(COUNT(*), 0) * 100,
      1
    ) AS rated_percentage
  FROM public.rating_slip rs
  INNER JOIN public.visit v ON v.id = rs.visit_id
  WHERE rs.status IN ('open', 'paused')
    AND rs.casino_id = v_casino_id;
END;
$$;


-- 12/17: set_game_settings_side_bet_casino_id()
-- Source: 20260210081119_prd029_game_settings_schema_evolution.sql
CREATE OR REPLACE FUNCTION public.set_game_settings_side_bet_casino_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.casino_id := (SELECT casino_id FROM public.game_settings WHERE id = NEW.game_settings_id);
  IF NEW.casino_id IS NULL THEN
    RAISE EXCEPTION 'Parent game_settings row not found for id %', NEW.game_settings_id;
  END IF;
  RETURN NEW;
END;
$$;


-- 13/17: trg_gaming_table_game_settings_tenant_check()
-- Source: 20260212210814_add_gaming_table_game_settings_fk.sql
CREATE OR REPLACE FUNCTION public.trg_gaming_table_game_settings_tenant_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_gs_casino_id uuid;
BEGIN
  IF NEW.game_settings_id IS NOT NULL THEN
    SELECT casino_id INTO v_gs_casino_id
    FROM public.game_settings
    WHERE id = NEW.game_settings_id;

    IF v_gs_casino_id IS NULL THEN
      RAISE EXCEPTION 'game_settings_id "%" does not exist', NEW.game_settings_id;
    END IF;

    IF v_gs_casino_id != NEW.casino_id THEN
      RAISE EXCEPTION 'game_settings_id "%" belongs to a different casino', NEW.game_settings_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- 14/17: rpc_get_rating_slip_duration(uuid, timestamptz)
-- Source: 20251128221408_rating_slip_pause_tracking.sql
CREATE OR REPLACE FUNCTION public.rpc_get_rating_slip_duration(
  p_rating_slip_id UUID,
  p_as_of TIMESTAMPTZ DEFAULT now()
) RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_status public.rating_slip_status;
  v_paused_ms BIGINT;
BEGIN
  SELECT start_time, end_time, status
  INTO v_start_time, v_end_time, v_status
  FROM public.rating_slip
  WHERE id = p_rating_slip_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_status = 'closed' AND v_end_time IS NOT NULL THEN
    v_end_time := v_end_time;
  ELSE
    v_end_time := p_as_of;
  END IF;

  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (COALESCE(ended_at, v_end_time) - started_at)) * 1000
  ), 0)::BIGINT INTO v_paused_ms
  FROM public.rating_slip_pause
  WHERE rating_slip_id = p_rating_slip_id
    AND started_at <= v_end_time;

  RETURN GREATEST(0,
    FLOOR((EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000 - v_paused_ms) / 1000)
  )::INTEGER;
END;
$$;


-- 15/17: rpc_get_dashboard_stats()
-- Source: 20260126163939_perf002_dashboard_stats_rpc.sql
CREATE OR REPLACE FUNCTION public.rpc_get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_casino_id uuid;
  v_active_tables_count integer;
  v_open_slips_count integer;
  v_checked_in_players_count integer;
BEGIN
  PERFORM public.set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set';
  END IF;

  SELECT COUNT(*)
  INTO v_active_tables_count
  FROM public.gaming_table
  WHERE casino_id = v_casino_id AND status = 'active';

  SELECT COUNT(*)
  INTO v_open_slips_count
  FROM public.rating_slip
  WHERE casino_id = v_casino_id AND status IN ('open', 'paused');

  SELECT COUNT(DISTINCT player_id)
  INTO v_checked_in_players_count
  FROM public.visit
  WHERE casino_id = v_casino_id
    AND ended_at IS NULL
    AND player_id IS NOT NULL;

  RETURN jsonb_build_object(
    'activeTablesCount', v_active_tables_count,
    'openSlipsCount', v_open_slips_count,
    'checkedInPlayersCount', v_checked_in_players_count
  );
END;
$$;


-- 16/17: rpc_list_active_players_casino_wide(int, text)
-- Source: 20260118151907_add_active_players_casino_wide_rpc.sql
CREATE OR REPLACE FUNCTION public.rpc_list_active_players_casino_wide(
  p_limit int DEFAULT 100,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  slip_id uuid,
  visit_id uuid,
  table_id uuid,
  table_name text,
  pit_name text,
  seat_number text,
  start_time timestamptz,
  status text,
  average_bet numeric,
  player_id uuid,
  player_first_name text,
  player_last_name text,
  player_birth_date date,
  player_tier text
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_casino_id uuid;
BEGIN
  PERFORM public.set_rls_context_from_staff();
  v_casino_id := current_setting('app.casino_id', true)::uuid;

  RETURN QUERY
  SELECT
    rs.id AS slip_id,
    rs.visit_id,
    rs.table_id,
    gt.label AS table_name,
    gt.pit AS pit_name,
    rs.seat_number,
    rs.start_time,
    rs.status::text,
    rs.average_bet,
    p.id AS player_id,
    p.first_name AS player_first_name,
    p.last_name AS player_last_name,
    p.birth_date AS player_birth_date,
    pl.tier AS player_tier
  FROM public.rating_slip rs
  INNER JOIN public.visit v ON v.id = rs.visit_id
  INNER JOIN public.gaming_table gt ON gt.id = rs.table_id
  LEFT JOIN public.player p ON p.id = v.player_id
  LEFT JOIN public.player_loyalty pl ON pl.player_id = v.player_id
                              AND pl.casino_id = v.casino_id
  WHERE rs.status IN ('open', 'paused')
    AND rs.casino_id = v_casino_id
    AND (
      p_search IS NULL
      OR p_search = ''
      OR p.first_name ILIKE '%' || p_search || '%'
      OR p.last_name ILIKE '%' || p_search || '%'
      OR (p.first_name || ' ' || p.last_name) ILIKE '%' || p_search || '%'
    )
  ORDER BY rs.start_time DESC
  LIMIT p_limit;
END;
$$;


-- 17/17: rpc_list_closed_slips_for_gaming_day(date, int, timestamptz, uuid)
-- Source: 20260118013830_fix_closed_slips_rpc_column_name.sql
CREATE OR REPLACE FUNCTION public.rpc_list_closed_slips_for_gaming_day(
  p_gaming_day date,
  p_limit int DEFAULT 50,
  p_cursor_end_time timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  visit_id uuid,
  table_id uuid,
  table_name text,
  seat_number text,
  start_time timestamptz,
  end_time timestamptz,
  final_duration_seconds int,
  average_bet numeric,
  player_id uuid,
  player_first_name text,
  player_last_name text,
  player_tier text
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
BEGIN
  PERFORM public.set_rls_context_from_staff();

  RETURN QUERY
  SELECT
    rs.id,
    rs.visit_id,
    rs.table_id,
    gt.label AS table_name,
    rs.seat_number,
    rs.start_time,
    rs.end_time,
    rs.final_duration_seconds,
    rs.average_bet,
    p.id AS player_id,
    p.first_name AS player_first_name,
    p.last_name AS player_last_name,
    pl.tier AS player_tier
  FROM public.rating_slip rs
  INNER JOIN public.visit v ON v.id = rs.visit_id
  INNER JOIN public.gaming_table gt ON gt.id = rs.table_id
  LEFT JOIN public.player p ON p.id = v.player_id
  LEFT JOIN public.player_loyalty pl ON pl.player_id = v.player_id
                              AND pl.casino_id = v.casino_id
  WHERE rs.status = 'closed'
    AND v.gaming_day = p_gaming_day
    AND NOT EXISTS (
      SELECT 1 FROM public.rating_slip successor
      WHERE successor.previous_slip_id = rs.id
    )
    AND (
      p_cursor_end_time IS NULL
      OR (rs.end_time, rs.id) < (p_cursor_end_time, p_cursor_id)
    )
  ORDER BY rs.end_time DESC, rs.id DESC
  LIMIT p_limit + 1;
END;
$$;


-- ============================================================================
-- PART 2: ALTER FUNCTION — safe functions (19)
-- These have no table access or already use schema-qualified references.
-- Metadata-only change is sufficient.
-- Each is marked SEARCH_PATH_SAFE per pre-commit-search-path-safety.sh.
-- ============================================================================

-- SEARCH_PATH_SAFE: pure computation on parameters, no table access
ALTER FUNCTION public.evaluate_mid_session_reward_policy(numeric, integer, jsonb)
  SET search_path = '';

-- SEARCH_PATH_SAFE: trigger sets NEW.updated_at only
ALTER FUNCTION public.update_game_settings_updated_at()
  SET search_path = '';

-- SEARCH_PATH_SAFE: pure SQL math, no table access
ALTER FUNCTION public.compute_gaming_day(timestamptz, interval)
  SET search_path = '';

-- SEARCH_PATH_SAFE: pure computation on record + jsonb parameters
ALTER FUNCTION public.calculate_theo_from_snapshot(record, jsonb)
  SET search_path = '';

-- SEARCH_PATH_SAFE: trigger sets NEW.visit_group_id only
ALTER FUNCTION public.trg_visit_set_group_id()
  SET search_path = '';

-- SEARCH_PATH_SAFE: trigger sets NEW.updated_at and NEW.updated_by only
ALTER FUNCTION public.update_player_identity_updated_at()
  SET search_path = '';

-- SEARCH_PATH_SAFE: raises exception only (immutability guard)
ALTER FUNCTION public.trg_mtl_immutable()
  SET search_path = '';

-- SEARCH_PATH_SAFE: raises exception only (immutability guard)
ALTER FUNCTION public.trg_pit_cash_observation_immutable()
  SET search_path = '';

-- SEARCH_PATH_SAFE: already uses public.casino_settings and public.compute_gaming_day
ALTER FUNCTION public.trg_mtl_entry_set_gaming_day()
  SET search_path = '';

-- SEARCH_PATH_SAFE: trigger sets NEW.updated_at only
ALTER FUNCTION public.trg_promo_program_updated_at()
  SET search_path = '';

-- SEARCH_PATH_SAFE: trigger sets NEW.updated_at only
ALTER FUNCTION public.update_table_session_updated_at()
  SET search_path = '';

-- SEARCH_PATH_SAFE: trigger sets NEW.updated_at only
ALTER FUNCTION public.trg_reward_catalog_updated_at()
  SET search_path = '';

-- SEARCH_PATH_SAFE: trigger sets NEW.updated_at only
ALTER FUNCTION public.trg_loyalty_earn_config_updated_at()
  SET search_path = '';

-- SEARCH_PATH_SAFE: trigger sets NEW.updated_at only
ALTER FUNCTION public.update_game_settings_side_bet_updated_at()
  SET search_path = '';

-- SEARCH_PATH_SAFE: trigger sets NEW.updated_at only
ALTER FUNCTION public.set_import_batch_updated_at()
  SET search_path = '';

-- SEARCH_PATH_SAFE: pure SQL computation on jsonb parameter
ALTER FUNCTION public.chipset_total_cents(jsonb)
  SET search_path = '';

-- SEARCH_PATH_SAFE: compares NEW vs OLD fields only (exclusion lift guard)
ALTER FUNCTION public.trg_player_exclusion_lift_only()
  SET search_path = '';

-- SEARCH_PATH_SAFE: pure SQL on row parameter, no table access
ALTER FUNCTION public.is_exclusion_active(public.player_exclusion)
  SET search_path = '';

-- SEARCH_PATH_SAFE: already uses public.player_exclusion and public.is_exclusion_active
ALTER FUNCTION public.get_player_exclusion_status(uuid, uuid)
  SET search_path = '';


NOTIFY pgrst, 'reload schema';

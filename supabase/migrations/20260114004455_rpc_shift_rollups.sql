-- =====================================================
-- Migration: rpc_shift_pit_metrics and rpc_shift_casino_metrics
-- Created: 2026-01-14
-- Workstream: WS5 - ADDENDUM-TBL-RUNDOWN
-- Purpose: Rollup RPCs for pit-level and casino-level shift metrics aggregation
-- Dependencies: WS4 (rpc_shift_table_metrics)
-- Source: ADDENDUM_TABLE_RUNDOWN_READMODEL_v0.3_PATCH.md
-- =====================================================
--
-- These RPCs aggregate table metrics to pit and casino levels:
--   - rpc_shift_pit_metrics: Aggregate all tables in a specific pit
--   - rpc_shift_casino_metrics: Aggregate all tables in the casino
--
-- Both rollups include:
--   - Inventory-based and estimated win/loss totals
--   - Tables count and telemetry coverage counts
--   - Exception counts (missing snapshots)
--
-- Security: SECURITY INVOKER with set_rls_context_from_staff()
-- =====================================================

BEGIN;

-- ============================================================================
-- RPC: rpc_shift_pit_metrics
-- ============================================================================
-- Purpose: Aggregate shift metrics for all tables in a specific pit
-- Returns: Single row with pit-level rollup metrics
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_shift_pit_metrics(
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_pit_id text,
  p_actor_id uuid DEFAULT NULL  -- Optional: for service-role testing bypass
)
RETURNS TABLE (
  pit_id text,
  window_start timestamptz,
  window_end timestamptz,
  tables_count integer,
  tables_with_opening_snapshot integer,
  tables_with_closing_snapshot integer,
  tables_with_telemetry_count integer,
  tables_good_coverage_count integer,
  tables_grade_estimate integer,
  fills_total_cents bigint,
  credits_total_cents bigint,
  estimated_drop_rated_total_cents bigint,
  estimated_drop_grind_total_cents bigint,
  estimated_drop_buyins_total_cents bigint,
  win_loss_inventory_total_cents bigint,
  win_loss_estimated_total_cents bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
BEGIN
  -- =======================================================================
  -- Input Validation
  -- =======================================================================
  IF p_window_start IS NULL OR p_window_end IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: Both p_window_start and p_window_end are required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_window_end <= p_window_start THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_window_end must be after p_window_start'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_pit_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_pit_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- ADR-024: Context Injection with Service Role Bypass for Testing
  -- =======================================================================
  IF p_actor_id IS NOT NULL THEN
    SELECT s.id, s.casino_id, s.role::text
    INTO v_context_actor_id, v_context_casino_id, v_context_staff_role
    FROM public.staff s
    WHERE s.id = p_actor_id
      AND s.status = 'active';

    IF v_context_actor_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Staff % not found or inactive', p_actor_id
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    PERFORM set_rls_context_from_staff();

    v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
    v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
    v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Authentication required'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_context_actor_id IS NULL OR v_context_casino_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Staff identity or casino context not established'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- =======================================================================
  -- Return Pit Rollup
  -- =======================================================================
  RETURN QUERY
  WITH table_metrics AS (
    SELECT *
    FROM rpc_shift_table_metrics(p_window_start, p_window_end, p_actor_id) tm
    WHERE tm.pit_id = p_pit_id
  )
  SELECT
    p_pit_id AS pit_id,
    p_window_start AS window_start,
    p_window_end AS window_end,
    COUNT(*)::integer AS tables_count,
    COUNT(*) FILTER (WHERE NOT tm.missing_opening_snapshot)::integer AS tables_with_opening_snapshot,
    COUNT(*) FILTER (WHERE NOT tm.missing_closing_snapshot)::integer AS tables_with_closing_snapshot,
    COUNT(*) FILTER (WHERE tm.telemetry_quality != 'NONE')::integer AS tables_with_telemetry_count,
    COUNT(*) FILTER (WHERE tm.telemetry_quality = 'GOOD_COVERAGE')::integer AS tables_good_coverage_count,
    COUNT(*)::integer AS tables_grade_estimate,  -- Always ESTIMATE for MVP
    COALESCE(SUM(tm.fills_total_cents), 0)::bigint AS fills_total_cents,
    COALESCE(SUM(tm.credits_total_cents), 0)::bigint AS credits_total_cents,
    COALESCE(SUM(tm.estimated_drop_rated_cents), 0)::bigint AS estimated_drop_rated_total_cents,
    COALESCE(SUM(tm.estimated_drop_grind_cents), 0)::bigint AS estimated_drop_grind_total_cents,
    COALESCE(SUM(tm.estimated_drop_buyins_cents), 0)::bigint AS estimated_drop_buyins_total_cents,
    COALESCE(SUM(tm.win_loss_inventory_cents), 0)::bigint AS win_loss_inventory_total_cents,
    COALESCE(SUM(tm.win_loss_estimated_cents), 0)::bigint AS win_loss_estimated_total_cents
  FROM table_metrics tm;

END;
$$;

-- Grant permissions
REVOKE ALL ON FUNCTION public.rpc_shift_pit_metrics(timestamptz, timestamptz, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_pit_metrics(timestamptz, timestamptz, text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_pit_metrics(timestamptz, timestamptz, text, uuid) IS
  'ADDENDUM-TBL-RUNDOWN WS5: Aggregate shift metrics for all tables in a specific pit. '
  'Returns inventory and estimated win/loss totals, table counts, and telemetry coverage. '
  'Uses rpc_shift_table_metrics internally and filters by pit_id.';

-- ============================================================================
-- RPC: rpc_shift_casino_metrics
-- ============================================================================
-- Purpose: Aggregate shift metrics for all tables in the casino
-- Returns: Single row with casino-level rollup metrics
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_shift_casino_metrics(
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_actor_id uuid DEFAULT NULL  -- Optional: for service-role testing bypass
)
RETURNS TABLE (
  window_start timestamptz,
  window_end timestamptz,
  tables_count integer,
  pits_count integer,
  tables_with_opening_snapshot integer,
  tables_with_closing_snapshot integer,
  tables_with_telemetry_count integer,
  tables_good_coverage_count integer,
  tables_grade_estimate integer,
  fills_total_cents bigint,
  credits_total_cents bigint,
  estimated_drop_rated_total_cents bigint,
  estimated_drop_grind_total_cents bigint,
  estimated_drop_buyins_total_cents bigint,
  win_loss_inventory_total_cents bigint,
  win_loss_estimated_total_cents bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
BEGIN
  -- =======================================================================
  -- Input Validation
  -- =======================================================================
  IF p_window_start IS NULL OR p_window_end IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: Both p_window_start and p_window_end are required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_window_end <= p_window_start THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_window_end must be after p_window_start'
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- ADR-024: Context Injection with Service Role Bypass for Testing
  -- =======================================================================
  IF p_actor_id IS NOT NULL THEN
    SELECT s.id, s.casino_id, s.role::text
    INTO v_context_actor_id, v_context_casino_id, v_context_staff_role
    FROM public.staff s
    WHERE s.id = p_actor_id
      AND s.status = 'active';

    IF v_context_actor_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Staff % not found or inactive', p_actor_id
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    PERFORM set_rls_context_from_staff();

    v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
    v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
    v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Authentication required'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_context_actor_id IS NULL OR v_context_casino_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Staff identity or casino context not established'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- =======================================================================
  -- Return Casino Rollup
  -- =======================================================================
  RETURN QUERY
  WITH table_metrics AS (
    SELECT *
    FROM rpc_shift_table_metrics(p_window_start, p_window_end, p_actor_id) tm
  )
  SELECT
    p_window_start AS window_start,
    p_window_end AS window_end,
    COUNT(*)::integer AS tables_count,
    COUNT(DISTINCT tm.pit_id)::integer AS pits_count,
    COUNT(*) FILTER (WHERE NOT tm.missing_opening_snapshot)::integer AS tables_with_opening_snapshot,
    COUNT(*) FILTER (WHERE NOT tm.missing_closing_snapshot)::integer AS tables_with_closing_snapshot,
    COUNT(*) FILTER (WHERE tm.telemetry_quality != 'NONE')::integer AS tables_with_telemetry_count,
    COUNT(*) FILTER (WHERE tm.telemetry_quality = 'GOOD_COVERAGE')::integer AS tables_good_coverage_count,
    COUNT(*)::integer AS tables_grade_estimate,  -- Always ESTIMATE for MVP
    COALESCE(SUM(tm.fills_total_cents), 0)::bigint AS fills_total_cents,
    COALESCE(SUM(tm.credits_total_cents), 0)::bigint AS credits_total_cents,
    COALESCE(SUM(tm.estimated_drop_rated_cents), 0)::bigint AS estimated_drop_rated_total_cents,
    COALESCE(SUM(tm.estimated_drop_grind_cents), 0)::bigint AS estimated_drop_grind_total_cents,
    COALESCE(SUM(tm.estimated_drop_buyins_cents), 0)::bigint AS estimated_drop_buyins_total_cents,
    COALESCE(SUM(tm.win_loss_inventory_cents), 0)::bigint AS win_loss_inventory_total_cents,
    COALESCE(SUM(tm.win_loss_estimated_cents), 0)::bigint AS win_loss_estimated_total_cents
  FROM table_metrics tm;

END;
$$;

-- Grant permissions
REVOKE ALL ON FUNCTION public.rpc_shift_casino_metrics(timestamptz, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_casino_metrics(timestamptz, timestamptz, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_casino_metrics(timestamptz, timestamptz, uuid) IS
  'ADDENDUM-TBL-RUNDOWN WS5: Aggregate shift metrics for all tables in the casino. '
  'Returns inventory and estimated win/loss totals, table counts, pit counts, and telemetry coverage. '
  'Uses rpc_shift_table_metrics internally for consistent computation.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

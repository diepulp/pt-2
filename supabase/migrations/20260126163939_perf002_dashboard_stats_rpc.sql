-- ============================================================================
-- Migration: PERF-002 Dashboard Stats Aggregation RPC
-- Created: 2026-01-26
-- Reference: docs/issues/perf/PIT_DASHBOARD_DATA_FLOW_INVESTIGATION.md
-- ADR: ADR-024 (Authoritative Context Derivation)
-- ============================================================================
--
-- This RPC replaces 4 HTTP calls with a single aggregation query:
-- 1. fetchTables (for active count)
-- 2. listRatingSlips (open)
-- 3. listRatingSlips (paused)
-- 4. getVisits (for player count)
--
-- Performance targets:
-- - p95 latency: < 80ms (Fast tier per OBSERVABILITY_SPEC.md)
-- - Index usage: All COUNT queries should use Index Scans
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_casino_id uuid;
  v_active_tables_count integer;
  v_open_slips_count integer;
  v_checked_in_players_count integer;
BEGIN
  -- ADR-024: Authoritative context derivation from staff JWT
  -- This sets app.casino_id, app.actor_id, app.staff_role via SET LOCAL
  PERFORM set_rls_context_from_staff();

  -- Read the derived casino context
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set';
  END IF;

  -- Count active gaming tables
  -- Uses idx_gaming_table_casino_status if it exists
  SELECT COUNT(*)
  INTO v_active_tables_count
  FROM gaming_table
  WHERE casino_id = v_casino_id AND status = 'active';

  -- Count open + paused rating slips
  -- Uses idx_rating_slip_casino_status if it exists
  SELECT COUNT(*)
  INTO v_open_slips_count
  FROM rating_slip
  WHERE casino_id = v_casino_id AND status IN ('open', 'paused');

  -- Count unique players with active visits (ended_at IS NULL)
  -- Uses idx_visit_casino_active if it exists
  SELECT COUNT(DISTINCT player_id)
  INTO v_checked_in_players_count
  FROM visit
  WHERE casino_id = v_casino_id
    AND ended_at IS NULL
    AND player_id IS NOT NULL;

  -- Return aggregated stats as JSONB
  RETURN jsonb_build_object(
    'activeTablesCount', v_active_tables_count,
    'openSlipsCount', v_open_slips_count,
    'checkedInPlayersCount', v_checked_in_players_count
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION rpc_get_dashboard_stats() TO authenticated;

-- Document the RPC for schema introspection
COMMENT ON FUNCTION rpc_get_dashboard_stats IS
  'PERF-002: Aggregates dashboard KPI counts in single RPC call. '
  'ADR-024 compliant: derives casino_id from set_rls_context_from_staff(). '
  'Replaces 4 HTTP calls (fetchTables, listRatingSlips×2, getVisits). '
  'SLO: p95 < 80ms (Fast tier).';

-- Notify PostgREST to reload schema (enables RPC discovery)
NOTIFY pgrst, 'reload schema';

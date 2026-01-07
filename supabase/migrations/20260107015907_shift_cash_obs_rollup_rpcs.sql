-- =====================================================
-- Migration: PRD-SHIFT-DASHBOARDS v0.2 PATCH - WS1 Rollup RPCs
-- Created: 2026-01-07 01:59:07
-- PRD Reference: docs/10-prd/PRD-Shift-Dashboards-Shift-Reports-v0.2_PATCH_cash-observations.md
-- EXEC-SPEC: docs/20-architecture/specs/PRD-SHIFT-DASHBOARDS-v0.2-PATCH/EXECUTION-SPEC.md
-- Workstream: WS1 - Rollup RPCs
-- Dependencies: pit_cash_observation table (PRD-OPS-CASH-OBS-001)
-- =====================================================
-- This migration creates SECURITY INVOKER RPCs for cash observation rollups:
--   rpc_shift_cash_obs_table() - Table-level rollups
--   rpc_shift_cash_obs_pit() - Pit-level rollups
--   rpc_shift_cash_obs_casino() - Casino-level rollups (all observations)
--
-- TELEMETRY-ONLY: These rollups are observational, NOT authoritative Drop/Win/Hold
--
-- Security Requirements (ADR-024):
--   - SECURITY INVOKER (caller's RLS context)
--   - Calls set_rls_context_from_staff() as first statement
--   - Derives casino scope from context (no p_casino_id input)
--
-- Join Path:
--   pit_cash_observation.rating_slip_id -> rating_slip.id
--   rating_slip.table_id -> gaming_table.id
--   gaming_table.pit -> pit grouping
--
-- Rollup Fields (per SHIFT_METRICS_CATALOG §3.7):
--   - cash_out_observed_estimate_total: SUM(amount) WHERE direction='out' AND amount_kind='estimate'
--   - cash_out_observed_confirmed_total: SUM(amount) WHERE direction='out' AND amount_kind='cage_confirmed'
--   - cash_out_observation_count: COUNT(*) WHERE direction='out'
--   - cash_out_last_observed_at: MAX(observed_at) WHERE direction='out'
-- =====================================================

BEGIN;

-- ============================================================================
-- RPC: rpc_shift_cash_obs_table
-- ============================================================================
-- Table-level rollups grouped by gaming_table.
-- Only includes observations linked to a rating slip (has table context).
-- Results ordered by estimate_total DESC for easy identification of high-activity tables.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_shift_cash_obs_table(
  p_start_ts TIMESTAMPTZ,
  p_end_ts TIMESTAMPTZ,
  p_table_id UUID DEFAULT NULL  -- Optional filter to single table
)
RETURNS TABLE (
  table_id UUID,
  table_label TEXT,
  pit TEXT,
  cash_out_observed_estimate_total NUMERIC,
  cash_out_observed_confirmed_total NUMERIC,
  cash_out_observation_count BIGINT,
  cash_out_last_observed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- ADR-024: Establish RLS context from authenticated staff
  PERFORM set_rls_context_from_staff();

  RETURN QUERY
  SELECT
    rs.table_id,
    gt.label AS table_label,
    gt.pit,
    COALESCE(SUM(pco.amount) FILTER (WHERE pco.direction = 'out' AND pco.amount_kind = 'estimate'), 0)::NUMERIC,
    COALESCE(SUM(pco.amount) FILTER (WHERE pco.direction = 'out' AND pco.amount_kind = 'cage_confirmed'), 0)::NUMERIC,
    COUNT(*) FILTER (WHERE pco.direction = 'out'),
    MAX(pco.observed_at) FILTER (WHERE pco.direction = 'out')
  FROM pit_cash_observation pco
  JOIN rating_slip rs ON pco.rating_slip_id = rs.id
  JOIN gaming_table gt ON rs.table_id = gt.id
  WHERE pco.casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND pco.observed_at >= p_start_ts
    AND pco.observed_at < p_end_ts
    AND pco.rating_slip_id IS NOT NULL
    AND (p_table_id IS NULL OR rs.table_id = p_table_id)
  GROUP BY rs.table_id, gt.label, gt.pit
  ORDER BY SUM(pco.amount) FILTER (WHERE pco.direction = 'out' AND pco.amount_kind = 'estimate') DESC NULLS LAST;
END;
$$;

-- Revoke from PUBLIC, grant to authenticated
REVOKE ALL ON FUNCTION public.rpc_shift_cash_obs_table(TIMESTAMPTZ, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_cash_obs_table(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_cash_obs_table IS
  'PRD-SHIFT-DASHBOARDS v0.2 PATCH WS1: Table-level cash observation rollups for shift window. '
  'TELEMETRY-ONLY: Observational aggregates, NOT authoritative Drop/Win/Hold. '
  'SECURITY INVOKER with ADR-024 context injection. '
  'Only includes observations linked to rating_slip (has table context). '
  'Results ordered by estimate_total DESC.';

-- ============================================================================
-- RPC: rpc_shift_cash_obs_pit
-- ============================================================================
-- Pit-level rollups grouped by gaming_table.pit.
-- Only includes observations linked to a rating slip (has table context).
-- Results ordered by estimate_total DESC.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_shift_cash_obs_pit(
  p_start_ts TIMESTAMPTZ,
  p_end_ts TIMESTAMPTZ,
  p_pit TEXT DEFAULT NULL  -- Optional filter to single pit
)
RETURNS TABLE (
  pit TEXT,
  cash_out_observed_estimate_total NUMERIC,
  cash_out_observed_confirmed_total NUMERIC,
  cash_out_observation_count BIGINT,
  cash_out_last_observed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- ADR-024: Establish RLS context from authenticated staff
  PERFORM set_rls_context_from_staff();

  RETURN QUERY
  SELECT
    gt.pit,
    COALESCE(SUM(pco.amount) FILTER (WHERE pco.direction = 'out' AND pco.amount_kind = 'estimate'), 0)::NUMERIC,
    COALESCE(SUM(pco.amount) FILTER (WHERE pco.direction = 'out' AND pco.amount_kind = 'cage_confirmed'), 0)::NUMERIC,
    COUNT(*) FILTER (WHERE pco.direction = 'out'),
    MAX(pco.observed_at) FILTER (WHERE pco.direction = 'out')
  FROM pit_cash_observation pco
  JOIN rating_slip rs ON pco.rating_slip_id = rs.id
  JOIN gaming_table gt ON rs.table_id = gt.id
  WHERE pco.casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND pco.observed_at >= p_start_ts
    AND pco.observed_at < p_end_ts
    AND pco.rating_slip_id IS NOT NULL
    AND (p_pit IS NULL OR gt.pit = p_pit)
  GROUP BY gt.pit
  ORDER BY SUM(pco.amount) FILTER (WHERE pco.direction = 'out' AND pco.amount_kind = 'estimate') DESC NULLS LAST;
END;
$$;

-- Revoke from PUBLIC, grant to authenticated
REVOKE ALL ON FUNCTION public.rpc_shift_cash_obs_pit(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_cash_obs_pit(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_cash_obs_pit IS
  'PRD-SHIFT-DASHBOARDS v0.2 PATCH WS1: Pit-level cash observation rollups for shift window. '
  'TELEMETRY-ONLY: Observational aggregates, NOT authoritative Drop/Win/Hold. '
  'SECURITY INVOKER with ADR-024 context injection. '
  'Only includes observations linked to rating_slip (has table context). '
  'Results ordered by estimate_total DESC.';

-- ============================================================================
-- RPC: rpc_shift_cash_obs_casino
-- ============================================================================
-- Casino-level rollups (all observations, including those without rating_slip_id).
-- Returns single row of aggregated totals for the shift window.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_shift_cash_obs_casino(
  p_start_ts TIMESTAMPTZ,
  p_end_ts TIMESTAMPTZ
)
RETURNS TABLE (
  cash_out_observed_estimate_total NUMERIC,
  cash_out_observed_confirmed_total NUMERIC,
  cash_out_observation_count BIGINT,
  cash_out_last_observed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- ADR-024: Establish RLS context from authenticated staff
  PERFORM set_rls_context_from_staff();

  RETURN QUERY
  SELECT
    COALESCE(SUM(pco.amount) FILTER (WHERE pco.direction = 'out' AND pco.amount_kind = 'estimate'), 0)::NUMERIC,
    COALESCE(SUM(pco.amount) FILTER (WHERE pco.direction = 'out' AND pco.amount_kind = 'cage_confirmed'), 0)::NUMERIC,
    COUNT(*) FILTER (WHERE pco.direction = 'out'),
    MAX(pco.observed_at) FILTER (WHERE pco.direction = 'out')
  FROM pit_cash_observation pco
  WHERE pco.casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND pco.observed_at >= p_start_ts
    AND pco.observed_at < p_end_ts;
END;
$$;

-- Revoke from PUBLIC, grant to authenticated
REVOKE ALL ON FUNCTION public.rpc_shift_cash_obs_casino(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_cash_obs_casino(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_cash_obs_casino IS
  'PRD-SHIFT-DASHBOARDS v0.2 PATCH WS1: Casino-level cash observation rollups for shift window. '
  'TELEMETRY-ONLY: Observational aggregates, NOT authoritative Drop/Win/Hold. '
  'SECURITY INVOKER with ADR-024 context injection. '
  'Includes ALL observations (even those without rating_slip link). '
  'Returns single aggregated row for entire shift.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================
-- VERIFICATION NOTES
-- =====================================================
--
-- RPCs Created:
-- - rpc_shift_cash_obs_table(p_start_ts, p_end_ts, p_table_id)
-- - rpc_shift_cash_obs_pit(p_start_ts, p_end_ts, p_pit)
-- - rpc_shift_cash_obs_casino(p_start_ts, p_end_ts)
--
-- Security:
-- - All RPCs are SECURITY INVOKER (caller's RLS context)
-- - All RPCs call set_rls_context_from_staff() as first statement
-- - Casino scope derived from context (no p_casino_id input)
--
-- Business Rules:
-- - Table/pit rollups exclude observations where rating_slip_id IS NULL
-- - Casino rollups include ALL observations
-- - All rollups filter direction='out' per telemetry spec
-- - Results ordered by estimate_total DESC
--
-- Run after migration:
--   npm run db:types
--
-- Verify with:
--   \df rpc_shift_cash_obs_*
--

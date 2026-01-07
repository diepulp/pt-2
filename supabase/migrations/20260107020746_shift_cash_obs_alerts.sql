-- =====================================================
-- Migration: PRD-SHIFT-DASHBOARDS v0.2 PATCH - WS2 Spike Alerts
-- Created: 2026-01-07 02:07:46
-- PRD Reference: docs/10-prd/PRD-Shift-Dashboards-Shift-Reports-v0.2_PATCH_cash-observations.md
-- EXEC-SPEC: docs/20-architecture/specs/PRD-SHIFT-DASHBOARDS-v0.2-PATCH/EXECUTION-SPEC.md
-- Workstream: WS2 - Spike Alerts
-- Dependencies: WS1 (rpc_shift_cash_obs_table, rpc_shift_cash_obs_pit must exist)
-- =====================================================
-- This migration creates:
--   rpc_shift_cash_obs_alerts() - Threshold-based cash-out spike alerts
--
-- TELEMETRY-ONLY: Alerts are based on observational data, NOT authoritative metrics
--
-- Security Requirements (ADR-024):
--   - SECURITY INVOKER (caller's RLS context)
--   - Calls set_rls_context_from_staff() as first statement
--   - Derives casino scope from context (no p_casino_id input)
--
-- Threshold Storage:
--   casino_settings.alert_thresholds JSONB column (READ-ONLY, CasinoService-owned)
--   Expected structure: { cash_out_spike_table_threshold: 5000, cash_out_spike_pit_threshold: 25000 }
--
-- Severity Values:
--   'info', 'warn', 'critical' (lowercase) per Shift Dashboards alert spec
-- =====================================================

BEGIN;

-- ============================================================================
-- RPC: rpc_shift_cash_obs_alerts
-- ============================================================================
-- Returns alerts when table or pit cash-out totals exceed configured thresholds.
-- Uses sensible defaults when thresholds are not configured.
-- All alerts are flagged as telemetry (is_telemetry = TRUE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_shift_cash_obs_alerts(
  p_start_ts TIMESTAMPTZ,
  p_end_ts TIMESTAMPTZ
)
RETURNS TABLE (
  alert_type TEXT,
  severity TEXT,
  entity_type TEXT,
  entity_id TEXT,
  entity_label TEXT,
  observed_value NUMERIC,
  threshold NUMERIC,
  message TEXT,
  is_telemetry BOOLEAN  -- Always TRUE for cash observations
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_thresholds JSONB;
  v_table_threshold NUMERIC;
  v_pit_threshold NUMERIC;
BEGIN
  -- ADR-024: Establish RLS context from authenticated staff
  PERFORM set_rls_context_from_staff();

  -- Derive casino_id from context
  v_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  -- Get thresholds from casino_settings (with sensible defaults)
  SELECT COALESCE(cs.alert_thresholds, '{}'::jsonb) INTO v_thresholds
  FROM casino_settings cs
  WHERE cs.casino_id = v_casino_id;

  -- Apply defaults if thresholds not configured
  v_table_threshold := COALESCE((v_thresholds->>'cash_out_spike_table_threshold')::numeric, 5000);
  v_pit_threshold := COALESCE((v_thresholds->>'cash_out_spike_pit_threshold')::numeric, 25000);

  -- Table-level spike alerts
  RETURN QUERY
  SELECT
    'cash_out_observed_spike_telemetry'::TEXT AS alert_type,
    'warn'::TEXT AS severity,
    'table'::TEXT AS entity_type,
    r.table_id::TEXT AS entity_id,
    r.table_label AS entity_label,
    r.cash_out_observed_estimate_total AS observed_value,
    v_table_threshold AS threshold,
    format('TELEMETRY: Table %s observed cash-out $%s exceeds threshold $%s',
           r.table_label,
           to_char(r.cash_out_observed_estimate_total, 'FM999,999,999.00'),
           to_char(v_table_threshold, 'FM999,999,999.00'))::TEXT AS message,
    TRUE AS is_telemetry
  FROM rpc_shift_cash_obs_table(p_start_ts, p_end_ts, NULL) r
  WHERE r.cash_out_observed_estimate_total > v_table_threshold;

  -- Pit-level spike alerts
  RETURN QUERY
  SELECT
    'cash_out_observed_spike_telemetry'::TEXT AS alert_type,
    'warn'::TEXT AS severity,
    'pit'::TEXT AS entity_type,
    r.pit::TEXT AS entity_id,
    format('Pit %s', r.pit)::TEXT AS entity_label,
    r.cash_out_observed_estimate_total AS observed_value,
    v_pit_threshold AS threshold,
    format('TELEMETRY: Pit %s observed cash-out $%s exceeds threshold $%s',
           r.pit,
           to_char(r.cash_out_observed_estimate_total, 'FM999,999,999.00'),
           to_char(v_pit_threshold, 'FM999,999,999.00'))::TEXT AS message,
    TRUE AS is_telemetry
  FROM rpc_shift_cash_obs_pit(p_start_ts, p_end_ts, NULL) r
  WHERE r.cash_out_observed_estimate_total > v_pit_threshold;
END;
$$;

-- Revoke from PUBLIC, grant to authenticated
REVOKE ALL ON FUNCTION public.rpc_shift_cash_obs_alerts(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_cash_obs_alerts(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_cash_obs_alerts IS
  'PRD-SHIFT-DASHBOARDS v0.2 PATCH WS2: Cash observation spike alerts for shift window. '
  'TELEMETRY-ONLY: Alerts based on observational data, NOT authoritative metrics. '
  'SECURITY INVOKER with ADR-024 context injection. '
  'Uses casino_settings.alert_thresholds or defaults (table: $5000, pit: $25000). '
  'All alerts flagged with is_telemetry=TRUE and message prefixed with TELEMETRY.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================
-- VERIFICATION NOTES
-- =====================================================
--
-- RPC Created:
-- - rpc_shift_cash_obs_alerts(p_start_ts, p_end_ts)
--
-- Security:
-- - SECURITY INVOKER (caller's RLS context)
-- - Calls set_rls_context_from_staff() as first statement
-- - Casino scope derived from context (no p_casino_id input)
--
-- Business Rules:
-- - Returns alerts where observed totals exceed configured thresholds
-- - Default thresholds: table $5000, pit $25000
-- - Alert severity: 'warn' (can extend to 'critical' if thresholds added)
-- - All alerts include is_telemetry=TRUE
-- - All alert messages prefixed with "TELEMETRY:" to prevent confusion
--
-- Dependencies:
-- - rpc_shift_cash_obs_table() from WS1
-- - rpc_shift_cash_obs_pit() from WS1
-- - casino_settings.alert_thresholds column (READ-ONLY)
--
-- Run after migration:
--   npm run db:types
--
-- Verify with:
--   \df rpc_shift_cash_obs_alerts
--

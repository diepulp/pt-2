-- =============================================================================
-- MIGRATION: add_active_visitors_summary_rpc
-- PURPOSE: Floor Activity Donut - rated vs unrated visitor counts for Shift Dashboard V2
-- ADR: ADR-024 (tenant isolation via set_rls_context_from_staff)
-- @see IMPLEMENTATION_STRATEGY.md §5.2 Active Visitors Donut
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RPC: rpc_shift_active_visitors_summary
-- Returns aggregated counts of active visitors by visit_kind for donut chart.
-- ADR-024 compliant: NO p_casino_id parameter - uses set_rls_context_from_staff
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_shift_active_visitors_summary()
RETURNS TABLE (
  rated_count bigint,
  unrated_count bigint,
  total_count bigint,
  rated_percentage numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_casino_id uuid;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- Casino scope derived from staff table lookup, not caller input
  -- =======================================================================
  PERFORM set_rls_context_from_staff();
  v_casino_id := current_setting('app.casino_id', true)::uuid;
  -- =======================================================================

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
  FROM rating_slip rs
  INNER JOIN visit v ON v.id = rs.visit_id
  WHERE rs.status IN ('open', 'paused')
    AND rs.casino_id = v_casino_id;
END;
$$;

COMMENT ON FUNCTION rpc_shift_active_visitors_summary IS
  'Returns active visitor summary counts by visit_kind (rated vs unrated) for Shift Dashboard V2 Floor Activity Donut. ADR-024 compliant.';

-- Grant execute to authenticated users (RLS enforces tenant isolation)
GRANT EXECUTE ON FUNCTION rpc_shift_active_visitors_summary TO authenticated;

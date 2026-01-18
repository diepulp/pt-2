-- =============================================================================
-- MIGRATION: fix_closed_slips_rpc_and_index
-- PURPOSE: Fix "Start From Previous" bugs - proper pagination, terminal slip filter
-- ISSUE: ISSUE-SFP-001
-- ADR: ADR-024 (tenant isolation via set_rls_context_from_staff)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- INDEX: Support join from visit → rating_slip for closed slips
-- Query path: visit(casino_id, gaming_day) → join → rating_slip(visit_id)
-- Existing ix_visit_casino_gaming_day filters visits; this supports the join
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_rating_slip_visit_closed_end_time
  ON rating_slip (visit_id, end_time DESC, id DESC)
  WHERE status = 'closed';

COMMENT ON INDEX ix_rating_slip_visit_closed_end_time IS
  'Supports join from visit to closed rating_slips with keyset pagination ordering';

-- -----------------------------------------------------------------------------
-- RPC: rpc_list_closed_slips_for_gaming_day
-- Returns closed terminal slips (no successor) for a gaming day
-- ADR-024 compliant: NO p_casino_id parameter - uses set_rls_context_from_staff
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_list_closed_slips_for_gaming_day(
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
AS $$
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- Casino scope derived from staff table lookup, not caller input
  -- =======================================================================
  PERFORM set_rls_context_from_staff();
  -- =======================================================================

  RETURN QUERY
  SELECT
    rs.id,
    rs.visit_id,
    rs.table_id,
    gt.name AS table_name,
    rs.seat_number,
    rs.start_time,
    rs.end_time,
    rs.final_duration_seconds,
    rs.average_bet,
    p.id AS player_id,
    p.first_name AS player_first_name,
    p.last_name AS player_last_name,
    pl.tier AS player_tier
  FROM rating_slip rs
  INNER JOIN visit v ON v.id = rs.visit_id
  INNER JOIN gaming_table gt ON gt.id = rs.table_id
  LEFT JOIN player p ON p.id = v.player_id
  LEFT JOIN player_loyalty pl ON pl.player_id = v.player_id
                              AND pl.casino_id = v.casino_id
  WHERE rs.status = 'closed'
    AND v.gaming_day = p_gaming_day
    -- =========================================================================
    -- CRITICAL: Only return TERMINAL slips (no successor pointing to them)
    -- Excludes intermediate slips closed due to seat/table moves
    -- =========================================================================
    AND NOT EXISTS (
      SELECT 1 FROM rating_slip successor
      WHERE successor.previous_slip_id = rs.id
    )
    -- Keyset pagination: fetch rows BEFORE the cursor (descending order)
    AND (
      p_cursor_end_time IS NULL
      OR (rs.end_time, rs.id) < (p_cursor_end_time, p_cursor_id)
    )
  ORDER BY rs.end_time DESC, rs.id DESC
  LIMIT p_limit + 1;
END;
$$;

COMMENT ON FUNCTION rpc_list_closed_slips_for_gaming_day IS
  'Lists closed terminal rating slips for a gaming day with keyset pagination. ADR-024 compliant - no casino_id param.';

-- Grant execute to authenticated users (RLS enforces tenant isolation)
GRANT EXECUTE ON FUNCTION rpc_list_closed_slips_for_gaming_day TO authenticated;

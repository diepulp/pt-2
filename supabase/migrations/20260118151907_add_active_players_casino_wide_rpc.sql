-- =============================================================================
-- MIGRATION: add_active_players_casino_wide_rpc
-- PURPOSE: Enable casino-wide active player lookup for Activity Panel enhancement
-- ADR: ADR-024 (tenant isolation via set_rls_context_from_staff)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- INDEX: Support casino-wide active slip queries with player/table joins
-- Optimizes: SELECT from rating_slip WHERE status IN ('open', 'paused')
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_rating_slip_active_status
  ON rating_slip (casino_id, status, start_time DESC)
  WHERE status IN ('open', 'paused');

COMMENT ON INDEX ix_rating_slip_active_status IS
  'Supports casino-wide active slip queries for Activity Panel with player lookup';

-- -----------------------------------------------------------------------------
-- RPC: rpc_list_active_players_casino_wide
-- Returns all active (open/paused) slips across all tables with player info
-- ADR-024 compliant: NO p_casino_id parameter - uses set_rls_context_from_staff
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_list_active_players_casino_wide(
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
AS $$
DECLARE
  v_casino_id uuid;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- Casino scope derived from staff table lookup, not caller input
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Get casino_id from RLS context for filtering
  v_casino_id := current_setting('app.casino_id', true)::uuid;
  -- =======================================================================

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
  FROM rating_slip rs
  INNER JOIN visit v ON v.id = rs.visit_id
  INNER JOIN gaming_table gt ON gt.id = rs.table_id
  LEFT JOIN player p ON p.id = v.player_id
  LEFT JOIN player_loyalty pl ON pl.player_id = v.player_id
                              AND pl.casino_id = v.casino_id
  WHERE rs.status IN ('open', 'paused')
    AND rs.casino_id = v_casino_id
    -- Optional search filter (searches player name)
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

COMMENT ON FUNCTION rpc_list_active_players_casino_wide IS
  'Lists all active (open/paused) rating slips across all tables with player details. ADR-024 compliant - no casino_id param.';

-- Grant execute to authenticated users (RLS enforces tenant isolation)
GRANT EXECUTE ON FUNCTION rpc_list_active_players_casino_wide TO authenticated;

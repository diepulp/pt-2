-- =============================================================
-- PRD-017: Visit Last Segment RPC
-- Published contract for RatingSlipService
-- =============================================================

-- Drop existing function if exists (for idempotency)
DROP FUNCTION IF EXISTS rpc_get_visit_last_segment(uuid);

-- Create the last segment RPC
-- SECURITY INVOKER: RLS enforced via caller's context
CREATE OR REPLACE FUNCTION rpc_get_visit_last_segment(
  p_visit_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_segment RECORD;
  v_visit_exists boolean;
  v_context_staff_role text;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling compatibility
  -- =======================================================================
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')
  );

  PERFORM set_rls_context(
    COALESCE(
      NULLIF(current_setting('app.actor_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
    ),
    COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    ),
    v_context_staff_role
  );
  -- =======================================================================

  -- 1. Check if visit exists (RLS enforced)
  SELECT EXISTS(
    SELECT 1 FROM visit WHERE id = p_visit_id
  ) INTO v_visit_exists;

  IF NOT v_visit_exists THEN
    RETURN NULL;
  END IF;

  -- 2. Get the last rating slip (segment) for this visit
  -- Order by start_time DESC to get most recent, with id as tiebreaker
  SELECT
    rs.table_id,
    gt.label AS table_name,
    rs.seat_number::int AS seat_number,
    rs.game_settings,
    COALESCE(rs.final_average_bet, rs.average_bet) AS average_bet
  INTO v_segment
  FROM rating_slip rs
  LEFT JOIN gaming_table gt ON gt.id = rs.table_id
  WHERE rs.visit_id = p_visit_id
  ORDER BY rs.start_time DESC, rs.id DESC
  LIMIT 1;

  -- 3. Return null if no segments found
  IF v_segment IS NULL THEN
    RETURN NULL;
  END IF;

  -- 4. Build response
  RETURN jsonb_build_object(
    'table_id', v_segment.table_id,
    'table_name', v_segment.table_name,
    'seat_number', v_segment.seat_number,
    'game_settings', v_segment.game_settings,
    'average_bet', v_segment.average_bet
  );
END;
$$;

-- Add function comment for documentation
COMMENT ON FUNCTION rpc_get_visit_last_segment(uuid) IS
  'PRD-017: Published contract for RatingSlipService. Returns last segment (rating slip) context for a visit. Returns {table_id, table_name, seat_number, game_settings, average_bet} or null. SECURITY INVOKER - RLS enforced.';

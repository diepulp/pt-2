-- =============================================================
-- Fix PRD-017 RPCs still calling dropped set_rls_context()
-- =============================================================
-- SEC-007 dropped set_rls_context(uuid,uuid,text,text) entirely.
-- Three SECURITY INVOKER RPCs from PRD-017 were never remediated
-- and still call the old function, causing:
--   "permission denied for function set_rls_context"
--
-- Fix: Replace the old self-injection block with
--   PERFORM set_rls_context_from_staff()
-- which derives context authoritatively from JWT staff_id claim.
--
-- Affected RPCs:
--   1. rpc_check_table_seat_availability(uuid, int)
--   2. rpc_get_visit_loyalty_summary(uuid)
--   3. rpc_get_visit_last_segment(uuid)
-- =============================================================

-- -------------------------------------------------------------
-- 1. rpc_check_table_seat_availability
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_check_table_seat_availability(
  p_table_id uuid,
  p_seat_number int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_table_record RECORD;
  v_seat_occupied boolean;
BEGIN
  -- ADR-024: Authoritative context derivation (replaces dropped set_rls_context)
  PERFORM set_rls_context_from_staff();

  -- 1. Check if table exists and get its status (RLS enforced)
  SELECT id, label, status, casino_id
  INTO v_table_record
  FROM gaming_table
  WHERE id = p_table_id;

  -- Table not found (or not accessible due to RLS)
  IF v_table_record IS NULL THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'table_not_found'
    );
  END IF;

  -- 2. Check table status
  IF v_table_record.status = 'inactive' THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'table_inactive',
      'table_name', v_table_record.label
    );
  END IF;

  IF v_table_record.status = 'closed' THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'table_closed',
      'table_name', v_table_record.label
    );
  END IF;

  -- 3. Check seat occupancy (open or paused rating slip at this table/seat)
  SELECT EXISTS(
    SELECT 1
    FROM rating_slip rs
    WHERE rs.table_id = p_table_id
      AND rs.seat_number = p_seat_number::text
      AND rs.status IN ('open', 'paused')
  ) INTO v_seat_occupied;

  IF v_seat_occupied THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'seat_occupied',
      'table_name', v_table_record.label
    );
  END IF;

  -- 4. Table is active and seat is available
  RETURN jsonb_build_object(
    'available', true,
    'table_name', v_table_record.label
  );
END;
$$;

COMMENT ON FUNCTION rpc_check_table_seat_availability(uuid, int) IS
  'PRD-017: Checks table/seat availability. ADR-024: Uses set_rls_context_from_staff(). SECURITY INVOKER.';

-- -------------------------------------------------------------
-- 2. rpc_get_visit_loyalty_summary
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_visit_loyalty_summary(
  p_visit_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_points_earned numeric;
  v_visit_exists boolean;
BEGIN
  -- ADR-024: Authoritative context derivation (replaces dropped set_rls_context)
  PERFORM set_rls_context_from_staff();

  -- 1. Check if visit exists (RLS enforced)
  SELECT EXISTS(
    SELECT 1 FROM visit WHERE id = p_visit_id
  ) INTO v_visit_exists;

  IF NOT v_visit_exists THEN
    RETURN NULL;
  END IF;

  -- 2. Sum points from loyalty_ledger for this visit
  SELECT COALESCE(SUM(
    CASE WHEN points_delta > 0 THEN points_delta ELSE 0 END
  ), 0)
  INTO v_points_earned
  FROM loyalty_ledger
  WHERE visit_id = p_visit_id;

  -- 3. Return summary
  RETURN jsonb_build_object(
    'points_earned', v_points_earned
  );
END;
$$;

COMMENT ON FUNCTION rpc_get_visit_loyalty_summary(uuid) IS
  'PRD-017: Visit loyalty summary. ADR-024: Uses set_rls_context_from_staff(). SECURITY INVOKER.';

-- -------------------------------------------------------------
-- 3. rpc_get_visit_last_segment
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_visit_last_segment(
  p_visit_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_segment RECORD;
  v_visit_exists boolean;
BEGIN
  -- ADR-024: Authoritative context derivation (replaces dropped set_rls_context)
  PERFORM set_rls_context_from_staff();

  -- 1. Check if visit exists (RLS enforced)
  SELECT EXISTS(
    SELECT 1 FROM visit WHERE id = p_visit_id
  ) INTO v_visit_exists;

  IF NOT v_visit_exists THEN
    RETURN NULL;
  END IF;

  -- 2. Get the last rating slip (segment) for this visit
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

COMMENT ON FUNCTION rpc_get_visit_last_segment(uuid) IS
  'PRD-017: Visit last segment context. ADR-024: Uses set_rls_context_from_staff(). SECURITY INVOKER.';

-- Schema reload for PostgREST
NOTIFY pgrst, 'reload schema';

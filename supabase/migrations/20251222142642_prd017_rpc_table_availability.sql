-- =============================================================
-- PRD-017: Table/Seat Availability Check RPC
-- Published contract for TableContextService
-- =============================================================

-- Drop existing function if exists (for idempotency)
DROP FUNCTION IF EXISTS rpc_check_table_seat_availability(uuid, int);

-- Create the availability check RPC
-- SECURITY INVOKER: RLS enforced via caller's context
CREATE OR REPLACE FUNCTION rpc_check_table_seat_availability(
  p_table_id uuid,
  p_seat_number int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_table_record RECORD;
  v_seat_occupied boolean;
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
      AND rs.seat_number = p_seat_number::text  -- seat_number is text in schema
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

-- Add function comment for documentation
COMMENT ON FUNCTION rpc_check_table_seat_availability(uuid, int) IS
  'PRD-017: Published contract for TableContextService. Checks if a table/seat is available for a new visit. Returns {available: boolean, reason?: string, table_name?: string}. SECURITY INVOKER - RLS enforced.';

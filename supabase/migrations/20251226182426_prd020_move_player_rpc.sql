-- ============================================================================
-- Migration: PRD-020 Move Player RPC
-- ============================================================================
-- Purpose: Consolidated move player operation in a single transaction
-- Performance: Reduces 4 DB round-trips to 1, latency from ~700ms to ~150ms
-- Security: SECURITY DEFINER with self-injected RLS context (ADR-015)
-- Spec: docs/10-prd/PRD-020-move-player-modal-defects.md
-- ============================================================================

-- ============================================================================
-- 1. Add compound index for active slips by table
-- ============================================================================
-- Optimizes getActiveForTable() queries and move destination validation
-- Used by: rpc_move_player seat availability check, dashboard queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_rating_slip_table_status_active
  ON rating_slip (table_id, status)
  WHERE status IN ('open', 'paused');

COMMENT ON INDEX idx_rating_slip_table_status_active IS
  'PRD-020: Optimizes getActiveForTable() and move destination validation';

-- ============================================================================
-- 2. RPC: rpc_move_player
-- ============================================================================
-- Consolidates the move player workflow into a single transaction:
--   1. Lock and validate current slip (SELECT FOR UPDATE)
--   2. Validate destination seat availability
--   3. Close current slip with duration calculation
--   4. Create new slip at destination with continuity metadata
--   5. Get updated seat occupancy for both tables
--   6. Audit log the move operation
--
-- Returns JSONB with:
--   - closedSlipId: UUID of the closed slip
--   - newSlipId: UUID of the new slip at destination
--   - moveGroupId: UUID linking all slips in the move chain
--   - accumulatedSeconds: Total seconds played across all moves
--   - sourceTableId: UUID of the source table
--   - sourceTableSeats: Array of occupied seat numbers at source
--   - destinationTableSeats: Array of occupied seat numbers at destination
--   - newSlip: Summary of the new slip (id, tableId, seatNumber, status, startTime)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_move_player(
  p_casino_id UUID,
  p_actor_id UUID,
  p_slip_id UUID,
  p_new_table_id UUID,
  p_new_seat_number TEXT DEFAULT NULL,
  p_average_bet NUMERIC DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_staff_role text;
  v_current_slip rating_slip;
  v_closed_slip rating_slip;
  v_new_slip rating_slip;
  v_source_table_id UUID;
  v_duration INTEGER;
  v_move_group_id UUID;
  v_accumulated_seconds INTEGER;
  v_source_seats TEXT[];
  v_dest_seats TEXT[];
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- ADR-015 Phase 1A: RLS Context Self-Injection
  -- Required for Supabase transaction pooling (port 6543) where SET LOCAL
  -- context is lost between transactions.
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text,
    'pit_boss'  -- Default role for move operations
  );

  PERFORM set_rls_context(
    p_actor_id,
    p_casino_id,
    v_context_staff_role
  );

  -- ═══════════════════════════════════════════════════════════════════════
  -- 1. LOCK AND VALIDATE CURRENT SLIP
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO v_current_slip
  FROM rating_slip
  WHERE id = p_slip_id AND casino_id = p_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_slip.status = 'closed' THEN
    RAISE EXCEPTION 'RATING_SLIP_ALREADY_CLOSED' USING ERRCODE = 'P0003';
  END IF;

  v_source_table_id := v_current_slip.table_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 2. VALIDATE DESTINATION SEAT AVAILABILITY
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_new_seat_number IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM rating_slip
      WHERE table_id = p_new_table_id
        AND seat_number = p_new_seat_number
        AND status IN ('open', 'paused')
        AND casino_id = p_casino_id
    ) THEN
      RAISE EXCEPTION 'SEAT_OCCUPIED' USING ERRCODE = 'P0004';
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 3. CLOSE CURRENT SLIP WITH DURATION CALCULATION
  -- ═══════════════════════════════════════════════════════════════════════
  v_duration := EXTRACT(EPOCH FROM (now() - v_current_slip.start_time))::INTEGER;

  UPDATE rating_slip SET
    status = 'closed',
    end_time = now(),
    duration_seconds = v_duration,
    final_duration_seconds = v_duration,
    average_bet = COALESCE(p_average_bet, v_current_slip.average_bet),
    final_average_bet = COALESCE(p_average_bet, v_current_slip.average_bet)
  WHERE id = p_slip_id
  RETURNING * INTO v_closed_slip;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 4. CREATE NEW SLIP AT DESTINATION WITH CONTINUITY METADATA
  -- ═══════════════════════════════════════════════════════════════════════
  v_move_group_id := COALESCE(v_current_slip.move_group_id, v_current_slip.id);
  v_accumulated_seconds := COALESCE(v_current_slip.accumulated_seconds, 0) + v_duration;

  INSERT INTO rating_slip (
    casino_id, visit_id, table_id, seat_number, status, start_time,
    previous_slip_id, move_group_id, accumulated_seconds, average_bet
  ) VALUES (
    p_casino_id,
    v_current_slip.visit_id,
    p_new_table_id,
    p_new_seat_number,
    'open',
    now(),
    p_slip_id,
    v_move_group_id,
    v_accumulated_seconds,
    p_average_bet
  )
  RETURNING * INTO v_new_slip;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 5. GET UPDATED SEAT OCCUPANCY FOR BOTH TABLES
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT ARRAY_AGG(seat_number ORDER BY seat_number) INTO v_source_seats
  FROM rating_slip
  WHERE table_id = v_source_table_id
    AND status IN ('open', 'paused')
    AND casino_id = p_casino_id
    AND seat_number IS NOT NULL;

  SELECT ARRAY_AGG(seat_number ORDER BY seat_number) INTO v_dest_seats
  FROM rating_slip
  WHERE table_id = p_new_table_id
    AND status IN ('open', 'paused')
    AND casino_id = p_casino_id
    AND seat_number IS NOT NULL;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 6. AUDIT LOG
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (p_casino_id, 'rating_slip', p_actor_id, 'move', jsonb_build_object(
    'from_slip_id', p_slip_id,
    'to_slip_id', v_new_slip.id,
    'from_table_id', v_source_table_id,
    'to_table_id', p_new_table_id,
    'from_seat_number', v_current_slip.seat_number,
    'to_seat_number', p_new_seat_number,
    'accumulated_seconds', v_accumulated_seconds
  ));

  -- ═══════════════════════════════════════════════════════════════════════
  -- 7. RETURN ENHANCED RESPONSE
  -- ═══════════════════════════════════════════════════════════════════════
  RETURN jsonb_build_object(
    'closedSlipId', v_closed_slip.id,
    'newSlipId', v_new_slip.id,
    'moveGroupId', v_move_group_id,
    'accumulatedSeconds', v_accumulated_seconds,
    'sourceTableId', v_source_table_id,
    'sourceTableSeats', COALESCE(v_source_seats, ARRAY[]::TEXT[]),
    'destinationTableSeats', COALESCE(v_dest_seats, ARRAY[]::TEXT[]),
    'newSlip', jsonb_build_object(
      'id', v_new_slip.id,
      'tableId', v_new_slip.table_id,
      'seatNumber', v_new_slip.seat_number,
      'status', v_new_slip.status,
      'startTime', v_new_slip.start_time
    )
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION rpc_move_player TO authenticated;

COMMENT ON FUNCTION rpc_move_player IS
  'PRD-020: Consolidated move player operation. Reduces 4 DB round-trips to 1.';

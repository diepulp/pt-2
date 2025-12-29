-- =====================================================
-- Migration: Fix rpc_move_player policy_snapshot population
-- Created: 2025-12-27 18:02:28
-- Issue: ISSUE-752833A6 (post-remediation fix)
-- Purpose: Populate policy_snapshot and accrual_kind when creating new slip
--          during move operation per ADR-019 D2 immutability principle
-- Reference: ADR-019, ADR-014, ISSUE-752833A6
-- =====================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- rpc_move_player with policy_snapshot population
--
-- CHANGE SUMMARY:
-- 1. Lookup policy values from game_settings table for DESTINATION table
-- 2. Build policy_snapshot.loyalty with all accrual-affecting fields
-- 3. Inherit accrual_kind from source slip (preserve ghost gaming status)
-- 4. Build game_settings JSONB for destination table
-- 5. Add _source tracking for audit trail
-- ═══════════════════════════════════════════════════════════════════════════

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
  -- NEW: Policy snapshot variables (ISSUE-752833A6)
  v_policy_snapshot JSONB;
  v_game_settings_jsonb JSONB;
  v_dest_table_type text;
  v_house_edge NUMERIC;
  v_decisions_per_hour INTEGER;
  v_points_conversion_rate NUMERIC;
  v_point_multiplier NUMERIC;
  v_min_bet NUMERIC;
  v_max_bet NUMERIC;
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
  -- 4. BUILD POLICY_SNAPSHOT FOR DESTINATION TABLE (ISSUE-752833A6 Fix)
  -- ═══════════════════════════════════════════════════════════════════════
  -- TABLE-AUTHORITATIVE: game_settings table is canonical source
  -- Lookup from game_settings via destination gaming_table.type
  -- Priority: 1) game_settings table, 2) hardcoded defaults
  -- ═══════════════════════════════════════════════════════════════════════

  -- Get destination table type and game_settings
  SELECT gt.type, gs.house_edge, gs.decisions_per_hour, gs.points_conversion_rate,
         gs.point_multiplier, gs.min_bet, gs.max_bet
  INTO v_dest_table_type, v_house_edge, v_decisions_per_hour, v_points_conversion_rate,
       v_point_multiplier, v_min_bet, v_max_bet
  FROM gaming_table gt
  LEFT JOIN game_settings gs
    ON gs.game_type = gt.type
    AND gs.casino_id = gt.casino_id
  WHERE gt.id = p_new_table_id
    AND gt.casino_id = p_casino_id;

  -- Build game_settings JSONB for the new table
  v_game_settings_jsonb := jsonb_build_object(
    'game_type', v_dest_table_type,
    'min_bet', COALESCE(v_min_bet, 25),
    'max_bet', COALESCE(v_max_bet, 5000),
    'house_edge', COALESCE(v_house_edge, 0.015)
  );

  -- Build policy_snapshot from canonical sources (ADR-019 D2)
  v_policy_snapshot := jsonb_build_object(
    'loyalty', jsonb_build_object(
      'house_edge', COALESCE(v_house_edge, 1.5),
      'decisions_per_hour', COALESCE(v_decisions_per_hour, 70),
      'points_conversion_rate', COALESCE(v_points_conversion_rate, 10.0),
      'point_multiplier', COALESCE(v_point_multiplier, 1.0),
      'policy_version', 'loyalty_points_v1'
    ),
    '_source', jsonb_build_object(
      'house_edge', CASE WHEN v_house_edge IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'decisions_per_hour', CASE WHEN v_decisions_per_hour IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'points_conversion_rate', CASE WHEN v_points_conversion_rate IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'point_multiplier', CASE WHEN v_point_multiplier IS NOT NULL THEN 'game_settings' ELSE 'default' END
    ),
    '_move_context', jsonb_build_object(
      'from_slip_id', p_slip_id,
      'inherited_accrual_kind', v_current_slip.accrual_kind
    )
  );

  -- ═══════════════════════════════════════════════════════════════════════
  -- 5. CREATE NEW SLIP AT DESTINATION WITH CONTINUITY + POLICY SNAPSHOT
  -- ═══════════════════════════════════════════════════════════════════════
  v_move_group_id := COALESCE(v_current_slip.move_group_id, v_current_slip.id);
  v_accumulated_seconds := COALESCE(v_current_slip.accumulated_seconds, 0) + v_duration;

  INSERT INTO rating_slip (
    casino_id, visit_id, table_id, seat_number, status, start_time,
    previous_slip_id, move_group_id, accumulated_seconds, average_bet,
    -- ISSUE-752833A6: Required columns for CHECK constraint compliance
    game_settings, policy_snapshot, accrual_kind
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
    p_average_bet,
    -- ISSUE-752833A6: Populate required columns
    v_game_settings_jsonb,
    v_policy_snapshot,
    COALESCE(v_current_slip.accrual_kind, 'loyalty')  -- Inherit from source slip
  )
  RETURNING * INTO v_new_slip;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 6. GET UPDATED SEAT OCCUPANCY FOR BOTH TABLES
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
  -- 7. AUDIT LOG
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (p_casino_id, 'rating_slip', p_actor_id, 'move', jsonb_build_object(
    'from_slip_id', p_slip_id,
    'to_slip_id', v_new_slip.id,
    'from_table_id', v_source_table_id,
    'to_table_id', p_new_table_id,
    'from_seat_number', v_current_slip.seat_number,
    'to_seat_number', p_new_seat_number,
    'accumulated_seconds', v_accumulated_seconds,
    'policy_snapshot_populated', true,
    'accrual_kind', v_new_slip.accrual_kind
  ));

  -- ═══════════════════════════════════════════════════════════════════════
  -- 8. RETURN ENHANCED RESPONSE
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
      'startTime', v_new_slip.start_time,
      'accrualKind', v_new_slip.accrual_kind
    )
  );
END;
$$;

COMMENT ON FUNCTION rpc_move_player IS
  'PRD-020: Consolidated move player operation. Reduces 4 DB round-trips to 1. ISSUE-752833A6: Populates policy_snapshot.loyalty from game_settings for ADR-019 D2 compliance. Inherits accrual_kind from source slip (ADR-014).';

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFY POSTGREST TO RELOAD SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (Run manually after migration)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Test move player creates slip with policy_snapshot:
-- 1. Start a slip, note the slip_id
-- 2. Call rpc_move_player with that slip_id
-- 3. Check new slip has policy_snapshot:
--    SELECT id, policy_snapshot->'loyalty' IS NOT NULL AS has_loyalty,
--           accrual_kind, policy_snapshot->'_move_context' AS move_context
--    FROM rating_slip
--    WHERE previous_slip_id IS NOT NULL
--    ORDER BY created_at DESC LIMIT 5;
--

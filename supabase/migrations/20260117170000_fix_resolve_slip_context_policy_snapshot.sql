-- ============================================================================
-- Migration: Fix policy_snapshot population in rpc_resolve_current_slip_context
-- Created: 2026-01-17
-- Issue: chk_policy_snapshot_if_loyalty constraint violation during rollover
-- Purpose: Populate policy_snapshot when creating new slip during gaming day rollover
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_resolve_current_slip_context(
  p_slip_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_current_gaming_day date;
  v_slip record;
  v_player_id uuid;
  v_rolled_over boolean := false;
  v_read_only boolean := false;
  v_new_visit record;
  v_current_slip record;
  v_policy_snapshot jsonb;
  v_game_settings_lookup record;
  v_visit_kind text;
  v_accrual_kind text;
BEGIN
  -- ADR-024: Derive context from set_rls_context_from_staff()
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set';
  END IF;

  -- 1. Load slip and visit
  SELECT
    rs.id as slip_id,
    rs.visit_id,
    rs.table_id,
    rs.seat_number,
    rs.average_bet,
    rs.status,
    v.player_id,
    v.gaming_day as visit_gaming_day
  INTO v_slip
  FROM rating_slip rs
  JOIN visit v ON v.id = rs.visit_id
  WHERE rs.id = p_slip_id
    AND rs.casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND: slip % not found', p_slip_id;
  END IF;

  v_player_id := v_slip.player_id;

  -- Ghost visits: return as read-only (no rollover, no buy-ins)
  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object(
      'slipIdCurrent', v_slip.slip_id,
      'visitIdCurrent', v_slip.visit_id,
      'gamingDay', v_slip.visit_gaming_day,
      'rolledOver', false,
      'readOnly', true
    );
  END IF;

  -- 2. Compute current gaming day
  v_current_gaming_day := compute_gaming_day(v_casino_id, now());

  -- 3. Check if current gaming day - no rollover needed
  IF v_slip.visit_gaming_day = v_current_gaming_day THEN
    RETURN jsonb_build_object(
      'slipIdCurrent', v_slip.slip_id,
      'visitIdCurrent', v_slip.visit_id,
      'gamingDay', v_current_gaming_day,
      'rolledOver', false,
      'readOnly', false
    );
  END IF;

  -- 4. Stale: call rollover RPC (reuses ADR-026 logic)
  SELECT * INTO v_new_visit
  FROM rpc_start_or_resume_visit(v_player_id);

  v_rolled_over := true;

  -- 5. Find existing active slip for the new visit
  SELECT * INTO v_current_slip
  FROM rating_slip
  WHERE visit_id = (v_new_visit.visit).id
    AND casino_id = v_casino_id
    AND status IN ('open', 'paused')
  ORDER BY start_time DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- =========================================================================
    -- 6. Create new slip with policy_snapshot (ISSUE FIX)
    -- Must populate policy_snapshot to satisfy chk_policy_snapshot_if_loyalty
    -- Carry forward table/seat from stale slip (staff is still at same table)
    -- =========================================================================

    -- Look up visit_kind to determine accrual_kind
    SELECT visit_kind INTO v_visit_kind
    FROM visit
    WHERE id = (v_new_visit.visit).id;

    -- Determine accrual_kind (mirrors rpc_start_rating_slip logic)
    IF v_visit_kind = 'gaming_ghost_unrated' THEN
      v_accrual_kind := 'compliance_only';
    ELSE
      v_accrual_kind := 'loyalty';
    END IF;

    -- Build policy_snapshot from game_settings (mirrors rpc_start_rating_slip)
    SELECT gs.house_edge, gs.decisions_per_hour, gs.points_conversion_rate, gs.point_multiplier
    INTO v_game_settings_lookup
    FROM gaming_table gt
    LEFT JOIN game_settings gs
      ON gs.game_type = gt.type
      AND gs.casino_id = gt.casino_id
    WHERE gt.id = v_slip.table_id
      AND gt.casino_id = v_casino_id;

    v_policy_snapshot := jsonb_build_object(
      'loyalty', jsonb_build_object(
        'house_edge', COALESCE(v_game_settings_lookup.house_edge, 1.5),
        'decisions_per_hour', COALESCE(v_game_settings_lookup.decisions_per_hour, 70),
        'points_conversion_rate', COALESCE(v_game_settings_lookup.points_conversion_rate, 10.0),
        'point_multiplier', COALESCE(v_game_settings_lookup.point_multiplier, 1.0),
        'policy_version', 'loyalty_points_v1'
      ),
      '_source', jsonb_build_object(
        'house_edge', CASE WHEN v_game_settings_lookup.house_edge IS NOT NULL THEN 'game_settings' ELSE 'default' END,
        'decisions_per_hour', CASE WHEN v_game_settings_lookup.decisions_per_hour IS NOT NULL THEN 'game_settings' ELSE 'default' END,
        'points_conversion_rate', CASE WHEN v_game_settings_lookup.points_conversion_rate IS NOT NULL THEN 'game_settings' ELSE 'default' END,
        'point_multiplier', CASE WHEN v_game_settings_lookup.point_multiplier IS NOT NULL THEN 'game_settings' ELSE 'default' END,
        'rollover_from_slip', p_slip_id::text
      )
    );

    BEGIN
      INSERT INTO rating_slip (
        casino_id, visit_id, table_id, seat_number,
        average_bet, status, start_time,
        policy_snapshot, accrual_kind
      ) VALUES (
        v_casino_id,
        (v_new_visit.visit).id,
        v_slip.table_id,
        v_slip.seat_number,
        v_slip.average_bet,
        'open',
        now(),
        v_policy_snapshot,
        v_accrual_kind
      )
      RETURNING * INTO v_current_slip;
    EXCEPTION WHEN unique_violation THEN
      -- Another concurrent request created the slip - fetch it
      SELECT * INTO v_current_slip
      FROM rating_slip
      WHERE visit_id = (v_new_visit.visit).id
        AND casino_id = v_casino_id
        AND status IN ('open', 'paused')
      ORDER BY start_time DESC
      LIMIT 1;
    END;
  END IF;

  RETURN jsonb_build_object(
    'slipIdCurrent', v_current_slip.id,
    'visitIdCurrent', (v_new_visit.visit).id,
    'gamingDay', v_current_gaming_day,
    'rolledOver', v_rolled_over,
    'readOnly', false
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_resolve_current_slip_context(uuid) IS
  'Entry gate RPC for rating slip modal. Resolves to current gaming day, rolling over visit/slip if stale. Populates policy_snapshot per ADR-019 D2 when creating new slips.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

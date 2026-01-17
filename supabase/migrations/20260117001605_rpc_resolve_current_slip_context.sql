-- ============================================================================
-- Migration: Entry Gate RPC for Rating Slip Modal
-- Created: 2026-01-17
-- GAP Reference: GAP-ADR-026-UI-SHIPPABLE Patch A (WS1)
-- Purpose: Ensure modal always operates on current gaming day context
-- ============================================================================

-- Concurrency safety: one active slip per visit
-- This prevents duplicate slips from being created under simultaneous modal opens
CREATE UNIQUE INDEX IF NOT EXISTS ux_rating_slip_one_active_per_visit
  ON public.rating_slip (casino_id, visit_id)
  WHERE status IN ('open', 'paused');

-- Entry gate RPC: resolves current slip context, rolling over if stale
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
    -- 6. Create new slip - use UPSERT pattern for concurrency safety
    -- Carry forward table/seat from stale slip (staff is still at same table)
    BEGIN
      INSERT INTO rating_slip (
        casino_id, visit_id, table_id, seat_number,
        average_bet, status, start_time
      ) VALUES (
        v_casino_id,
        (v_new_visit.visit).id,
        v_slip.table_id,
        v_slip.seat_number,
        v_slip.average_bet,
        'open',
        now()
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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.rpc_resolve_current_slip_context(uuid) TO authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

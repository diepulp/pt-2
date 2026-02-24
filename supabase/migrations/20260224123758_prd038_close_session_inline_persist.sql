-- ============================================================================
-- Migration: PRD-038 Close Session with Inline Rundown Persistence
-- Created: 2026-02-24
-- PRD Reference: docs/10-prd/PRD-038-shift-rundown-persistence-deltas-v0.1.md
-- ADR References: ADR-024 (context injection), ADR-038 D2 (UPSERT)
-- Purpose: Modify rpc_close_table_session to persist rundown report inline
--          within the same transaction. Uses UPSERT so pre-close manual persist
--          is updated with final values.
-- Backward Compatibility: Preserves existing signature.
-- Bounded Context: TableContextService
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_close_table_session(
  p_table_session_id uuid,
  p_drop_event_id uuid DEFAULT NULL,
  p_closing_inventory_snapshot_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS table_session
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result table_session;
  v_casino_id uuid;
  v_actor_id uuid;
  v_role text;
  v_current_status table_session_status;
  -- PRD-038: Inline rundown persistence variables
  v_opening_cents integer;
  v_closing_cents integer;
  v_opening_snapshot_id uuid;
  v_closing_snapshot_id uuid;
  v_table_win integer;
  v_gaming_day date;
  v_opening_source text;
  v_par_target integer;
  v_variance integer;
  v_gstart time;
BEGIN
  PERFORM set_rls_context_from_staff();

  v_casino_id := current_setting('app.casino_id')::uuid;
  v_actor_id := current_setting('app.actor_id')::uuid;

  -- Authorization (MVP): only pit_boss/admin may mutate sessions
  v_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  IF v_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = 'P0001',
            HINT = 'Only pit_boss or admin roles can close sessions';
  END IF;

  -- Get current status with lock
  SELECT status INTO v_current_status
  FROM table_session
  WHERE id = p_table_session_id
  AND casino_id = v_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found'
      USING ERRCODE = 'P0002',
            HINT = 'Session does not exist or belongs to different casino';
  END IF;

  -- Require RUNDOWN state (or ACTIVE if shortcut allowed)
  IF v_current_status NOT IN ('RUNDOWN', 'ACTIVE') THEN
    RAISE EXCEPTION 'invalid_state_transition'
      USING ERRCODE = 'P0003',
            HINT = format('Cannot close from %s state', v_current_status);
  END IF;

  -- Require at least one closing artifact
  IF p_drop_event_id IS NULL AND p_closing_inventory_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'missing_closing_artifact'
      USING ERRCODE = 'P0004',
            HINT = 'Provide drop_event_id or closing_inventory_snapshot_id';
  END IF;

  UPDATE table_session SET
    status = 'CLOSED',
    closed_at = now(),
    closed_by_staff_id = v_actor_id,
    drop_event_id = COALESCE(p_drop_event_id, drop_event_id),
    closing_inventory_snapshot_id = COALESCE(p_closing_inventory_snapshot_id, closing_inventory_snapshot_id),
    notes = COALESCE(p_notes, notes)
  WHERE id = p_table_session_id
  RETURNING * INTO v_result;

  -- =====================================================================
  -- PRD-038: Inline rundown persistence (same transaction as close)
  -- =====================================================================
  -- Computes rundown from session data and UPSERT into table_rundown_report.
  -- If a pre-close manual persist exists, it gets updated with final values.
  -- =====================================================================

  -- Derive gaming day
  SELECT COALESCE(gaming_day_start_time, time '06:00') INTO v_gstart
  FROM casino_settings
  WHERE casino_id = v_casino_id;

  v_gaming_day := compute_gaming_day(v_result.opened_at, v_gstart);

  -- Opening snapshot
  SELECT tis.id,
         COALESCE(tis.total_cents, chipset_total_cents(tis.chipset)::integer)
  INTO v_opening_snapshot_id, v_opening_cents
  FROM table_inventory_snapshot tis
  WHERE tis.session_id = p_table_session_id
    AND tis.snapshot_type IN ('OPENING', 'open')
  ORDER BY tis.created_at DESC
  LIMIT 1;

  IF v_opening_cents IS NULL AND v_result.opening_inventory_snapshot_id IS NOT NULL THEN
    SELECT tis.id,
           COALESCE(tis.total_cents, chipset_total_cents(tis.chipset)::integer)
    INTO v_opening_snapshot_id, v_opening_cents
    FROM table_inventory_snapshot tis
    WHERE tis.id = v_result.opening_inventory_snapshot_id;
  END IF;

  -- Closing snapshot
  SELECT tis.id,
         COALESCE(tis.total_cents, chipset_total_cents(tis.chipset)::integer)
  INTO v_closing_snapshot_id, v_closing_cents
  FROM table_inventory_snapshot tis
  WHERE tis.session_id = p_table_session_id
    AND tis.snapshot_type IN ('CLOSING', 'close')
  ORDER BY tis.created_at DESC
  LIMIT 1;

  IF v_closing_cents IS NULL AND v_result.closing_inventory_snapshot_id IS NOT NULL THEN
    SELECT tis.id,
           COALESCE(tis.total_cents, chipset_total_cents(tis.chipset)::integer)
    INTO v_closing_snapshot_id, v_closing_cents
    FROM table_inventory_snapshot tis
    WHERE tis.id = v_result.closing_inventory_snapshot_id;
  END IF;

  -- Opening source
  IF v_opening_cents IS NOT NULL THEN
    v_opening_source := 'SNAPSHOT';
  ELSE
    v_opening_source := 'UNAVAILABLE';
  END IF;

  -- Win computation: only when drop is posted
  IF v_result.drop_posted_at IS NOT NULL AND v_result.drop_total_cents IS NOT NULL THEN
    v_table_win :=
      COALESCE(v_closing_cents, 0)
      + COALESCE(v_result.credits_total_cents, 0)
      + v_result.drop_total_cents
      - COALESCE(v_opening_cents, 0)
      - COALESCE(v_result.fills_total_cents, 0);
  ELSE
    v_table_win := NULL;
  END IF;

  -- Par variance
  SELECT par_total_cents INTO v_par_target
  FROM gaming_table
  WHERE id = v_result.gaming_table_id;

  IF v_par_target IS NOT NULL AND v_table_win IS NOT NULL THEN
    v_variance := v_table_win - v_par_target;
  ELSE
    v_variance := NULL;
  END IF;

  -- UPSERT rundown report
  INSERT INTO table_rundown_report (
    casino_id,
    table_session_id,
    gaming_table_id,
    gaming_day,
    opening_snapshot_id,
    closing_snapshot_id,
    drop_event_id,
    opening_bankroll_cents,
    closing_bankroll_cents,
    fills_total_cents,
    credits_total_cents,
    drop_total_cents,
    table_win_cents,
    opening_source,
    computation_grade,
    par_target_cents,
    variance_from_par_cents,
    computed_by,
    computed_at
  ) VALUES (
    v_casino_id,
    p_table_session_id,
    v_result.gaming_table_id,
    v_gaming_day,
    v_opening_snapshot_id,
    v_closing_snapshot_id,
    COALESCE(p_drop_event_id, v_result.drop_event_id),
    v_opening_cents,
    v_closing_cents,
    COALESCE(v_result.fills_total_cents, 0),
    COALESCE(v_result.credits_total_cents, 0),
    v_result.drop_total_cents,
    v_table_win,
    v_opening_source,
    'ESTIMATE',
    v_par_target,
    v_variance,
    v_actor_id,
    now()
  )
  ON CONFLICT (table_session_id) DO UPDATE SET
    opening_snapshot_id = EXCLUDED.opening_snapshot_id,
    closing_snapshot_id = EXCLUDED.closing_snapshot_id,
    drop_event_id = EXCLUDED.drop_event_id,
    opening_bankroll_cents = EXCLUDED.opening_bankroll_cents,
    closing_bankroll_cents = EXCLUDED.closing_bankroll_cents,
    fills_total_cents = EXCLUDED.fills_total_cents,
    credits_total_cents = EXCLUDED.credits_total_cents,
    drop_total_cents = EXCLUDED.drop_total_cents,
    table_win_cents = EXCLUDED.table_win_cents,
    opening_source = EXCLUDED.opening_source,
    computation_grade = EXCLUDED.computation_grade,
    par_target_cents = EXCLUDED.par_target_cents,
    variance_from_par_cents = EXCLUDED.variance_from_par_cents,
    computed_by = EXCLUDED.computed_by,
    computed_at = EXCLUDED.computed_at;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_close_table_session(uuid, uuid, uuid, text) IS
  'Closes table session and persists rundown report inline (same transaction). UPSERT updates pre-close report. ADR-024 compliant. PRD-038.';

-- ============================================================================
-- Notify PostgREST
-- ============================================================================
NOTIFY pgrst, 'reload schema';

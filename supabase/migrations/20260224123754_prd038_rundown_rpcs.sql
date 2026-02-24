-- ============================================================================
-- Migration: PRD-038 Rundown Persistence & Finalization RPCs
-- Created: 2026-02-24
-- PRD Reference: docs/10-prd/PRD-038-shift-rundown-persistence-deltas-v0.1.md
-- ADR References: ADR-024 (context injection), ADR-018 (SECURITY DEFINER),
--                 ADR-038 D2 (UPSERT), ADR-038 D3 (finalization)
-- Purpose: rpc_persist_table_rundown (UPSERT) and rpc_finalize_rundown
-- Bounded Context: TableContextService
-- ============================================================================

-- ============================================================================
-- 1. rpc_persist_table_rundown — UPSERT contract
-- ============================================================================
-- Computes rundown from session data and persists to table_rundown_report.
-- INSERT on first call, UPDATE on subsequent (keyed on table_session_id).
-- REJECTS mutation if report is already finalized.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_persist_table_rundown(
  p_table_session_id uuid
) RETURNS public.table_rundown_report
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_session public.table_session;
  v_opening_cents integer;
  v_closing_cents integer;
  v_opening_snapshot_id uuid;
  v_closing_snapshot_id uuid;
  v_drop_event_id uuid;
  v_table_win integer;
  v_gaming_day date;
  v_opening_source text;
  v_par_target integer;
  v_variance integer;
  v_result public.table_rundown_report;
  v_existing_finalized timestamptz;
  v_gstart time;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set';
  END IF;

  -- Role gate: pit_boss or admin
  IF v_staff_role IS NULL OR v_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FORBIDDEN';
  END IF;

  -- =======================================================================
  -- Check existing report finalization
  -- =======================================================================
  SELECT finalized_at INTO v_existing_finalized
  FROM table_rundown_report
  WHERE table_session_id = p_table_session_id;

  IF v_existing_finalized IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TBLRUN_ALREADY_FINALIZED',
      DETAIL = jsonb_build_object('table_session_id', p_table_session_id)::text;
  END IF;

  -- =======================================================================
  -- Load session (casino-scoped)
  -- =======================================================================
  SELECT * INTO v_session
  FROM table_session
  WHERE id = p_table_session_id
    AND casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TBLRUN_NOT_FOUND',
      DETAIL = jsonb_build_object('table_session_id', p_table_session_id)::text;
  END IF;

  -- =======================================================================
  -- Derive gaming_day from session opened_at
  -- =======================================================================
  SELECT COALESCE(gaming_day_start_time, time '06:00') INTO v_gstart
  FROM casino_settings
  WHERE casino_id = v_casino_id;

  v_gaming_day := compute_gaming_day(v_session.opened_at, v_gstart);

  -- =======================================================================
  -- Compute rundown values (reuses rpc_compute_table_rundown logic)
  -- =======================================================================

  -- Opening snapshot: prefer total_cents, fallback to chipset JSON math
  SELECT tis.id,
         COALESCE(tis.total_cents,
           chipset_total_cents(tis.chipset)::integer
         )
  INTO v_opening_snapshot_id, v_opening_cents
  FROM table_inventory_snapshot tis
  WHERE tis.session_id = p_table_session_id
    AND tis.snapshot_type IN ('OPENING', 'open')
  ORDER BY tis.created_at DESC
  LIMIT 1;

  -- Fallback via opening_inventory_snapshot_id
  IF v_opening_cents IS NULL AND v_session.opening_inventory_snapshot_id IS NOT NULL THEN
    SELECT tis.id,
           COALESCE(tis.total_cents,
             chipset_total_cents(tis.chipset)::integer
           )
    INTO v_opening_snapshot_id, v_opening_cents
    FROM table_inventory_snapshot tis
    WHERE tis.id = v_session.opening_inventory_snapshot_id;
  END IF;

  -- Closing snapshot
  SELECT tis.id,
         COALESCE(tis.total_cents,
           chipset_total_cents(tis.chipset)::integer
         )
  INTO v_closing_snapshot_id, v_closing_cents
  FROM table_inventory_snapshot tis
  WHERE tis.session_id = p_table_session_id
    AND tis.snapshot_type IN ('CLOSING', 'close')
  ORDER BY tis.created_at DESC
  LIMIT 1;

  -- Fallback via closing_inventory_snapshot_id
  IF v_closing_cents IS NULL AND v_session.closing_inventory_snapshot_id IS NOT NULL THEN
    SELECT tis.id,
           COALESCE(tis.total_cents,
             chipset_total_cents(tis.chipset)::integer
           )
    INTO v_closing_snapshot_id, v_closing_cents
    FROM table_inventory_snapshot tis
    WHERE tis.id = v_session.closing_inventory_snapshot_id;
  END IF;

  -- Drop event
  v_drop_event_id := v_session.drop_event_id;

  -- Opening source determination
  IF v_opening_cents IS NOT NULL THEN
    v_opening_source := 'SNAPSHOT';
  ELSE
    v_opening_source := 'UNAVAILABLE';
  END IF;

  -- Win computation: only when drop is posted
  IF v_session.drop_posted_at IS NOT NULL AND v_session.drop_total_cents IS NOT NULL THEN
    v_table_win :=
      COALESCE(v_closing_cents, 0)
      + COALESCE(v_session.credits_total_cents, 0)
      + v_session.drop_total_cents
      - COALESCE(v_opening_cents, 0)
      - COALESCE(v_session.fills_total_cents, 0);
  ELSE
    v_table_win := NULL;
  END IF;

  -- Par variance (if par target available)
  SELECT par_total_cents INTO v_par_target
  FROM gaming_table
  WHERE id = v_session.gaming_table_id;

  IF v_par_target IS NOT NULL AND v_table_win IS NOT NULL THEN
    v_variance := v_table_win - v_par_target;
  ELSE
    v_variance := NULL;
  END IF;

  -- =======================================================================
  -- UPSERT: INSERT new or UPDATE existing (keyed on table_session_id)
  -- =======================================================================
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
    v_session.gaming_table_id,
    v_gaming_day,
    v_opening_snapshot_id,
    v_closing_snapshot_id,
    v_drop_event_id,
    v_opening_cents,
    v_closing_cents,
    COALESCE(v_session.fills_total_cents, 0),
    COALESCE(v_session.credits_total_cents, 0),
    v_session.drop_total_cents,
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
    computed_at = EXCLUDED.computed_at
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.rpc_persist_table_rundown(uuid) IS
  'Computes and persists rundown report via UPSERT. Rejects if already finalized (TBLRUN_ALREADY_FINALIZED). ADR-024 compliant.';

REVOKE ALL ON FUNCTION public.rpc_persist_table_rundown(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_persist_table_rundown(uuid) TO authenticated;

-- ============================================================================
-- 2. rpc_finalize_rundown — Immutable finalization stamp
-- ============================================================================
-- Stamps finalized_at + finalized_by on an existing rundown report.
-- Prerequisites: report exists, session is CLOSED, not already finalized.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_finalize_rundown(
  p_report_id uuid
) RETURNS public.table_rundown_report
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_report public.table_rundown_report;
  v_session_status table_session_status;
  v_result public.table_rundown_report;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set';
  END IF;

  -- Role gate: pit_boss or admin
  IF v_staff_role IS NULL OR v_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FORBIDDEN';
  END IF;

  -- =======================================================================
  -- Load report (casino-scoped)
  -- =======================================================================
  SELECT * INTO v_report
  FROM table_rundown_report
  WHERE id = p_report_id
    AND casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TBLRUN_NOT_FOUND',
      DETAIL = jsonb_build_object('report_id', p_report_id)::text;
  END IF;

  -- =======================================================================
  -- Check: not already finalized
  -- =======================================================================
  IF v_report.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TBLRUN_ALREADY_FINALIZED',
      DETAIL = jsonb_build_object('report_id', p_report_id, 'finalized_at', v_report.finalized_at)::text;
  END IF;

  -- =======================================================================
  -- Check: session must be CLOSED
  -- =======================================================================
  SELECT status INTO v_session_status
  FROM table_session
  WHERE id = v_report.table_session_id;

  IF v_session_status IS NULL OR v_session_status <> 'CLOSED' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TBLRUN_SESSION_NOT_CLOSED',
      DETAIL = jsonb_build_object(
        'report_id', p_report_id,
        'session_id', v_report.table_session_id,
        'session_status', v_session_status
      )::text;
  END IF;

  -- =======================================================================
  -- Stamp finalization (immutable once set)
  -- =======================================================================
  UPDATE table_rundown_report
  SET finalized_at = now(),
      finalized_by = v_actor_id
  WHERE id = p_report_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.rpc_finalize_rundown(uuid) IS
  'Stamps finalization on rundown report. Requires CLOSED session, not already finalized. ADR-024 compliant.';

REVOKE ALL ON FUNCTION public.rpc_finalize_rundown(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_rundown(uuid) TO authenticated;

-- ============================================================================
-- Notify PostgREST
-- ============================================================================
NOTIFY pgrst, 'reload schema';

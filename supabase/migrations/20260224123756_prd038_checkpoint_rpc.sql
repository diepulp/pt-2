-- ============================================================================
-- Migration: PRD-038 Shift Checkpoint RPC
-- Created: 2026-02-24
-- PRD Reference: docs/10-prd/PRD-038-shift-rundown-persistence-deltas-v0.1.md
-- ADR References: ADR-024 (context injection), ADR-018 (SECURITY DEFINER)
-- Purpose: rpc_create_shift_checkpoint — creates immutable metric snapshot
--          for shift delta computation. MVP: casino scope only.
-- Bounded Context: TableContextService
-- ============================================================================

-- ============================================================================
-- rpc_create_shift_checkpoint
-- ============================================================================
-- Creates a shift checkpoint with metric snapshot from rpc_shift_table_metrics.
-- MVP: hardcodes checkpoint_scope = 'casino', pit_id = NULL, gaming_table_id = NULL.
-- Derives gaming_day server-side, never client-supplied.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_create_shift_checkpoint(
  p_checkpoint_type text,
  p_notes text DEFAULT NULL
) RETURNS public.shift_checkpoint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_gaming_day date;
  v_gstart time;
  v_tz text;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_win_loss bigint;
  v_fills bigint;
  v_credits bigint;
  v_tables_active integer;
  v_tables_with_coverage integer;
  v_rated_buyin bigint;
  v_grind_buyin bigint;
  v_result public.shift_checkpoint;
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
  -- Derive gaming_day + window boundaries server-side
  -- =======================================================================
  SELECT COALESCE(gaming_day_start_time, time '06:00'),
         COALESCE(timezone, 'America/Los_Angeles')
  INTO v_gstart, v_tz
  FROM casino_settings
  WHERE casino_id = v_casino_id;

  IF v_gstart IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'CHKPT_GAMING_DAY_UNRESOLVABLE',
      DETAIL = jsonb_build_object('casino_id', v_casino_id)::text;
  END IF;

  v_gaming_day := compute_gaming_day(now(), v_gstart);

  -- Window start = gaming day start boundary (gaming_day at gstart in casino TZ)
  v_window_start := (v_gaming_day::text || ' ' || v_gstart::text)::timestamp AT TIME ZONE v_tz;
  v_window_end := now();

  -- =======================================================================
  -- Compute metrics via rpc_shift_table_metrics
  -- =======================================================================
  SELECT
    COALESCE(SUM(m.win_loss_inventory_cents), NULL)::bigint,
    COALESCE(SUM(m.fills_total_cents), 0)::bigint,
    COALESCE(SUM(m.credits_total_cents), 0)::bigint,
    COUNT(*)::integer,
    COUNT(*) FILTER (
      WHERE m.opening_snapshot_id IS NOT NULL
        AND m.closing_snapshot_id IS NOT NULL
    )::integer,
    COALESCE(SUM(m.estimated_drop_rated_cents), 0)::bigint,
    COALESCE(SUM(m.estimated_drop_grind_cents), 0)::bigint
  INTO
    v_win_loss, v_fills, v_credits,
    v_tables_active, v_tables_with_coverage,
    v_rated_buyin, v_grind_buyin
  FROM rpc_shift_table_metrics(v_window_start, v_window_end) m;

  -- =======================================================================
  -- Insert checkpoint (INSERT-only, immutable)
  -- =======================================================================
  INSERT INTO shift_checkpoint (
    casino_id,
    gaming_day,
    checkpoint_scope,
    gaming_table_id,
    pit_id,
    checkpoint_type,
    window_start,
    window_end,
    win_loss_cents,
    fills_total_cents,
    credits_total_cents,
    drop_total_cents,
    tables_active,
    tables_with_coverage,
    rated_buyin_cents,
    grind_buyin_cents,
    cash_out_observed_cents,
    created_by,
    notes
  ) VALUES (
    v_casino_id,
    v_gaming_day,
    'casino',          -- MVP: casino scope only
    NULL,              -- MVP: no per-table scope
    NULL,              -- MVP: no per-pit scope
    p_checkpoint_type,
    v_window_start,
    v_window_end,
    v_win_loss,
    COALESCE(v_fills, 0),
    COALESCE(v_credits, 0),
    NULL,              -- drop_total_cents: not tracked at casino aggregate level in MVP
    v_tables_active,
    v_tables_with_coverage,
    COALESCE(v_rated_buyin, 0),
    COALESCE(v_grind_buyin, 0),
    0,                 -- cash_out_observed_cents: deferred
    v_actor_id,
    p_notes
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.rpc_create_shift_checkpoint(text, text) IS
  'Creates immutable shift checkpoint with metric snapshot. MVP: casino scope only. ADR-024 compliant.';

REVOKE ALL ON FUNCTION public.rpc_create_shift_checkpoint(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_shift_checkpoint(text, text) TO authenticated;

-- ============================================================================
-- Notify PostgREST
-- ============================================================================
NOTIFY pgrst, 'reload schema';

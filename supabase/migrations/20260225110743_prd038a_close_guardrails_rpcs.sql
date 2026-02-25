-- ============================================================================
-- Migration: PRD-038A Close Guardrails & RPC Modifications
-- Created: 2026-02-25
-- PRD Reference: docs/10-prd/PRD-038A-table-lifecycle-audit-patch.md
-- EXEC-SPEC: docs/21-exec-spec/EXEC-038A-table-lifecycle-audit-patch.md
-- Purpose: Modify rpc_close_table_session with guardrails + close_reason.
--          New rpc_force_close_table_session for privileged override.
--          Extract shared rundown persistence helper to prevent drift.
-- Backward Compatibility: New params have DEFAULT NULL; existing callers work.
-- Bounded Context: TableContextService
-- ============================================================================

-- === 1. Shared rundown persistence helper ===
-- Extracted from rpc_close_table_session to prevent logic drift between
-- close and force-close RPCs. Internal-only — not exposed via PostgREST.

CREATE OR REPLACE FUNCTION _persist_inline_rundown(
  p_session_id uuid,
  p_session table_session,
  p_casino_id uuid,
  p_actor_id uuid,
  p_override_drop_event_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
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
  -- Derive gaming day
  SELECT COALESCE(gaming_day_start_time, time '06:00') INTO v_gstart
  FROM casino_settings
  WHERE casino_id = p_casino_id;

  v_gaming_day := compute_gaming_day(p_session.opened_at, v_gstart);

  -- Opening snapshot
  SELECT tis.id,
         COALESCE(tis.total_cents, chipset_total_cents(tis.chipset)::integer)
  INTO v_opening_snapshot_id, v_opening_cents
  FROM table_inventory_snapshot tis
  WHERE tis.session_id = p_session_id
    AND tis.snapshot_type IN ('OPENING', 'open')
  ORDER BY tis.created_at DESC
  LIMIT 1;

  IF v_opening_cents IS NULL AND p_session.opening_inventory_snapshot_id IS NOT NULL THEN
    SELECT tis.id,
           COALESCE(tis.total_cents, chipset_total_cents(tis.chipset)::integer)
    INTO v_opening_snapshot_id, v_opening_cents
    FROM table_inventory_snapshot tis
    WHERE tis.id = p_session.opening_inventory_snapshot_id;
  END IF;

  -- Closing snapshot
  SELECT tis.id,
         COALESCE(tis.total_cents, chipset_total_cents(tis.chipset)::integer)
  INTO v_closing_snapshot_id, v_closing_cents
  FROM table_inventory_snapshot tis
  WHERE tis.session_id = p_session_id
    AND tis.snapshot_type IN ('CLOSING', 'close')
  ORDER BY tis.created_at DESC
  LIMIT 1;

  IF v_closing_cents IS NULL AND p_session.closing_inventory_snapshot_id IS NOT NULL THEN
    SELECT tis.id,
           COALESCE(tis.total_cents, chipset_total_cents(tis.chipset)::integer)
    INTO v_closing_snapshot_id, v_closing_cents
    FROM table_inventory_snapshot tis
    WHERE tis.id = p_session.closing_inventory_snapshot_id;
  END IF;

  -- Opening source
  IF v_opening_cents IS NOT NULL THEN
    v_opening_source := 'SNAPSHOT';
  ELSE
    v_opening_source := 'UNAVAILABLE';
  END IF;

  -- Win computation: only when drop is posted
  IF p_session.drop_posted_at IS NOT NULL AND p_session.drop_total_cents IS NOT NULL THEN
    v_table_win :=
      COALESCE(v_closing_cents, 0)
      + COALESCE(p_session.credits_total_cents, 0)
      + p_session.drop_total_cents
      - COALESCE(v_opening_cents, 0)
      - COALESCE(p_session.fills_total_cents, 0);
  ELSE
    v_table_win := NULL;
  END IF;

  -- Par variance
  SELECT par_total_cents INTO v_par_target
  FROM gaming_table
  WHERE id = p_session.gaming_table_id;

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
    p_casino_id,
    p_session_id,
    p_session.gaming_table_id,
    v_gaming_day,
    v_opening_snapshot_id,
    v_closing_snapshot_id,
    COALESCE(p_override_drop_event_id, p_session.drop_event_id),
    v_opening_cents,
    v_closing_cents,
    COALESCE(p_session.fills_total_cents, 0),
    COALESCE(p_session.credits_total_cents, 0),
    p_session.drop_total_cents,
    v_table_win,
    v_opening_source,
    'ESTIMATE',
    v_par_target,
    v_variance,
    p_actor_id,
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
END;
$$;

-- Internal-only: not callable via PostgREST or by authenticated users
REVOKE ALL ON FUNCTION _persist_inline_rundown(uuid, table_session, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION _persist_inline_rundown IS
  'PRD-038A: Internal helper for inline rundown persistence. Shared by close and force-close RPCs to prevent logic drift. Not exposed via PostgREST.';

-- === 2. Drop old rpc_close_table_session (to replace with extended signature) ===

DROP FUNCTION IF EXISTS rpc_close_table_session(uuid, uuid, uuid, text);

-- === 3. Modified rpc_close_table_session ===
-- Adds: p_close_reason, p_close_note params (DEFAULT NULL for backward compat)
-- Adds: unresolved liabilities guardrail (P0005)
-- Adds: close_note validation for 'other' reason (P0006)
-- Uses: shared _persist_inline_rundown helper

CREATE OR REPLACE FUNCTION rpc_close_table_session(
  p_table_session_id uuid,
  p_drop_event_id uuid DEFAULT NULL,
  p_closing_inventory_snapshot_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_close_reason close_reason_type DEFAULT NULL,
  p_close_note text DEFAULT NULL
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
  v_has_unresolved boolean;
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

  -- Get current status and unresolved items flag with lock
  SELECT status, has_unresolved_items
  INTO v_current_status, v_has_unresolved
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

  -- PRD-038A Gap A: Block close when unresolved liabilities exist
  IF v_has_unresolved THEN
    RAISE EXCEPTION 'unresolved_liabilities'
      USING ERRCODE = 'P0005',
            HINT = 'Session has unresolved items. Use force-close for privileged override.';
  END IF;

  -- Require at least one closing artifact
  IF p_drop_event_id IS NULL AND p_closing_inventory_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'missing_closing_artifact'
      USING ERRCODE = 'P0004',
            HINT = 'Provide drop_event_id or closing_inventory_snapshot_id';
  END IF;

  -- PRD-038A Gap B: Validate close_note for 'other' reason
  IF p_close_reason = 'other' AND (p_close_note IS NULL OR length(trim(p_close_note)) = 0) THEN
    RAISE EXCEPTION 'close_note_required'
      USING ERRCODE = 'P0006',
            HINT = 'close_reason=other requires a non-empty close_note';
  END IF;

  UPDATE table_session SET
    status = 'CLOSED',
    closed_at = now(),
    closed_by_staff_id = v_actor_id,
    drop_event_id = COALESCE(p_drop_event_id, drop_event_id),
    closing_inventory_snapshot_id = COALESCE(p_closing_inventory_snapshot_id, closing_inventory_snapshot_id),
    notes = COALESCE(p_notes, notes),
    close_reason = p_close_reason,
    close_note = p_close_note
  WHERE id = p_table_session_id
  RETURNING * INTO v_result;

  -- PRD-038: Inline rundown persistence (shared helper)
  PERFORM _persist_inline_rundown(
    p_table_session_id,
    v_result,
    v_casino_id,
    v_actor_id,
    p_drop_event_id
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_close_table_session(uuid, uuid, uuid, text, close_reason_type, text) IS
  'Closes table session with close guardrails (PRD-038A) and inline rundown persistence (PRD-038). UPSERT updates pre-close report. ADR-024 compliant.';

-- === 4. New rpc_force_close_table_session ===
-- Privileged escape hatch for pit_boss/admin.
-- Skips has_unresolved_items check, sets requires_reconciliation=true.
-- Does NOT clear has_unresolved_items (remains true for reconciliation tracking).
-- Emits audit_log entry for compliance.

CREATE OR REPLACE FUNCTION rpc_force_close_table_session(
  p_table_session_id uuid,
  p_close_reason close_reason_type,
  p_close_note text DEFAULT NULL
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
BEGIN
  PERFORM set_rls_context_from_staff();

  v_casino_id := current_setting('app.casino_id')::uuid;
  v_actor_id := current_setting('app.actor_id')::uuid;

  -- Authorization: force-close is restricted to pit_boss/admin
  v_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  IF v_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = 'P0001',
            HINT = 'Only pit_boss or admin roles can force-close sessions';
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

  -- Cannot force-close an already closed session
  IF v_current_status = 'CLOSED' THEN
    RAISE EXCEPTION 'invalid_state_transition'
      USING ERRCODE = 'P0003',
            HINT = 'Session is already closed';
  END IF;

  -- Validate close_note for 'other' reason
  IF p_close_reason = 'other' AND (p_close_note IS NULL OR length(trim(p_close_note)) = 0) THEN
    RAISE EXCEPTION 'close_note_required'
      USING ERRCODE = 'P0006',
            HINT = 'close_reason=other requires a non-empty close_note';
  END IF;

  -- Force close: skip has_unresolved_items check, set requires_reconciliation
  UPDATE table_session SET
    status = 'CLOSED',
    closed_at = now(),
    closed_by_staff_id = v_actor_id,
    close_reason = p_close_reason,
    close_note = p_close_note,
    requires_reconciliation = true
  WHERE id = p_table_session_id
  RETURNING * INTO v_result;

  -- Audit trail: force close is always logged
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'table-context',
    v_actor_id,
    'force_close',
    jsonb_build_object(
      'table_session_id', p_table_session_id,
      'close_reason', p_close_reason::text,
      'close_note', p_close_note,
      'previous_status', v_current_status::text,
      'has_unresolved_items', v_result.has_unresolved_items,
      'requires_reconciliation', true
    )
  );

  -- Inline rundown persistence (shared helper)
  PERFORM _persist_inline_rundown(
    p_table_session_id,
    v_result,
    v_casino_id,
    v_actor_id
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_force_close_table_session(uuid, close_reason_type, text) IS
  'PRD-038A: Privileged force-close for pit_boss/admin. Skips unresolved liabilities check, sets requires_reconciliation=true, emits audit_log. ADR-024 compliant.';

-- === 5. Permissions ===

-- Close: preserve existing grants (old function was dropped, re-grant)
REVOKE ALL ON FUNCTION rpc_close_table_session(uuid, uuid, uuid, text, close_reason_type, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpc_close_table_session(uuid, uuid, uuid, text, close_reason_type, text) TO authenticated;

-- Force close: grant to authenticated (role gate is enforced in RPC body)
REVOKE ALL ON FUNCTION rpc_force_close_table_session(uuid, close_reason_type, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpc_force_close_table_session(uuid, close_reason_type, text) TO authenticated;

-- === 6. Notify PostgREST ===

NOTIFY pgrst, 'reload schema';

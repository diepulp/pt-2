-- ============================================================================
-- Migration: PRD-038 Modify Fill/Credit RPCs for Session Linkage
-- Created: 2026-02-24
-- PRD Reference: docs/10-prd/PRD-038-shift-rundown-persistence-deltas-v0.1.md
-- ADR References: ADR-024 (context injection), ADR-038 D1 (session totals)
-- Purpose: Modify rpc_request_table_fill and rpc_request_table_credit to:
--   1. Resolve active session via unique_active_session_per_table (INTO STRICT)
--   2. Write session_id FK onto fill/credit rows
--   3. Atomic increment fills_total_cents / credits_total_cents on table_session
--   4. Late-event detection: flip has_late_events + audit_log on finalized reports
-- Backward Compatibility: Preserves existing signature + ON CONFLICT behavior.
-- Bounded Context: TableContextService
-- ============================================================================

-- ============================================================================
-- 1. rpc_request_table_fill — session linkage + atomic totals + late events
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_request_table_fill(
  p_casino_id uuid,
  p_table_id uuid,
  p_chipset jsonb,
  p_amount_cents integer,
  p_delivered_by uuid,
  p_received_by uuid,
  p_slip_no text,
  p_request_id text
) RETURNS table_fill
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_session_id uuid;
  v_result table_fill;
  v_report_finalized boolean;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot request table fills', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- =======================================================================
  -- PRD-038: Resolve active session via unique_active_session_per_table
  -- INTO STRICT: fails loud on NO_DATA_FOUND or TOO_MANY_ROWS
  -- =======================================================================
  SELECT id INTO STRICT v_session_id
  FROM table_session
  WHERE casino_id = v_context_casino_id
    AND gaming_table_id = p_table_id
    AND status IN ('OPEN', 'ACTIVE', 'RUNDOWN');

  -- =======================================================================
  -- PRD-038: Insert fill with session_id FK
  -- =======================================================================
  INSERT INTO public.table_fill (
    casino_id,
    table_id,
    chipset,
    amount_cents,
    requested_by,
    delivered_by,
    received_by,
    slip_no,
    request_id,
    status,
    session_id
  )
  VALUES (
    p_casino_id,
    p_table_id,
    p_chipset,
    p_amount_cents,
    v_context_actor_id,
    p_delivered_by,
    p_received_by,
    p_slip_no,
    p_request_id,
    'requested',
    v_session_id
  )
  ON CONFLICT (casino_id, request_id) DO UPDATE
    SET delivered_by = EXCLUDED.delivered_by,
        received_by = EXCLUDED.received_by,
        amount_cents = EXCLUDED.amount_cents
  RETURNING * INTO v_result;

  -- =======================================================================
  -- PRD-038 D1: Atomic increment session totals
  -- =======================================================================
  UPDATE table_session
  SET fills_total_cents = COALESCE(fills_total_cents, 0) + p_amount_cents
  WHERE id = v_session_id;

  -- =======================================================================
  -- PRD-038: Late-event detection
  -- If session's rundown report is already finalized, flag it
  -- =======================================================================
  SELECT (finalized_at IS NOT NULL) INTO v_report_finalized
  FROM table_rundown_report
  WHERE table_session_id = v_session_id;

  IF v_report_finalized IS TRUE THEN
    -- Monotonic false -> true (never reset)
    UPDATE table_rundown_report
    SET has_late_events = true
    WHERE table_session_id = v_session_id
      AND has_late_events = false;

    -- Audit trail
    INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
    VALUES (
      v_context_casino_id,
      'table-context',
      v_context_actor_id,
      'LATE_EVENT_AFTER_FINALIZATION',
      jsonb_build_object(
        'event_type', 'fill',
        'event_id', v_result.id,
        'session_id', v_session_id,
        'amount_cents', p_amount_cents
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_request_table_fill(uuid, uuid, jsonb, integer, uuid, uuid, text, text) IS
  'ADR-024 compliant. PRD-033: status=requested. PRD-038: session linkage, atomic totals, late-event detection.';

-- ============================================================================
-- 2. rpc_request_table_credit — session linkage + atomic totals + late events
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_request_table_credit(
  p_casino_id uuid,
  p_table_id uuid,
  p_chipset jsonb,
  p_amount_cents integer,
  p_sent_by uuid,
  p_received_by uuid,
  p_slip_no text,
  p_request_id text
) RETURNS table_credit
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_session_id uuid;
  v_result table_credit;
  v_report_finalized boolean;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot request table credit', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- =======================================================================
  -- PRD-038: Resolve active session
  -- =======================================================================
  SELECT id INTO STRICT v_session_id
  FROM table_session
  WHERE casino_id = v_context_casino_id
    AND gaming_table_id = p_table_id
    AND status IN ('OPEN', 'ACTIVE', 'RUNDOWN');

  -- =======================================================================
  -- PRD-038: Insert credit with session_id FK
  -- =======================================================================
  INSERT INTO public.table_credit (
    casino_id,
    table_id,
    chipset,
    amount_cents,
    authorized_by,
    sent_by,
    received_by,
    slip_no,
    request_id,
    status,
    session_id
  )
  VALUES (
    p_casino_id,
    p_table_id,
    p_chipset,
    p_amount_cents,
    v_context_actor_id,
    p_sent_by,
    p_received_by,
    p_slip_no,
    p_request_id,
    'requested',
    v_session_id
  )
  ON CONFLICT (casino_id, request_id) DO UPDATE
    SET received_by = EXCLUDED.received_by,
        amount_cents = EXCLUDED.amount_cents
  RETURNING * INTO v_result;

  -- =======================================================================
  -- PRD-038 D1: Atomic increment session totals
  -- =======================================================================
  UPDATE table_session
  SET credits_total_cents = COALESCE(credits_total_cents, 0) + p_amount_cents
  WHERE id = v_session_id;

  -- =======================================================================
  -- PRD-038: Late-event detection
  -- =======================================================================
  SELECT (finalized_at IS NOT NULL) INTO v_report_finalized
  FROM table_rundown_report
  WHERE table_session_id = v_session_id;

  IF v_report_finalized IS TRUE THEN
    UPDATE table_rundown_report
    SET has_late_events = true
    WHERE table_session_id = v_session_id
      AND has_late_events = false;

    INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
    VALUES (
      v_context_casino_id,
      'table-context',
      v_context_actor_id,
      'LATE_EVENT_AFTER_FINALIZATION',
      jsonb_build_object(
        'event_type', 'credit',
        'event_id', v_result.id,
        'session_id', v_session_id,
        'amount_cents', p_amount_cents
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_request_table_credit(uuid, uuid, jsonb, integer, uuid, uuid, text, text) IS
  'ADR-024 compliant. PRD-033: status=requested. PRD-038: session linkage, atomic totals, late-event detection.';

-- ============================================================================
-- Notify PostgREST
-- ============================================================================
NOTIFY pgrst, 'reload schema';

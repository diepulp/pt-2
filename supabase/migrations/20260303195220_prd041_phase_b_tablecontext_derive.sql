-- ============================================================================
-- Migration: PRD-041 Phase B — TableContext Validate-to-Derive
-- Created: 2026-03-03
-- PRD Reference: docs/10-prd/PRD-041-adr024-p2-validate-to-derive-remediation-v0.md
-- ADR Reference: ADR-024 (authoritative context derivation)
-- Purpose: Remove p_casino_id from 5 TableContext RPCs. Casino scope derived
--          from set_rls_context_from_staff() session vars (v_casino_id).
-- Bounded Context: TableContextService
-- ============================================================================

-- ============================================================================
-- 1. rpc_update_table_status — remove p_casino_id
-- ============================================================================

-- DROP old signature (exact param types for phantom overload prevention)
DROP FUNCTION IF EXISTS public.rpc_update_table_status(uuid, uuid, table_status);

CREATE OR REPLACE FUNCTION public.rpc_update_table_status(
  p_table_id uuid,
  p_new_status table_status
) RETURNS gaming_table
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_current_status table_status;
  v_result gaming_table;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Defense-in-depth: casino context must be available
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot update table status', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- Get current status with row lock
  SELECT status INTO v_current_status
  FROM gaming_table
  WHERE id = p_table_id AND casino_id = v_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Table % not found', p_table_id;
  END IF;

  -- Validate state transition
  IF NOT (
    (v_current_status = 'inactive' AND p_new_status = 'active') OR
    (v_current_status = 'active' AND p_new_status IN ('inactive', 'closed'))
  ) THEN
    RAISE EXCEPTION 'TABLE_INVALID_TRANSITION: Cannot transition from % to %',
      v_current_status, p_new_status;
  END IF;

  -- Update status
  UPDATE gaming_table
  SET status = p_new_status
  WHERE id = p_table_id AND casino_id = v_casino_id
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'table-context',
    v_context_actor_id,
    'update_table_status',
    jsonb_build_object(
      'table_id', p_table_id,
      'from_status', v_current_status,
      'to_status', p_new_status
    )
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_table_status(uuid, table_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_table_status(uuid, table_status) TO authenticated, service_role;

-- ============================================================================
-- 2. rpc_log_table_drop — remove p_casino_id
-- ============================================================================

-- DROP old signature
DROP FUNCTION IF EXISTS public.rpc_log_table_drop(uuid, uuid, text, text, uuid, timestamptz, timestamptz, timestamptz, date, integer, text);

CREATE OR REPLACE FUNCTION public.rpc_log_table_drop(
  p_table_id uuid,
  p_drop_box_id text,
  p_seal_no text,
  p_witnessed_by uuid,
  p_removed_at timestamptz DEFAULT now(),
  p_delivered_at timestamptz DEFAULT NULL,
  p_delivered_scan_at timestamptz DEFAULT NULL,
  p_gaming_day date DEFAULT NULL,
  p_seq_no integer DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS table_drop_event
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_result table_drop_event;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Defense-in-depth: casino context must be available
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot log table drops', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  INSERT INTO public.table_drop_event (
    casino_id,
    table_id,
    drop_box_id,
    seal_no,
    removed_by,
    witnessed_by,
    removed_at,
    delivered_at,
    delivered_scan_at,
    gaming_day,
    seq_no,
    note
  )
  VALUES (
    v_casino_id,
    p_table_id,
    p_drop_box_id,
    p_seal_no,
    v_context_actor_id,
    p_witnessed_by,
    COALESCE(p_removed_at, now()),
    p_delivered_at,
    p_delivered_scan_at,
    p_gaming_day,
    p_seq_no,
    p_note
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_log_table_drop(uuid, text, text, uuid, timestamptz, timestamptz, timestamptz, date, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_log_table_drop(uuid, text, text, uuid, timestamptz, timestamptz, timestamptz, date, integer, text) TO authenticated, service_role;

-- ============================================================================
-- 3. rpc_log_table_inventory_snapshot — remove p_casino_id
-- ============================================================================

-- DROP old signature
DROP FUNCTION IF EXISTS public.rpc_log_table_inventory_snapshot(uuid, uuid, text, jsonb, uuid, integer, text);

CREATE OR REPLACE FUNCTION public.rpc_log_table_inventory_snapshot(
  p_table_id uuid,
  p_snapshot_type text,
  p_chipset jsonb,
  p_verified_by uuid DEFAULT NULL,
  p_discrepancy_cents integer DEFAULT 0,
  p_note text DEFAULT NULL
) RETURNS table_inventory_snapshot
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_result table_inventory_snapshot;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Defense-in-depth: casino context must be available
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot log table inventory snapshots', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  INSERT INTO public.table_inventory_snapshot (
    casino_id,
    table_id,
    snapshot_type,
    chipset,
    counted_by,
    verified_by,
    discrepancy_cents,
    note
  )
  VALUES (
    v_casino_id,
    p_table_id,
    p_snapshot_type,
    p_chipset,
    v_context_actor_id,
    p_verified_by,
    COALESCE(p_discrepancy_cents, 0),
    p_note
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_log_table_inventory_snapshot(uuid, text, jsonb, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_log_table_inventory_snapshot(uuid, text, jsonb, uuid, integer, text) TO authenticated, service_role;

-- ============================================================================
-- 4. rpc_request_table_fill — remove p_casino_id
-- ============================================================================

-- DROP old signature
DROP FUNCTION IF EXISTS public.rpc_request_table_fill(uuid, uuid, jsonb, integer, uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.rpc_request_table_fill(
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
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
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

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Defense-in-depth: casino context must be available
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
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
  WHERE casino_id = v_casino_id
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
    v_casino_id,
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
      v_casino_id,
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

REVOKE ALL ON FUNCTION public.rpc_request_table_fill(uuid, jsonb, integer, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_table_fill(uuid, jsonb, integer, uuid, uuid, text, text) TO authenticated, service_role;

-- ============================================================================
-- 5. rpc_request_table_credit — remove p_casino_id
-- ============================================================================

-- DROP old signature
DROP FUNCTION IF EXISTS public.rpc_request_table_credit(uuid, uuid, jsonb, integer, uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.rpc_request_table_credit(
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
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
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

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Defense-in-depth: casino context must be available
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
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
  WHERE casino_id = v_casino_id
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
    v_casino_id,
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
      v_casino_id,
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

REVOKE ALL ON FUNCTION public.rpc_request_table_credit(uuid, jsonb, integer, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_table_credit(uuid, jsonb, integer, uuid, uuid, text, text) TO authenticated, service_role;

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

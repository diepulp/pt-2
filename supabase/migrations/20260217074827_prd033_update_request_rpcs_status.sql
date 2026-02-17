-- ============================================================================
-- Migration: PRD-033 Update Request RPCs to Set status='requested'
-- Created: 2026-02-17
-- PRD Reference: docs/10-prd/PRD-033-cashier-workflow-mvp-v0.md
-- Purpose: Update rpc_request_table_fill and rpc_request_table_credit to set
--          status='requested' on newly inserted rows. Existing rows already
--          default to 'confirmed' (WS1 migration). New pit-initiated requests
--          will now start as 'requested', requiring cashier confirmation.
-- Backward Compatibility: ON CONFLICT clause retains existing behavior for
--          idempotent re-submits. Status is NOT updated on conflict (re-request
--          of an already-confirmed fill/credit stays confirmed).
-- ============================================================================

-- ============================================================================
-- 1. rpc_request_table_fill — add status='requested' to INSERT
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
  v_result table_fill;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Casino scope validation
  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot request table fills', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
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
    status           -- PRD-033: New rows start as 'requested'
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
    'requested'      -- PRD-033: Pending cashier confirmation
  )
  ON CONFLICT (casino_id, request_id) DO UPDATE
    SET delivered_by = EXCLUDED.delivered_by,
        received_by = EXCLUDED.received_by,
        amount_cents = EXCLUDED.amount_cents
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_request_table_fill(uuid, uuid, jsonb, integer, uuid, uuid, text, text) IS
  'ADR-024 compliant. PRD-033: Now sets status=requested for cashier confirmation workflow.';

-- ============================================================================
-- 2. rpc_request_table_credit — add status='requested' to INSERT
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
  v_result table_credit;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Casino scope validation
  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot request table credit', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
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
    status           -- PRD-033: New rows start as 'requested'
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
    'requested'      -- PRD-033: Pending cashier confirmation
  )
  ON CONFLICT (casino_id, request_id) DO UPDATE
    SET received_by = EXCLUDED.received_by,
        amount_cents = EXCLUDED.amount_cents
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_request_table_credit(uuid, uuid, jsonb, integer, uuid, uuid, text, text) IS
  'ADR-024 compliant. PRD-033: Now sets status=requested for cashier confirmation workflow.';

NOTIFY pgrst, 'reload schema';

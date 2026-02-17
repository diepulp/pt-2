-- ============================================================================
-- Migration: PRD-033 Cashier Confirmation RPCs
-- Created: 2026-02-17
-- PRD Reference: docs/10-prd/PRD-033-cashier-workflow-mvp-v0.md
-- ADR References: ADR-024 (authoritative context), ADR-018 (SECURITY DEFINER)
-- Purpose: Create three SECURITY DEFINER RPCs for cashier confirmation
--          operations: fill confirmation, credit confirmation, drop acknowledgement.
--          All follow ADR-024 pattern — no spoofable casino_id/actor_id params.
-- ============================================================================

-- ============================================================================
-- 1. rpc_confirm_table_fill
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_confirm_table_fill(
  p_fill_id uuid,
  p_confirmed_amount_cents int,
  p_discrepancy_note text DEFAULT NULL
) RETURNS table_fill
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_fill table_fill;
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
    RAISE EXCEPTION 'unauthenticated'
      USING ERRCODE = '28000';
  END IF;

  -- Context must be present
  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Staff role authorization (cashier/admin only)
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot confirm table fills', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- Input validation (Audit Patch §G)
  IF p_confirmed_amount_cents IS NULL OR p_confirmed_amount_cents <= 0 THEN
    RAISE EXCEPTION 'confirmed_amount_cents must be a positive integer'
      USING ERRCODE = '22023';
  END IF;

  IF p_discrepancy_note IS NOT NULL AND length(p_discrepancy_note) > 500 THEN
    RAISE EXCEPTION 'discrepancy_note must be 500 characters or fewer'
      USING ERRCODE = '22023';
  END IF;

  -- Lock and fetch the fill record
  SELECT * INTO v_fill
  FROM table_fill
  WHERE id = p_fill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'table_fill not found: %', p_fill_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Cross-casino guard: fill must belong to caller's casino
  IF v_fill.casino_id <> v_context_casino_id THEN
    RAISE EXCEPTION 'FORBIDDEN: fill belongs to a different casino'
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency: if already confirmed, return existing row (no-op)
  IF v_fill.status = 'confirmed' THEN
    RETURN v_fill;
  END IF;

  -- Discrepancy note required when amounts differ
  IF p_confirmed_amount_cents <> v_fill.amount_cents AND p_discrepancy_note IS NULL THEN
    RAISE EXCEPTION 'discrepancy_note is required when confirmed amount (%) differs from requested amount (%)',
      p_confirmed_amount_cents, v_fill.amount_cents
      USING ERRCODE = '23502';
  END IF;

  -- Transition: requested → confirmed
  UPDATE table_fill
  SET
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by = v_context_actor_id,
    confirmed_amount_cents = p_confirmed_amount_cents,
    discrepancy_note = p_discrepancy_note
  WHERE id = p_fill_id
  RETURNING * INTO v_fill;

  RETURN v_fill;
END;
$$;

COMMENT ON FUNCTION rpc_confirm_table_fill(uuid, int, text) IS
  'PRD-033: Cashier confirms fill fulfillment. ADR-024 compliant — derives context from set_rls_context_from_staff(). Idempotent: re-confirmation returns existing row.';

-- ============================================================================
-- 2. rpc_confirm_table_credit
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_confirm_table_credit(
  p_credit_id uuid,
  p_confirmed_amount_cents int,
  p_discrepancy_note text DEFAULT NULL
) RETURNS table_credit
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_credit table_credit;
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
    RAISE EXCEPTION 'unauthenticated'
      USING ERRCODE = '28000';
  END IF;

  -- Context must be present
  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Staff role authorization (cashier/admin only)
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot confirm table credits', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- Input validation (Audit Patch §G)
  IF p_confirmed_amount_cents IS NULL OR p_confirmed_amount_cents <= 0 THEN
    RAISE EXCEPTION 'confirmed_amount_cents must be a positive integer'
      USING ERRCODE = '22023';
  END IF;

  IF p_discrepancy_note IS NOT NULL AND length(p_discrepancy_note) > 500 THEN
    RAISE EXCEPTION 'discrepancy_note must be 500 characters or fewer'
      USING ERRCODE = '22023';
  END IF;

  -- Lock and fetch the credit record
  SELECT * INTO v_credit
  FROM table_credit
  WHERE id = p_credit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'table_credit not found: %', p_credit_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Cross-casino guard: credit must belong to caller's casino
  IF v_credit.casino_id <> v_context_casino_id THEN
    RAISE EXCEPTION 'FORBIDDEN: credit belongs to a different casino'
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency: if already confirmed, return existing row (no-op)
  IF v_credit.status = 'confirmed' THEN
    RETURN v_credit;
  END IF;

  -- Discrepancy note required when amounts differ
  IF p_confirmed_amount_cents <> v_credit.amount_cents AND p_discrepancy_note IS NULL THEN
    RAISE EXCEPTION 'discrepancy_note is required when confirmed amount (%) differs from requested amount (%)',
      p_confirmed_amount_cents, v_credit.amount_cents
      USING ERRCODE = '23502';
  END IF;

  -- Transition: requested → confirmed
  UPDATE table_credit
  SET
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by = v_context_actor_id,
    confirmed_amount_cents = p_confirmed_amount_cents,
    discrepancy_note = p_discrepancy_note
  WHERE id = p_credit_id
  RETURNING * INTO v_credit;

  RETURN v_credit;
END;
$$;

COMMENT ON FUNCTION rpc_confirm_table_credit(uuid, int, text) IS
  'PRD-033: Cashier confirms credit receipt. ADR-024 compliant — derives context from set_rls_context_from_staff(). Idempotent: re-confirmation returns existing row.';

-- ============================================================================
-- 3. rpc_acknowledge_drop_received
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_acknowledge_drop_received(
  p_drop_event_id uuid
) RETURNS table_drop_event
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_drop table_drop_event;
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
    RAISE EXCEPTION 'unauthenticated'
      USING ERRCODE = '28000';
  END IF;

  -- Context must be present
  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Staff role authorization (cashier/admin only)
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot acknowledge drop events', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- Lock and fetch the drop event record
  SELECT * INTO v_drop
  FROM table_drop_event
  WHERE id = p_drop_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'table_drop_event not found: %', p_drop_event_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Cross-casino guard: drop event must belong to caller's casino
  IF v_drop.casino_id <> v_context_casino_id THEN
    RAISE EXCEPTION 'FORBIDDEN: drop event belongs to a different casino'
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency: if already acknowledged, return existing row (no-op)
  IF v_drop.cage_received_at IS NOT NULL THEN
    RETURN v_drop;
  END IF;

  -- Stamp cage receipt
  UPDATE table_drop_event
  SET
    cage_received_at = now(),
    cage_received_by = v_context_actor_id
  WHERE id = p_drop_event_id
  RETURNING * INTO v_drop;

  RETURN v_drop;
END;
$$;

COMMENT ON FUNCTION rpc_acknowledge_drop_received(uuid) IS
  'PRD-033: Cashier acknowledges drop box received at cage. ADR-024 compliant — derives context from set_rls_context_from_staff(). Idempotent: re-acknowledgement returns existing row.';

NOTIFY pgrst, 'reload schema';

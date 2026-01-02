-- =====================================================
-- Migration: ADR-024 WS-FIN - Financial RPC Remediation
-- Created: 2025-12-31 01:43:59 UTC
-- ADR Reference: docs/80-adrs/ADR-024_DECISIONS.md
-- Issue: Permission denied for function set_rls_context in buy-in workflow
-- =====================================================
-- Root Cause:
--   rpc_create_financial_txn is SECURITY INVOKER and calls deprecated
--   set_rls_context() which was revoked from authenticated role by ADR-024.
--
-- Fix:
--   Replace set_rls_context() call with set_rls_context_from_staff()
--   which is granted to authenticated role.
--
-- Security Invariants Enforced:
--   INV-3: Staff identity bound to auth.uid() via staff table lookup
--   INV-5: Context set via SET LOCAL (pooler-safe)
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_create_financial_txn(
  p_casino_id uuid,
  p_player_id uuid,
  p_visit_id uuid,
  p_amount numeric,
  p_direction financial_direction,
  p_source financial_source,
  p_created_by_staff_id uuid,
  p_tender_type text DEFAULT NULL,
  p_rating_slip_id uuid DEFAULT NULL,
  p_related_transaction_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_created_at timestamptz DEFAULT now()
) RETURNS player_financial_transaction
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_row player_financial_transaction%ROWTYPE;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- Replaces vulnerable: PERFORM set_rls_context(p_created_by_staff_id, ...)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context (set by set_rls_context_from_staff)
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- =======================================================================
  -- Authentication and Authorization Checks
  -- =======================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_casino_id IS NULL OR v_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_casino_id, p_casino_id;
  END IF;

  IF v_actor_id IS NULL OR v_actor_id <> p_created_by_staff_id THEN
    RAISE EXCEPTION 'actor_id mismatch: context is % but caller provided %',
      v_actor_id, p_created_by_staff_id;
  END IF;

  -- Verify staff role: cashier, pit_boss, or admin
  PERFORM 1
    FROM staff s
   WHERE s.id = p_created_by_staff_id
     AND s.user_id = auth.uid()
     AND s.status = 'active'
     AND s.casino_id = v_casino_id
     AND s.role IN ('cashier', 'pit_boss', 'admin');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized staff role';
  END IF;

  -- =======================================================================
  -- SEC-005 v1.2.0: Pit Boss Constraint Validation
  -- =======================================================================
  -- pit_boss constraint: direction='in' only, cash/chips only
  IF v_staff_role = 'pit_boss' THEN
    IF p_direction != 'in' THEN
      RAISE EXCEPTION 'pit_boss can only create buy-in transactions (direction=in)';
    END IF;
    IF p_tender_type NOT IN ('cash', 'chips') THEN
      RAISE EXCEPTION 'pit_boss can only use cash or chips for buy-ins';
    END IF;
  END IF;

  -- =======================================================================
  -- Transaction Creation
  -- =======================================================================
  INSERT INTO public.player_financial_transaction AS t (
    id,
    player_id,
    casino_id,
    visit_id,
    rating_slip_id,
    amount,
    direction,
    source,
    tender_type,
    created_by_staff_id,
    related_transaction_id,
    created_at,
    idempotency_key
  )
  VALUES (
    gen_random_uuid(),
    p_player_id,
    p_casino_id,
    p_visit_id,
    p_rating_slip_id,
    p_amount,
    p_direction,
    p_source,
    p_tender_type,
    p_created_by_staff_id,
    p_related_transaction_id,
    COALESCE(p_created_at, now()),
    p_idempotency_key
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING t.* INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION rpc_create_financial_txn(uuid, uuid, uuid, numeric, financial_direction, financial_source, uuid, text, uuid, uuid, text, timestamptz) IS
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context injection. '
  'Enforces pit_boss constraints per SEC-005 v1.2.0 (direction=in, tender_type IN (cash, chips)).';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

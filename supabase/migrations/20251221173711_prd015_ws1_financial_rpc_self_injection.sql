-- Migration: PRD-015 WS1 - Financial RPC Self-Injection Fix
-- Created: 2025-12-21 17:37:11 UTC
-- Purpose: Fix rpc_create_financial_txn to comply with ADR-015 Phase 1A self-injection pattern
-- Reference: ADR-015, SEC-005 v1.2.0, PRD-015, ISSUE-5FE4A689
-- Workstream: WS1 - Database RPC Layer
--
-- Changes:
-- 1. Add self-injection pattern at function start (BEFORE context extraction)
-- 2. Add 'pit_boss' to allowed role list (line 71)
-- 3. Add pit_boss constraint validation per SEC-005 v1.2.0
--
-- Pattern: ADR-015 Phase 1A - RPC self-injection for connection pooling compatibility
-- Reference Migration: 20251213190000_adr015_fix_rpc_context_injection.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_create_financial_txn(
  p_casino_id uuid,
  p_player_id uuid,
  p_visit_id uuid,
  p_amount numeric,
  p_direction player_financial_transaction.direction%TYPE,
  p_source player_financial_transaction.source%TYPE,
  p_created_by_staff_id uuid,
  p_tender_type text DEFAULT NULL,
  p_rating_slip_id uuid DEFAULT NULL,
  p_related_transaction_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_created_at timestamptz DEFAULT now()
) RETURNS public.player_financial_transaction
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_context_staff_role text;
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_row player_financial_transaction%ROWTYPE;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling compatibility
  -- =======================================================================
  -- Extract staff role FIRST (needed for set_rls_context call)
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')
  );

  -- Call set_rls_context to ensure context is available for RLS policies
  -- This handles both session variables (SET LOCAL) and JWT fallback
  PERFORM set_rls_context(p_created_by_staff_id, p_casino_id, v_context_staff_role);

  -- Now extract the validated context (will use JWT fallback if needed)
  v_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  v_actor_id := COALESCE(
    NULLIF(current_setting('app.actor_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
  );

  v_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')
  );

  -- =======================================================================
  -- Authentication and Authorization Checks
  -- =======================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_casino_id IS NULL OR v_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch';
  END IF;

  IF v_actor_id IS NULL OR v_actor_id <> p_created_by_staff_id THEN
    RAISE EXCEPTION 'actor_id mismatch';
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

-- Add function comment documenting ADR-015 compliance
COMMENT ON FUNCTION rpc_create_financial_txn(uuid, uuid, uuid, numeric, financial_direction, financial_source, uuid, text, uuid, uuid, text, timestamptz) IS 'ADR-015 Phase 1A: Self-injects RLS context via set_rls_context for connection pooling compatibility. Enforces pit_boss constraints per SEC-005 v1.2.0 (direction=in, tender_type IN (cash, chips)).';

COMMIT;

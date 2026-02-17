-- ==========================================================================
-- PRD-033: Add p_external_ref parameter to rpc_create_financial_txn
--
-- The external_ref column was added to player_financial_transaction
-- (migration 20260217074825) but the RPC was never updated to accept it.
-- This breaks the cash-out receipt reference flow.
--
-- @see GAP-PRD033-PATRON-CASHOUT-UI
-- @see EXECUTION-SPEC-PRD-033 §PRD-009 Dependency Contract
-- ==========================================================================

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
  p_created_at timestamptz DEFAULT now(),
  p_external_ref text DEFAULT NULL
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
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

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
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %', v_casino_id, p_casino_id;
  END IF;

  IF v_actor_id IS NULL OR v_actor_id <> p_created_by_staff_id THEN
    RAISE EXCEPTION 'actor_id mismatch: context is % but caller provided %', v_actor_id, p_created_by_staff_id;
  END IF;

  IF v_staff_role IS NULL OR v_staff_role NOT IN ('cashier', 'pit_boss', 'admin') THEN
    RAISE EXCEPTION 'unauthorized: staff_role=% is not permitted to create financial transactions', v_staff_role;
  END IF;

  -- =======================================================================
  -- Role-specific validation (SEC-005 v1.2.0)
  -- =======================================================================
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
    idempotency_key,
    external_ref
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
    p_idempotency_key,
    p_external_ref
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING t.* INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION rpc_create_financial_txn(uuid, uuid, uuid, numeric, financial_direction, financial_source, uuid, text, uuid, uuid, text, timestamptz, text) IS
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context injection. '
  'Enforces pit_boss constraints per SEC-005 v1.2.0 (direction=in, tender_type IN (cash, chips)). '
  'PRD-033: Accepts p_external_ref for cage receipt/ticket references.';

NOTIFY pgrst, 'reload schema';

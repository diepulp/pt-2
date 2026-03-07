-- ADR-040: Remove p_created_by_staff_id from rpc_create_financial_txn
-- Category A identity param — must be derived from current_setting('app.actor_id')
-- Pattern: same as rpc_redeem/rpc_manual_credit ADR-040 remediation
--
-- OLD: (p_player_id, p_visit_id, p_amount, p_direction, p_source,
--       p_created_by_staff_id, p_tender_type, p_rating_slip_id,
--       p_related_transaction_id, p_idempotency_key, p_created_at,
--       p_external_ref)                                              [12 params]
-- NEW: same minus p_created_by_staff_id                              [11 params]

BEGIN;

DROP FUNCTION IF EXISTS public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, uuid, text, uuid, uuid, text, timestamptz, text);

CREATE OR REPLACE FUNCTION public.rpc_create_financial_txn(
  p_player_id uuid,
  p_visit_id uuid,
  p_amount numeric,
  p_direction financial_direction,
  p_source financial_source,
  p_tender_type text DEFAULT NULL::text,
  p_rating_slip_id uuid DEFAULT NULL::uuid,
  p_related_transaction_id uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text,
  p_created_at timestamp with time zone DEFAULT now(),
  p_external_ref text DEFAULT NULL::text
)
RETURNS player_financial_transaction
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_row player_financial_transaction%ROWTYPE;
BEGIN
  -- =======================================================================
  -- ADR-024 + ADR-040: Authoritative context injection
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- =======================================================================
  -- Authentication and Authorization Checks
  -- =======================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'SEC-007: casino context missing';
  END IF;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'SEC-007: actor context missing';
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
  -- Transaction Creation (ADR-040: created_by_staff_id derived from context)
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
    v_casino_id,
    p_visit_id,
    p_rating_slip_id,
    p_amount,
    p_direction,
    p_source,
    p_tender_type,
    v_actor_id,
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
$function$;

REVOKE ALL ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, text, uuid, uuid, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, text, uuid, uuid, text, timestamptz, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, text, uuid, uuid, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, text, uuid, uuid, text, timestamptz, text) TO service_role;

COMMENT ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, text, uuid, uuid, text, timestamptz, text)
  IS 'ADR-040: Create financial transaction. created_by_staff_id + casino_id derived from RLS context (no spoofable identity params).';

COMMIT;

NOTIFY pgrst, 'reload schema';

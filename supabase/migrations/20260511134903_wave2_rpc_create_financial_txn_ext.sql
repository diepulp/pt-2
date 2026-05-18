-- PRD-081 Wave 2 — WS2_PRODUCER_A: Extend rpc_create_financial_txn with finance_outbox emission
-- Adds ADR-057 table-anchor eligibility check + atomic outbox INSERT after PFT INSERT.
-- Preserves full ADR-040 shape: 11 params, SECURITY INVOKER, no p_casino_id.
-- DEC-Q4: outbox INSERT is RPC-coupled, not trigger-based.

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_create_financial_txn(
  p_player_id               uuid,
  p_visit_id                uuid,
  p_amount                  numeric,
  p_direction               financial_direction,
  p_source                  financial_source,
  p_tender_type             text                      DEFAULT NULL::text,
  p_rating_slip_id          uuid                      DEFAULT NULL::uuid,
  p_related_transaction_id  uuid                      DEFAULT NULL::uuid,
  p_idempotency_key         text                      DEFAULT NULL::text,
  p_created_at              timestamp with time zone  DEFAULT now(),
  p_external_ref            text                      DEFAULT NULL::text
)
RETURNS player_financial_transaction
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_casino_id  uuid;
  v_actor_id   uuid;
  v_staff_role text;
  v_row        player_financial_transaction%ROWTYPE;
  v_table_id   uuid;
BEGIN
  -- =======================================================================
  -- ADR-024 + ADR-040: Authoritative context injection
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_casino_id  := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id', true), '')::uuid;
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

  -- =======================================================================
  -- Wave 2 Outbox Emission (ADR-057 Class A table-anchor eligibility check)
  -- =======================================================================

  -- F13: non-table-scoped buyin (no rating_slip_id) — no outbox row, no error
  IF p_rating_slip_id IS NULL THEN
    RETURN v_row;
  END IF;

  -- Resolve rating_slip_id → same-casino table_id
  SELECT rs.table_id INTO v_table_id
  FROM public.rating_slip rs
  WHERE rs.id = p_rating_slip_id
    AND rs.casino_id = v_casino_id;

  IF v_table_id IS NULL THEN
    -- F14: rating_slip_id supplied but nonexistent or cross-casino → reject entire write
    RAISE EXCEPTION 'INVALID_INPUT: rating_slip_id % does not resolve to a same-casino table. Financial write rejected. No outbox row emitted.', p_rating_slip_id
      USING ERRCODE = 'P0001';
  END IF;

  -- F15: idempotency replay — outbox row already exists for this PFT row
  IF EXISTS (
    SELECT 1 FROM public.finance_outbox WHERE aggregate_id = v_row.id
  ) THEN
    RETURN v_row;
  END IF;

  -- Atomic outbox INSERT in same transaction as PFT INSERT above (DEC-Q4)
  INSERT INTO public.finance_outbox (
    event_id,
    event_type,
    fact_class,
    origin_label,
    casino_id,
    table_id,
    player_id,
    aggregate_id,
    payload,
    created_at
  ) VALUES (
    public.generate_uuid_v7(),
    'buyin.recorded',
    'ledger',
    'actual',
    v_casino_id,
    v_table_id,
    v_row.player_id,
    v_row.id,
    jsonb_build_object('amount', v_row.amount, 'tender_type', v_row.tender_type),
    NOW()
  );

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, text, uuid, uuid, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, text, uuid, uuid, text, timestamptz, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, text, uuid, uuid, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, text, uuid, uuid, text, timestamptz, text) TO service_role;

COMMENT ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, text, uuid, uuid, text, timestamptz, text)
  IS 'PRD-081 Wave 2: ADR-040 financial transaction creation with Class A outbox emission. '
     'NULL rating_slip_id: PFT INSERT, no outbox (F13). '
     'Invalid/cross-casino rating_slip_id: reject entire write including PFT (F14). '
     'Idempotency replay: no duplicate outbox row (F15). '
     'DEC-Q4: outbox INSERT is in RPC body — not trigger-based.';

COMMIT;

NOTIFY pgrst, 'reload schema';

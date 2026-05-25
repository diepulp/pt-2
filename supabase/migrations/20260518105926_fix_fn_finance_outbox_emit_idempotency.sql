-- Fix fn_finance_outbox_emit idempotency (C1 certification regression)
--
-- Root cause: rpc_create_financial_adjustment is SECURITY INVOKER. The authenticated
-- role has no SELECT grant on finance_outbox (service_role only), so the IF NOT EXISTS
-- guard in the RPC always evaluates TRUE, causing the second call to attempt a duplicate
-- outbox INSERT that hits uq_finance_outbox_aggregate_event.
--
-- Fix: add ON CONFLICT (aggregate_id, event_type) DO NOTHING to fn_finance_outbox_emit
-- itself. The SECURITY DEFINER helper owns the idempotency guarantee; the caller's
-- visibility of existing rows is irrelevant.
--
-- All other behavior unchanged: envelope validation, casino context derivation, etc.

CREATE OR REPLACE FUNCTION public.fn_finance_outbox_emit(
  p_event_id     uuid,
  p_event_type   text,
  p_fact_class   text,
  p_origin_label text,
  p_table_id     uuid,
  p_player_id    uuid,
  p_aggregate_id uuid,
  p_payload      jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_casino_id uuid;
BEGIN
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION
      'fn_finance_outbox_emit: casino context not established. '
      'Call set_rls_context_from_staff() before emitting.';
  END IF;

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: event_id is required';
  END IF;

  IF p_event_type IS NULL OR p_event_type = '' THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: event_type is required';
  END IF;

  IF p_fact_class IS NULL OR p_fact_class NOT IN ('ledger', 'operational') THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: fact_class must be ledger or operational, got: %',
      COALESCE(p_fact_class, 'NULL');
  END IF;

  IF p_origin_label IS NULL OR p_origin_label NOT IN ('actual', 'estimated') THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: origin_label must be actual or estimated, got: %',
      COALESCE(p_origin_label, 'NULL');
  END IF;

  IF p_table_id IS NULL THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: table_id is required';
  END IF;

  IF p_aggregate_id IS NULL THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: aggregate_id is required';
  END IF;

  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: payload is required';
  END IF;

  INSERT INTO public.finance_outbox (
    event_id, event_type, fact_class, origin_label,
    casino_id, table_id, player_id, aggregate_id, payload, created_at
  ) VALUES (
    p_event_id, p_event_type, p_fact_class, p_origin_label,
    v_casino_id, p_table_id, p_player_id, p_aggregate_id, p_payload,
    NOW()
  )
  ON CONFLICT (aggregate_id, event_type) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.fn_finance_outbox_emit(
  uuid, text, text, text, uuid, uuid, uuid, jsonb
) IS
  'PRD-083 WS4 / PRD-084 fix: governed SECURITY DEFINER outbox insertion boundary (Option A). '
  'Infrastructure-only: deterministic envelope validation + idempotent finance_outbox INSERT. '
  'ON CONFLICT (aggregate_id, event_type) DO NOTHING ensures safe retry even when the '
  'calling RPC (SECURITY INVOKER) cannot SELECT from finance_outbox to check existence. '
  'casino_id derived from app.casino_id session GUC — no caller-supplied casino_id.';

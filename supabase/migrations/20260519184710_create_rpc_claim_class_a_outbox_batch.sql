-- Migration: 20260519184710_create_rpc_claim_class_a_outbox_batch.sql
-- Purpose: Ledger-only relay claim primitive for Phase 2.3 consumer.
--   Claims only fact_class='ledger' rows with processed_at IS NULL.
--   Does NOT modify rpc_claim_outbox_batch (which Phase 2.4 will use for operational events).
--   PRD-087 WS1B_GATE_B_DB Gate B.
--
-- Design mirrors rpc_claim_outbox_batch (20260511134531) with added fact_class filter.
-- CTE claims rows with SKIP LOCKED, then marks delivery_attempts + last_attempted_at
-- in the same statement (in-flight tracking for observability and dead-letter logic).
--
-- Phase 2.3 relay worker MUST call this RPC — not rpc_claim_outbox_batch.
-- TypeScript-side fact_class guard in runConsumer is a defensive backstop only.
-- Primary ledger containment is here at claim time.
--
-- Ordering: event_id (UUIDv7, time-sortable) provides global relay + replay ordering.

CREATE OR REPLACE FUNCTION public.rpc_claim_class_a_outbox_batch(
  p_batch_size INTEGER DEFAULT 10
)
RETURNS SETOF public.finance_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    WITH claimed AS (
      SELECT fo.event_id
      FROM   public.finance_outbox fo
      WHERE  fo.fact_class    = 'ledger'
        AND  fo.processed_at  IS NULL
      ORDER BY fo.event_id
      LIMIT p_batch_size
      FOR UPDATE SKIP LOCKED
    ),
    marked AS (
      UPDATE public.finance_outbox fo
      SET last_attempted_at = NOW(),
          delivery_attempts  = fo.delivery_attempts + 1
      FROM claimed
      WHERE fo.event_id = claimed.event_id
      RETURNING fo.*
    )
    SELECT * FROM marked;
END;
$$;

REVOKE ALL    ON FUNCTION public.rpc_claim_class_a_outbox_batch(INTEGER) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_claim_class_a_outbox_batch(INTEGER) TO service_role;

COMMENT ON FUNCTION public.rpc_claim_class_a_outbox_batch(INTEGER) IS
  'Ledger-only relay claim (Phase 2.3). Claims fact_class=''ledger'' rows with '
  'processed_at IS NULL using FOR UPDATE SKIP LOCKED + marks delivery_attempts. '
  'Phase 2.3 relay worker MUST call this — not rpc_claim_outbox_batch. '
  'SECURITY DEFINER, service_role EXECUTE only. PRD-087 WS1B Gate B.';

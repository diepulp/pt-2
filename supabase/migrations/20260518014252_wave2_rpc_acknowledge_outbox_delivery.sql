-- Migration: 20260518014252_wave2_rpc_acknowledge_outbox_delivery.sql
-- Review markers: ADR-054, ADR-056
-- Purpose: Terminal delivery-state primitive for the transactional outbox relay.
--
-- Context (ADR-054 / ADR-056):
--   rpc_claim_outbox_batch already writes last_attempted_at and delivery_attempts
--   at claim time (in-flight tracking). This function writes the terminal outcome:
--     • success → processed_at = NOW(), last_error = NULL
--     • failure → last_error = LEFT(p_error_detail, 2000)
--   Rows stay unprocessed (processed_at IS NULL) on failure and are retried on the
--   next relay cycle; the outbox design assumes at-least-once delivery.
--
-- Why this RPC exists:
--   finance_outbox is a Category A table (ADR-034, ADR-054 R3). All writes must go
--   through SECURITY DEFINER primitives. The relay route previously used direct
--   PostgREST DML (.from('finance_outbox').update(...)), which the linter (Wave 2
--   linter update) correctly flagged as an ADR-054 violation. This function is the
--   authorized write path for delivery acknowledgement.
--
-- Idempotency:
--   WHERE processed_at IS NULL guard on both branches prevents double-processing.
--   On failure, recording the same last_error twice is harmless.
--
-- Authorized callers:
--   service_role only (relay worker). authenticated role must never call this.

CREATE OR REPLACE FUNCTION public.rpc_acknowledge_outbox_delivery(
  p_event_id     UUID,
  p_success      BOOLEAN,
  p_error_detail TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_success THEN
    -- Mark as delivered. Clear last_error so prior transient failures don't persist
    -- on a row that eventually succeeded. WHERE guard makes the call idempotent.
    UPDATE public.finance_outbox
    SET    processed_at = NOW(),
           last_error   = NULL
    WHERE  event_id     = p_event_id
      AND  processed_at IS NULL;
  ELSE
    -- Record delivery failure. Row stays processed_at IS NULL for relay retry.
    -- LEFT(..., 2000) matches the VARCHAR(2000) column constraint.
    UPDATE public.finance_outbox
    SET    last_error = LEFT(COALESCE(p_error_detail, 'unknown error'), 2000)
    WHERE  event_id   = p_event_id
      AND  processed_at IS NULL;
  END IF;
END;
$$;

REVOKE ALL    ON FUNCTION public.rpc_acknowledge_outbox_delivery(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_acknowledge_outbox_delivery(UUID, BOOLEAN, TEXT) TO service_role;

COMMENT ON FUNCTION public.rpc_acknowledge_outbox_delivery(UUID, BOOLEAN, TEXT) IS
  'Terminal delivery-state write for the transactional outbox relay (ADR-054 R3, ADR-056). '
  'p_success=true: sets processed_at=NOW(), clears last_error. '
  'p_success=false: records last_error (LEFT to 2000 chars); row remains unprocessed for retry. '
  'WHERE processed_at IS NULL guard ensures idempotency. '
  'GRANT service_role only — authenticated role must never call this.';

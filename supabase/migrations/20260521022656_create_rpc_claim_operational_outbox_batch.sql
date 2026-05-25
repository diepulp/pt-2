-- Migration: 20260521022656_create_rpc_claim_operational_outbox_batch.sql
-- Purpose: Operational relay claim primitive for Phase 2.4 consumer.
--   Claims fact_class='operational' rows with event_type IN ('grind.observed',
--   'fill.recorded', 'credit.recorded') AND processed_at IS NULL
--   AND delivery_attempts < 5.
--   Poison-row containment: rows with delivery_attempts >= 5 excluded from claim;
--   reported as operationalDeadLetter by observability without a new table.
--   PRD-088 WS1_DB.
--
-- Design mirrors rpc_claim_class_a_outbox_batch (20260519184710) with:
--   - fact_class='operational' + event_type IN (...) filters
--   - delivery_attempts < 5 poison-row guard
-- Ordering: event_id (UUIDv7, time-sortable) provides global relay + replay ordering.
-- Default batch size 25 (<= Class A BATCH_SIZE 50 per EXEC-088 acceptance criteria).

CREATE OR REPLACE FUNCTION public.rpc_claim_operational_outbox_batch(
  p_batch_size INTEGER DEFAULT 25
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
      WHERE  fo.fact_class         = 'operational'
        AND  fo.event_type         IN ('grind.observed', 'fill.recorded', 'credit.recorded')
        AND  fo.processed_at       IS NULL
        AND  fo.delivery_attempts  < 5
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

REVOKE ALL    ON FUNCTION public.rpc_claim_operational_outbox_batch(INTEGER) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_claim_operational_outbox_batch(INTEGER) TO service_role;

COMMENT ON FUNCTION public.rpc_claim_operational_outbox_batch(INTEGER) IS
  'Operational relay claim (Phase 2.4). Claims fact_class=''operational'' rows with '
  'event_type IN (''grind.observed'',''fill.recorded'',''credit.recorded''), '
  'processed_at IS NULL, delivery_attempts < 5 using FOR UPDATE SKIP LOCKED + marks delivery_attempts. '
  'Rows with delivery_attempts >= 5 are excluded (operationalDeadLetter — no new table). '
  'SECURITY DEFINER, service_role EXECUTE only. PRD-088 WS1_DB.';

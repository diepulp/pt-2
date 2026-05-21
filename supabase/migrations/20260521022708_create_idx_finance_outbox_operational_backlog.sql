-- Migration: 20260521022708_create_idx_finance_outbox_operational_backlog.sql
-- Purpose: Partial index on finance_outbox for operational backlog scans.
--   Supports rpc_claim_operational_outbox_batch (claim ordering),
--   observability backlog/dead-letter counts, and
--   getShiftOperationalCompleteness table-scoped backlog check.
--   PRD-088 WS1_DB.

CREATE INDEX IF NOT EXISTS idx_finance_outbox_operational_backlog
  ON public.finance_outbox (casino_id, gaming_day, table_id, event_id)
  WHERE processed_at IS NULL
    AND fact_class   = 'operational'
    AND event_type   IN ('grind.observed', 'fill.recorded', 'credit.recorded');

COMMENT ON INDEX public.idx_finance_outbox_operational_backlog IS
  'Partial index for operational backlog scan: processed_at IS NULL, '
  'fact_class=operational, event_type IN (grind.observed, fill.recorded, credit.recorded). '
  'Used by rpc_claim_operational_outbox_batch, observability, and completeness derivation. '
  'PRD-088 WS1_DB.';

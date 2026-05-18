-- Migration: 20260511134300_wave2_processed_messages.sql
-- Purpose: Consumer idempotency store for Wave 2 finance_outbox relay.
-- Single-consumer assumption: message_id is a global PK, not scoped per consumer.
-- Multi-consumer fan-out requires schema evolution (separate FIB + ADR).
-- Inserts are performed exclusively via rpc_commit_consumer_receipt (SECURITY DEFINER),
-- which runs the processed_messages INSERT and consumer side effect in one PG transaction.

CREATE TABLE public.processed_messages (
  message_id   UUID        NOT NULL PRIMARY KEY,
  -- Matches finance_outbox.event_id. Global uniqueness enforces single-consumer semantics.

  casino_id    UUID        NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  -- casino_id NOT NULL per SRM contract policy. Cascade delete is safe: outbox rows
  -- are also casino-scoped; a casino deletion is a full data removal.

  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Record time of receipt commit, not relay claim time.
);

COMMENT ON TABLE public.processed_messages IS
  'Consumer idempotency store for Wave 2 finance_outbox relay. Single-consumer assumption: message_id is global, not per-consumer. Multi-consumer fan-out requires schema evolution. Rows inserted exclusively via rpc_commit_consumer_receipt SECURITY DEFINER (atomicity boundary for I3).';

ALTER TABLE public.processed_messages ENABLE ROW LEVEL SECURITY;
-- No authenticated policies. Direct INSERT/SELECT denied to authenticated role by default.
-- All access via rpc_commit_consumer_receipt (service_role, SECURITY DEFINER).

GRANT SELECT, INSERT ON public.processed_messages TO service_role;

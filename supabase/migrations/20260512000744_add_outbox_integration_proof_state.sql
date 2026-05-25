-- Migration: 20260512000744_add_outbox_integration_proof_state.sql
-- PRD-082 VALIDATION-ONLY HARNESS — Wave 2 Integration Proof
--
-- This entire migration is validation infrastructure. Both the table and the
-- rpc_commit_consumer_receipt amendment MUST be removed (or replaced by a
-- teardown migration) before any Phase 2.1 producer-expansion artifact is merged.
--
-- Teardown artifact:
--   docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/TEARDOWN-ARTIFACT-PRD-082.md
-- Required follow-up migration (before Phase 2.1 authorization):
--   supabase/migrations/<timestamp>_remove_prd082_harness_receipt_proof_state.sql
--   Must: restore rpc_commit_consumer_receipt to non-harness form + DROP TABLE outbox_integration_proof_state.
--
-- Architecture acceptance: DEC-005 (Option A accepted with conditions). See EXEC-082 §Architecture Decision.

-- ==========================================================================
-- Part 1: outbox_integration_proof_state — harness-only proof-state capture table
-- ==========================================================================
-- Purpose: Captures a copy of the finance_outbox envelope fields inside the
-- rpc_commit_consumer_receipt transaction for I3 idempotency and I4 replayability proofs.
--
-- NOT a projection store. NOT a product read model. NOT a reusable consumer substrate.
-- outbox_integration_proof_state MUST NOT be consumed by application code outside PRD-082
-- validation. (DEC-002)
--
-- Evidence boundary (DEC-003): proof-state rows are valid I3/I4 evidence ONLY because they
-- are written by the rpc_commit_consumer_receipt SQL transaction. TypeScript-side writes
-- are not admissible evidence for this gate.

CREATE TABLE public.outbox_integration_proof_state (
  seq           BIGSERIAL     NOT NULL,
  event_id      UUID          NOT NULL,
  event_type    TEXT          NOT NULL,
  fact_class    TEXT          NOT NULL,
  origin_label  TEXT          NOT NULL,
  casino_id     UUID          NOT NULL,
  table_id      UUID          NOT NULL,
  player_id     UUID          NULL,
  aggregate_id  UUID          NOT NULL,
  payload       JSONB         NOT NULL,
  consumed_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- consumed_at is intentionally excluded from the I4 fingerprint query.
  -- Wall-clock timestamps diverge between live and replay runs.
  -- The I4 fingerprint sorts by event_id (UUIDv7 = monotonic insertion order) only.

  CONSTRAINT outbox_integration_proof_state_pkey          PRIMARY KEY (seq),
  CONSTRAINT outbox_integration_proof_state_event_id_key  UNIQUE (event_id)
  -- UNIQUE on event_id: one proof-state row per logical consumer commit.
  -- If rpc_commit_consumer_receipt returns 'duplicate', proof-state was already captured
  -- by the prior commit; the ON CONFLICT DO NOTHING in the harness body is a no-op.
);

COMMENT ON TABLE public.outbox_integration_proof_state IS
  'PRD-082 VALIDATION-ONLY HARNESS. Proof-state capture for I3/I4 invariant proofs. '
  'Rows inserted exclusively by rpc_commit_consumer_receipt harness amendment (DEC-003). '
  'Must be removed or disabled before Phase 2.1 authorization. '
  'See TEARDOWN-ARTIFACT-PRD-082.md.';

COMMENT ON COLUMN public.outbox_integration_proof_state.consumed_at IS
  'Wall-clock time of receipt. Excluded from I4 fingerprint — use event_id ordering only.';

-- RLS: enabled; no policies; service_role access only.
-- Proof scripts use service_role for SELECT and TRUNCATE.
-- Authenticated role must never access this table.
ALTER TABLE public.outbox_integration_proof_state ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, TRUNCATE ON public.outbox_integration_proof_state TO service_role;

-- ==========================================================================
-- Part 2: rpc_commit_consumer_receipt — harness-only amendment
-- ==========================================================================
-- PRD-082 VALIDATION-ONLY HARNESS: amends the receipt boundary to write proof-state
-- inside the same PostgreSQL transaction as the processed_messages INSERT.
--
-- DEC-003: proof-state evidence is valid ONLY when inserted by this SQL transaction.
-- TypeScript-side proof-state writes are not admissible evidence for I3/I4.
--
-- This amendment MUST be replaced by the non-harness form before Phase 2.1 authorization.
-- See TEARDOWN-ARTIFACT-PRD-082.md.
--
-- All existing semantics preserved:
--   - Same function signature (p_message_id UUID, p_casino_id UUID)
--   - Same return values ('processed' | 'duplicate')
--   - Same SECURITY DEFINER + SET search_path = ''
--   - Same processed_messages INSERT / ON CONFLICT DO NOTHING / duplicate guard
--   - Wave 2 consumer side effect placeholder retained

CREATE OR REPLACE FUNCTION public.rpc_commit_consumer_receipt(
  p_message_id UUID,
  p_casino_id  UUID
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted UUID;
BEGIN
  -- Atomic deduplication gate (unchanged from non-harness form)
  INSERT INTO public.processed_messages (message_id, casino_id)
  VALUES (p_message_id, p_casino_id)
  ON CONFLICT DO NOTHING
  RETURNING message_id INTO v_inserted;

  IF v_inserted IS NULL THEN
    -- Prior receipt committed atomically (INSERT + side effect in one prior transaction).
    -- 'duplicate' = safe durable prior commit — NOT a partial prior attempt.
    -- Relay may set processed_at on the finance_outbox row.
    RETURN 'duplicate';
  END IF;

  -- -----------------------------------------------------------------------
  -- PRD-082 VALIDATION-ONLY HARNESS: proof-state capture
  -- Runs in the SAME transaction as the processed_messages INSERT above.
  -- This INSERT is the DEC-003 evidence boundary — TypeScript-side writes
  -- are not admissible for I3/I4 proofs.
  -- REMOVE THIS BLOCK before Phase 2.1 authorization (TEARDOWN-ARTIFACT-PRD-082.md).
  -- -----------------------------------------------------------------------
  INSERT INTO public.outbox_integration_proof_state (
    event_id,
    event_type,
    fact_class,
    origin_label,
    casino_id,
    table_id,
    player_id,
    aggregate_id,
    payload
  )
  SELECT
    fo.event_id,
    fo.event_type,
    fo.fact_class,
    fo.origin_label,
    fo.casino_id,
    fo.table_id,
    fo.player_id,
    fo.aggregate_id,
    fo.payload
  FROM public.finance_outbox fo
  WHERE fo.event_id = p_message_id
  ON CONFLICT (event_id) DO NOTHING;
  -- END PRD-082 VALIDATION-ONLY HARNESS: proof-state capture
  -- -----------------------------------------------------------------------

  -- -----------------------------------------------------------------------
  -- Wave 2: consumer side effect placeholder (no projection consumer yet).
  -- Future waves: replace this comment with projection SQL.
  -- All side effect SQL runs in this same transaction — no two-phase commit.
  -- -----------------------------------------------------------------------

  RETURN 'processed';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_commit_consumer_receipt(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_commit_consumer_receipt(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.rpc_commit_consumer_receipt(UUID, UUID) IS
  'PRD-082 HARNESS AMENDMENT: atomic consumer receipt gate (I3 boundary) with proof-state capture. '
  'processed_messages INSERT + outbox_integration_proof_state INSERT + Wave 2 side effect placeholder '
  'execute in one PG transaction. Returns ''processed'' on new message_id, ''duplicate'' on prior commit. '
  'Proof-state INSERT is DEC-003 evidence boundary — TypeScript-side writes are not admissible. '
  'TEARDOWN REQUIRED before Phase 2.1 authorization: see TEARDOWN-ARTIFACT-PRD-082.md.';

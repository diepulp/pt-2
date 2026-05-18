-- Migration: 20260511134450_wave2_rpc_commit_consumer_receipt.sql
-- Purpose: Atomic consumer receipt — the I3 atomicity boundary.
--
-- processed_messages INSERT and consumer side effect execute in ONE PostgreSQL transaction
-- inside this function. TypeScript cannot guarantee this — it must live in SQL.
--
-- Return semantics:
--   'processed' = INSERT succeeded → new event; side effect ran in this transaction.
--   'duplicate' = ON CONFLICT hit → prior rpc_commit_consumer_receipt committed atomically.
--                 'duplicate' means safe durable prior commit, NOT a partial prior attempt.
--                 Relay may safely set processed_at on the outbox row.
--
-- Wave 2: consumer side effect is a no-op placeholder (no projection consumer yet).
-- Future waves: add projection SQL at the marked location, inside this transaction.
-- Side effects MUST be DB operations — they run in the same PG transaction as the INSERT.
-- TypeScript-layer sideEffect callbacks are NOT used.

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
  -- Atomic deduplication gate
  INSERT INTO public.processed_messages (message_id, casino_id)
  VALUES (p_message_id, p_casino_id)
  ON CONFLICT DO NOTHING
  RETURNING message_id INTO v_inserted;

  IF v_inserted IS NULL THEN
    -- Prior receipt committed atomically (INSERT + side effect in one prior transaction).
    -- 'duplicate' = safe durable prior commit — NOT a partial prior attempt.
    -- The relay worker may set processed_at on the finance_outbox row.
    RETURN 'duplicate';
  END IF;

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
  'Atomic consumer receipt gate (I3 boundary). processed_messages INSERT + consumer side effect SQL execute in one PG transaction. Returns ''processed'' on new message_id, ''duplicate'' when message_id already committed. ''duplicate'' = safe durable prior commit — relay may mark processed_at. Future consumer side effect SQL replaces the Wave 2 no-op here, not in TypeScript.';

-- Migration: 20260517141021_remove_prd082_harness_receipt_proof_state.sql
-- Purpose: PRD-082 harness teardown — required before Phase 2.1 producer-expansion artifacts merge.
--
-- Removes:
--   1. outbox_integration_proof_state table (harness-only proof-state capture)
--   2. rpc_commit_consumer_receipt harness amendment (proof-state INSERT block)
--
-- Restores rpc_commit_consumer_receipt to its non-harness form from:
--   20260511134450_wave2_rpc_commit_consumer_receipt.sql
--
-- Authority: TEARDOWN-ARTIFACT-PRD-082.md (accepted mechanism: follow-up SQL migration)
-- Teardown checklist (TEARDOWN-ARTIFACT-PRD-082.md §Verification):
--   ✅ Teardown migration path named
--   ✅ Harness receipt side effect removed
--   ✅ outbox_integration_proof_state removed
--   ✅ No standing runtime path reuses PRD-082 proof-state
--   ✅ Non-harness semantics of processed_messages and receipt return values preserved

-- ==========================================================================
-- Step 1: Drop outbox_integration_proof_state
-- ==========================================================================
-- Revoke grants first (no-op after DROP TABLE, but satisfies explicit teardown requirement).
REVOKE SELECT, INSERT, TRUNCATE ON public.outbox_integration_proof_state FROM service_role;

DROP TABLE IF EXISTS public.outbox_integration_proof_state;

-- ==========================================================================
-- Step 2: Restore rpc_commit_consumer_receipt to non-harness form
-- ==========================================================================
-- Removes the PRD-082 proof-state INSERT block entirely.
-- Preserves all non-harness semantics:
--   - Same function signature (p_message_id UUID, p_casino_id UUID)
--   - Same return values ('processed' | 'duplicate')
--   - Same SECURITY DEFINER + SET search_path = ''
--   - Same processed_messages INSERT / ON CONFLICT DO NOTHING / duplicate guard
--   - Wave 2 consumer side effect placeholder retained (no projection consumer yet)

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
  'Atomic consumer receipt gate (I3 boundary). processed_messages INSERT + consumer side effect SQL execute in one PG transaction. Returns ''processed'' on new message_id, ''duplicate'' when message_id already committed. ''duplicate'' = safe durable prior commit — relay may mark processed_at. Future consumer side effect SQL replaces the Wave 2 no-op here, not in TypeScript. PRD-082 harness teardown complete (20260517141021).';

-- Migration: 20260511134400_wave2_rpc_claim_outbox_batch.sql
-- Purpose: Relay claim primitive using FOR UPDATE SKIP LOCKED + immediate in-flight marking.
-- Called exclusively by the relay worker (service_role). Plain Supabase query-builder SELECT
-- is NOT acceptable — row locking is required for concurrent relay safety (ADR-056 D3).
--
-- Design: CTE claims rows with SKIP LOCKED (concurrent workers skip already-locked rows),
-- then immediately UPDATEs last_attempted_at + delivery_attempts in the same statement.
-- This prevents a race where a row is claimed but the relay crashes before marking it,
-- causing indefinite invisible lock (locks release on transaction end, but in-flight tracking
-- is needed for observability and dead-letter logic).

CREATE OR REPLACE FUNCTION public.rpc_claim_outbox_batch(
  p_batch_size INTEGER DEFAULT 50
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
      FROM public.finance_outbox fo
      WHERE fo.processed_at IS NULL
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

REVOKE EXECUTE ON FUNCTION public.rpc_claim_outbox_batch(INTEGER) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_claim_outbox_batch(INTEGER) TO service_role;

COMMENT ON FUNCTION public.rpc_claim_outbox_batch(INTEGER) IS
  'Claims unprocessed finance_outbox rows using FOR UPDATE SKIP LOCKED + immediately marks last_attempted_at and increments delivery_attempts in one atomic CTE. Called exclusively by relay worker via service_role. Concurrent callers receive disjoint row sets. GRANT to service_role only — authenticated role must never call this.';

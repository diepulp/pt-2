-- Migration: 20260521142441_create_rpc_cleanup_outbox_processed.sql
-- Purpose: Wave 2 Phase 2.5 retention primitive (PRD-089 WS2_RETENTION).
--   Bounds finance_outbox growth via a 7-day retention contract on
--   processed rows, exposed through a cron-driven SECURITY DEFINER RPC.
--
-- Retention contract:
--   * Targets rows with processed_at IS NOT NULL AND processed_at < now() - INTERVAL '7 days'.
--   * Unprocessed rows are NEVER deleted (replay continues to draw from
--     the unprocessed band; cleanup is the observer of the consumer, not its peer).
--   * Caller-driven cap p_max_rows (DEFAULT 1000, range 1..1000) gives the
--     cron-driven cleanup a bounded blast radius and lets operators run
--     larger cleanups manually only when explicitly requested.
--
-- Concurrency posture:
--   * SELECT ... FOR UPDATE SKIP LOCKED inside the doomed CTE.
--     The relay claim path (rpc_claim_class_a_outbox_batch /
--     rpc_claim_operational_outbox_batch) already uses SKIP LOCKED — neither
--     blocks the other; the cleanup only deletes already-processed rows the
--     relay no longer claims, so collision is structurally rare.
--
-- Security posture:
--   * SECURITY DEFINER, SET search_path = '' (ADR-018, ADR-024).
--   * No casino context derivation — finance_outbox is a global propagation
--     substrate and retention applies uniformly across casinos. The RPC does
--     NOT touch casino-scoped tables, so no set_rls_context_from_staff() call.
--   * EXECUTE granted only to service_role (cron invocation via
--     /api/internal/outbox-cleanup); REVOKEd from anon and authenticated.
--
-- Supporting index posture:
--   * idx_finance_outbox_processed_retention is a partial index on
--     (processed_at, event_id) WHERE processed_at IS NOT NULL.
--   * Column tuple matches the CTE ORDER BY (processed_at) + DELETE join (event_id).
--   * Predicate matches the CTE WHERE clause exactly.
--   * Plain CREATE INDEX (no CONCURRENTLY) — Supabase migrations run inside
--     a transaction block and CONCURRENTLY cannot. Wave 2 finance_outbox row
--     count is currently low (zero-producer at table birth, with active
--     retention bounded to 7 days going forward) and Phase 2.5 ships before
--     producer wiring (PWB-001/PWB-002 deferred), so the brief table lock at
--     index build is acceptable. Pre-Wave-3 producer wiring should re-evaluate
--     if table grows past a few million rows pre-retention.

-- ─────────────────────────────────────────────────────────────────────────
-- Function
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_cleanup_outbox_processed(
  p_max_rows INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  -- p_max_rows validation: reject NULL / out-of-range BEFORE any row lock.
  -- Distinct messages so unit tests can assert which guard fired.
  IF p_max_rows IS NULL THEN
    RAISE EXCEPTION 'p_max_rows must not be NULL'
      USING ERRCODE = '22023';  -- invalid_parameter_value
  END IF;

  IF p_max_rows < 1 THEN
    RAISE EXCEPTION 'p_max_rows must be >= 1 (got %)', p_max_rows
      USING ERRCODE = '22023';
  END IF;

  IF p_max_rows > 1000 THEN
    RAISE EXCEPTION 'p_max_rows must be <= 1000 (got %)', p_max_rows
      USING ERRCODE = '22023';
  END IF;

  -- CTE-based DELETE: Postgres DELETE has no top-level LIMIT clause,
  -- so the cap is enforced inside the doomed CTE selection.
  WITH doomed AS (
    SELECT fo.event_id
    FROM   public.finance_outbox fo
    WHERE  fo.processed_at IS NOT NULL
      AND  fo.processed_at < (now() - INTERVAL '7 days')
    ORDER BY fo.processed_at
    LIMIT p_max_rows
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.finance_outbox f
  USING doomed
  WHERE f.event_id = doomed.event_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL    ON FUNCTION public.rpc_cleanup_outbox_processed(INTEGER) FROM PUBLIC;
REVOKE ALL    ON FUNCTION public.rpc_cleanup_outbox_processed(INTEGER) FROM anon;
REVOKE ALL    ON FUNCTION public.rpc_cleanup_outbox_processed(INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_cleanup_outbox_processed(INTEGER) TO service_role;

COMMENT ON FUNCTION public.rpc_cleanup_outbox_processed(INTEGER) IS
  'Wave 2 Phase 2.5 retention primitive (PRD-089 WS2_RETENTION). Deletes up to '
  'p_max_rows finance_outbox rows where processed_at IS NOT NULL AND processed_at '
  '< now() - INTERVAL ''7 days''. SECURITY DEFINER, service_role EXECUTE only. '
  'Validates p_max_rows in [1,1000]. CTE doomed-set with FOR UPDATE SKIP LOCKED. '
  'Returns deleted row count.';

-- ─────────────────────────────────────────────────────────────────────────
-- Supporting partial index
-- ─────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_finance_outbox_processed_retention
  ON public.finance_outbox (processed_at, event_id)
  WHERE processed_at IS NOT NULL;

COMMENT ON INDEX public.idx_finance_outbox_processed_retention IS
  'Wave 2 Phase 2.5 retention index (PRD-089 WS2_RETENTION). Supports the '
  'doomed-CTE scan inside rpc_cleanup_outbox_processed: column tuple '
  '(processed_at, event_id) matches the ORDER BY + DELETE join; partial '
  'predicate (processed_at IS NOT NULL) matches the CTE WHERE clause.';

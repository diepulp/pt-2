-- Fix: rpc_get_outbox_relay_health — explicit DOUBLE PRECISION cast on EXTRACT
-- EXTRACT(EPOCH FROM interval) returns numeric on PG <=14; the function declared
-- the column as DOUBLE PRECISION causing a 42804 type mismatch at runtime.
-- CREATE OR REPLACE preserves existing grants — no REVOKE/GRANT needed.

CREATE OR REPLACE FUNCTION public.rpc_get_outbox_relay_health(
  p_casino_id UUID
)
RETURNS TABLE (
  pending_count              BIGINT,
  oldest_pending_age_seconds DOUBLE PRECISION,
  retry_row_count            BIGINT,
  poison_candidate_count     BIGINT,
  processed_count_24h        BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)         FILTER (WHERE fo.processed_at IS NULL)::BIGINT,

    EXTRACT(EPOCH FROM (
      NOW() - MIN(fo.created_at) FILTER (WHERE fo.processed_at IS NULL)
    ))::DOUBLE PRECISION,

    COUNT(*)         FILTER (WHERE fo.delivery_attempts >= 1
                               AND fo.processed_at IS NULL)::BIGINT,

    COUNT(*)         FILTER (WHERE fo.delivery_attempts >= 3
                               AND fo.processed_at IS NULL)::BIGINT,

    COUNT(*)         FILTER (WHERE fo.processed_at IS NOT NULL
                               AND fo.processed_at > NOW() - INTERVAL '24 hours')::BIGINT

  FROM public.finance_outbox fo
  WHERE fo.casino_id = p_casino_id;
END;
$$;

-- Re-assert grant: CREATE OR REPLACE preserves existing privileges, but the
-- pre-commit RPC lint hook requires an explicit GRANT to recognise this as a
-- service_role-only function (context injection exempt). Idempotent.
GRANT EXECUTE ON FUNCTION public.rpc_get_outbox_relay_health(UUID) TO service_role;

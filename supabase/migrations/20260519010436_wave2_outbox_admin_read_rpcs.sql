-- Wave 2 Phase 2.3a — Operational Outbox Observability (PRD-086)
-- Adds two read-only SECURITY DEFINER RPCs that expose finance_outbox relay state
-- to the internal admin surface. No writes to any table.
-- Both RPCs: service_role ONLY — no authenticated/anon/public access.

BEGIN;

-- ===========================================================================
-- Pre-state assertions
-- ===========================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_attribute a
    JOIN   pg_catalog.pg_class c     ON c.oid = a.attrelid
    JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE  n.nspname = 'public'
      AND  c.relname = 'finance_outbox'
      AND  a.attname = 'delivery_attempts'
      AND  NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION
      'PRE-STATE FAIL: finance_outbox.delivery_attempts not found. Apply Wave 2 transform migration first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_attribute a
    JOIN   pg_catalog.pg_class c     ON c.oid = a.attrelid
    JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE  n.nspname = 'public'
      AND  c.relname = 'finance_outbox'
      AND  a.attname = 'last_error'
      AND  NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION
      'PRE-STATE FAIL: finance_outbox.last_error not found. Apply Wave 2 transform migration first.';
  END IF;
END $$;

-- ===========================================================================
-- RPC 1: rpc_get_outbox_relay_health
-- Returns a single health-summary row for the given casino's finance_outbox.
-- Read-only: no DML.
-- ===========================================================================
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

    -- NULL when no pending rows (MIN of empty set is NULL; EXTRACT of NULL is NULL)
    -- Explicit cast: EXTRACT returns numeric on PG <=14; declared return is DOUBLE PRECISION.
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

REVOKE ALL ON FUNCTION public.rpc_get_outbox_relay_health(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_outbox_relay_health(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_get_outbox_relay_health(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_get_outbox_relay_health(UUID) TO service_role;

-- ===========================================================================
-- RPC 2: rpc_get_outbox_event_page
-- Returns up to 100 finance_outbox rows with full envelope + relay lifecycle.
-- Supports filtering by event_type, status, and exact-match UUID search.
-- Status values — non-overlapping:
--   'pending'   → processed_at IS NULL AND delivery_attempts < 3
--   'processed' → processed_at IS NOT NULL
--   'failing'   → processed_at IS NULL AND delivery_attempts >= 1 AND < 3
--   'poison'    → processed_at IS NULL AND delivery_attempts >= 3
-- Read-only: no DML.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.rpc_get_outbox_event_page(
  p_casino_id  UUID,
  p_event_type TEXT    DEFAULT NULL,
  p_status     TEXT    DEFAULT 'all',
  p_search_id  UUID    DEFAULT NULL,
  p_limit      INTEGER DEFAULT 100
)
RETURNS TABLE (
  event_id          UUID,
  event_type        TEXT,
  fact_class        TEXT,
  origin_label      TEXT,
  casino_id         UUID,
  table_id          UUID,
  player_id         UUID,
  aggregate_id      UUID,
  payload           JSONB,
  created_at        TIMESTAMPTZ,
  processed_at      TIMESTAMPTZ,
  delivery_attempts INTEGER,
  last_attempted_at TIMESTAMPTZ,
  last_error        VARCHAR(2000)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Hard cap: min 1, max 100 regardless of caller input.
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 100), 100));
BEGIN
  -- SQL-level guard — second line of defence after API-layer 400 validation.
  IF p_status NOT IN ('all', 'pending', 'processed', 'failing', 'poison') THEN
    RAISE EXCEPTION
      'Invalid p_status value: %. Must be one of: all, pending, processed, failing, poison',
      p_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN QUERY
  SELECT
    fo.event_id,
    fo.event_type,
    fo.fact_class,
    fo.origin_label,
    fo.casino_id,
    fo.table_id,
    fo.player_id,
    fo.aggregate_id,
    fo.payload,
    fo.created_at,
    fo.processed_at,
    fo.delivery_attempts,
    fo.last_attempted_at,
    fo.last_error
  FROM public.finance_outbox fo
  WHERE fo.casino_id = p_casino_id

    -- Event-type filter (NULL = all types)
    AND (p_event_type IS NULL OR fo.event_type = p_event_type)

    -- Status filter — failing and poison are disjoint by design
    AND (
      p_status = 'all'
      OR (p_status = 'pending'
            AND fo.processed_at IS NULL
            AND fo.delivery_attempts < 3)
      OR (p_status = 'processed'
            AND fo.processed_at IS NOT NULL)
      OR (p_status = 'failing'
            AND fo.processed_at IS NULL
            AND fo.delivery_attempts >= 1
            AND fo.delivery_attempts <  3)
      OR (p_status = 'poison'
            AND fo.processed_at IS NULL
            AND fo.delivery_attempts >= 3)
    )

    -- UUID search: event_id, aggregate_id, or table_id exact match
    AND (
      p_search_id IS NULL
      OR fo.event_id      = p_search_id
      OR fo.aggregate_id  = p_search_id
      OR fo.table_id      = p_search_id
    )

  ORDER BY fo.created_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_outbox_event_page(UUID, TEXT, TEXT, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_outbox_event_page(UUID, TEXT, TEXT, UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_get_outbox_event_page(UUID, TEXT, TEXT, UUID, INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_get_outbox_event_page(UUID, TEXT, TEXT, UUID, INTEGER) TO service_role;

COMMIT;

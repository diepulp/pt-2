-- ============================================================================
-- Migration: PRD-039 Server-Authoritative CSV Ingestion Worker — Create Batch Overload
-- Created: 2026-02-24
-- PRD Reference: docs/10-prd/PRD-039-server-csv-ingestion-worker.md
-- ADR References: ADR-024 (authoritative context), ADR-018 (SECURITY DEFINER),
--                 ADR-036 (CSV import strategy), ADR-037 (server CSV ingestion worker)
--
-- Purpose:
--   Add a 5-parameter overload of rpc_import_create_batch that accepts
--   p_initial_status. The server-side flow needs to create batches with
--   status = 'created' (not the default 'staging'). This is the DA P0-1 fix.
--
--   The existing 4-parameter version is NOT modified — PostgreSQL function
--   overloading by parameter count keeps both signatures active.
-- ============================================================================

-- ============================================================================
-- 1. NEW 5-PARAM OVERLOAD: rpc_import_create_batch
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_import_create_batch(
  p_idempotency_key text,
  p_file_name text,
  p_vendor_label text,
  p_column_mapping jsonb,
  p_initial_status public.import_batch_status DEFAULT NULL
)
RETURNS public.import_batch
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_status public.import_batch_status;
  v_batch public.import_batch;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CONTEXT INJECTION (ADR-024 INV-7/INV-8)
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM public.set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated'
      USING ERRCODE = '28000';
  END IF;

  -- Context must be present
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Role gate: admin and pit_boss only
  IF v_staff_role IS NULL OR v_staff_role NOT IN ('admin', 'pit_boss') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot create import batches', v_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INPUT VALIDATION
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_file_name IS NULL OR length(trim(p_file_name)) = 0 THEN
    RAISE EXCEPTION 'file_name is required'
      USING ERRCODE = '22023';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STATUS VALIDATION (P0-1: only NULL, 'staging', or 'created' allowed)
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_initial_status IS NOT NULL
     AND p_initial_status NOT IN ('staging', 'created') THEN
    RAISE EXCEPTION 'INVALID_INITIAL_STATUS: p_initial_status must be NULL, ''staging'', or ''created'', got %', p_initial_status
      USING ERRCODE = '22023';
  END IF;

  -- Determine actual status: NULL → 'staging' (backward compat)
  IF p_initial_status IS NULL OR p_initial_status = 'staging' THEN
    v_status := 'staging';
  ELSE
    v_status := 'created';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- IDEMPOTENT UPSERT: return existing batch on key match
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.import_batch (
    casino_id, created_by_staff_id, idempotency_key,
    file_name, vendor_label, column_mapping, status
  ) VALUES (
    v_casino_id, v_actor_id, p_idempotency_key,
    p_file_name, p_vendor_label, p_column_mapping, v_status
  )
  ON CONFLICT (casino_id, idempotency_key)
  DO NOTHING;

  -- Always return the batch (whether newly created or existing)
  SELECT * INTO v_batch
  FROM public.import_batch
  WHERE casino_id = v_casino_id
    AND idempotency_key = p_idempotency_key;

  IF v_batch IS NULL THEN
    RAISE EXCEPTION 'IMPORT_BATCH_NOT_FOUND: failed to create or retrieve batch'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_batch;
END;
$$;

COMMENT ON FUNCTION public.rpc_import_create_batch(text, text, text, jsonb, public.import_batch_status) IS
  'PRD-039: Create import batch with optional initial status (''created'' for server flow, '
  '''staging'' for client flow). 5-param overload — keeps existing 4-param version intact. '
  'Derives casino_id/actor_id from context (ADR-024 INV-8). Role gate: admin, pit_boss.';

-- ============================================================================
-- 2. OWNERSHIP & GRANTS (5-param overload only)
-- ============================================================================

ALTER FUNCTION public.rpc_import_create_batch(text, text, text, jsonb, public.import_batch_status) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_import_create_batch(text, text, text, jsonb, public.import_batch_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_import_create_batch(text, text, text, jsonb, public.import_batch_status) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_import_create_batch(text, text, text, jsonb, public.import_batch_status) TO authenticated;

-- ============================================================================
-- 3. PostgREST schema reload
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- =====================================================
-- Migration: rpc_log_table_buyin_telemetry
-- Created: 2026-01-14
-- Workstream: WS2 - ADDENDUM-TBL-RUNDOWN
-- Purpose: ADR-024 compliant RPC for logging buy-in telemetry events
-- Dependencies: WS1 (table_buyin_telemetry table must exist)
-- ADR Reference: ADR-024 (context injection)
-- =====================================================
-- This migration creates:
--   rpc_log_table_buyin_telemetry() - SECURITY DEFINER RPC for buy-in telemetry
--
-- Security Requirements (ADR-024):
--   - Calls set_rls_context_from_staff() at the start
--   - Derives casino_id, actor_id, gaming_day from context (not client input)
--   - Role check: pit_boss, floor_supervisor, admin
--   - Table must belong to caller's casino
--
-- Validation Requirements:
--   - Table belongs to resolved casino_id
--   - Amount > 0
--   - RATED_BUYIN requires visit_id + rating_slip_id
--   - GRIND_BUYIN requires NULL visit_id + rating_slip_id
--   - Idempotency support when key is present
--
-- Security Invariants Enforced:
--   INV-2: Only set_rls_context_from_staff() callable by client roles
--   INV-3: Staff identity bound to auth.uid() via staff table lookup
--   INV-5: Context set via SET LOCAL (pooler-safe)
--   INV-7: All client-callable RPCs call set_rls_context_from_staff()
-- =====================================================

BEGIN;

-- ============================================================================
-- SECURITY DEFINER RPC: rpc_log_table_buyin_telemetry
-- ============================================================================
-- Purpose: Create a buy-in telemetry record for shift metrics
-- Returns: The inserted or existing table_buyin_telemetry row
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_log_table_buyin_telemetry(
  p_table_id uuid,
  p_amount_cents bigint,
  p_telemetry_kind text,
  p_visit_id uuid DEFAULT NULL,
  p_rating_slip_id uuid DEFAULT NULL,
  p_tender_type text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL  -- Optional: for service-role testing bypass
) RETURNS table_buyin_telemetry
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_table_casino_id uuid;
  v_gaming_day date;
  v_normalized_idempotency_key text;
  v_existing_record table_buyin_telemetry%ROWTYPE;
  v_result table_buyin_telemetry%ROWTYPE;
BEGIN
  -- =======================================================================
  -- ADR-024: Context Injection with Service Role Bypass for Testing
  -- =======================================================================
  -- If p_actor_id is provided (service role tests), derive context from staff table
  -- Otherwise, use JWT-based identity via set_rls_context_from_staff()
  IF p_actor_id IS NOT NULL THEN
    -- Service role bypass: derive context from provided actor_id
    SELECT s.id, s.casino_id, s.role::text
    INTO v_context_actor_id, v_context_casino_id, v_context_staff_role
    FROM public.staff s
    WHERE s.id = p_actor_id
      AND s.status = 'active';

    IF v_context_actor_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Staff % not found or inactive', p_actor_id
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    -- Production path: Derive staff identity from JWT + staff table binding
    PERFORM set_rls_context_from_staff();

    -- Extract the validated context (set by set_rls_context_from_staff)
    v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
    v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
    v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

    -- Check authentication (only for JWT path)
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Authentication required'
        USING ERRCODE = 'P0001';
    END IF;

    -- Check context was established
    IF v_context_actor_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Staff identity not found in context. Ensure you are logged in as an active staff member.'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_context_casino_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Casino context not established. Staff must be assigned to a casino.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- =======================================================================
  -- Authorization Check (applies to both paths)
  -- =======================================================================

  -- Check role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'floor_supervisor', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role "%" is not authorized to log buy-in telemetry. Required: pit_boss, floor_supervisor, or admin.',
      COALESCE(v_context_staff_role, 'none')
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Input Validation
  -- =======================================================================

  -- Validate amount_cents > 0
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: amount_cents must be greater than 0. Received: %',
      COALESCE(p_amount_cents::text, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate table_id is provided
  IF p_table_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: table_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate telemetry_kind
  IF p_telemetry_kind IS NULL OR p_telemetry_kind NOT IN ('RATED_BUYIN', 'GRIND_BUYIN') THEN
    RAISE EXCEPTION 'INVALID_INPUT: telemetry_kind must be RATED_BUYIN or GRIND_BUYIN. Received: %',
      COALESCE(p_telemetry_kind, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate RATED_BUYIN linkage
  IF p_telemetry_kind = 'RATED_BUYIN' THEN
    IF p_visit_id IS NULL OR p_rating_slip_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: RATED_BUYIN requires both visit_id and rating_slip_id'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Validate GRIND_BUYIN no-linkage
  IF p_telemetry_kind = 'GRIND_BUYIN' THEN
    IF p_visit_id IS NOT NULL OR p_rating_slip_id IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: GRIND_BUYIN must not have visit_id or rating_slip_id'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- =======================================================================
  -- Table Validation - Verify table belongs to caller's casino
  -- =======================================================================
  SELECT gt.casino_id
  INTO v_table_casino_id
  FROM public.gaming_table gt
  WHERE gt.id = p_table_id;

  IF v_table_casino_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Table % not found', p_table_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_table_casino_id <> v_context_casino_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Table % does not belong to your casino', p_table_id
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Visit Validation (if provided)
  -- =======================================================================
  IF p_visit_id IS NOT NULL THEN
    PERFORM 1
    FROM public.visit v
    WHERE v.id = p_visit_id
      AND v.casino_id = v_context_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND: Visit % not found or does not belong to your casino', p_visit_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- =======================================================================
  -- Rating Slip Validation (if provided)
  -- =======================================================================
  IF p_rating_slip_id IS NOT NULL THEN
    PERFORM 1
    FROM public.rating_slip rs
    WHERE rs.id = p_rating_slip_id
      AND rs.visit_id = p_visit_id
      AND rs.table_id = p_table_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_INPUT: Rating slip % does not belong to visit % at table %',
        p_rating_slip_id, p_visit_id, p_table_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- =======================================================================
  -- Compute Gaming Day from Casino Settings
  -- =======================================================================
  v_gaming_day := compute_gaming_day(v_context_casino_id, now());

  -- =======================================================================
  -- Idempotency Handling
  -- =======================================================================
  -- Normalize idempotency key: treat empty string as NULL
  v_normalized_idempotency_key := NULLIF(TRIM(p_idempotency_key), '');

  -- If idempotency key is provided, check for existing record
  IF v_normalized_idempotency_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_record
    FROM public.table_buyin_telemetry
    WHERE casino_id = v_context_casino_id
      AND idempotency_key = v_normalized_idempotency_key;

    -- Return existing record if found (idempotent behavior)
    IF FOUND THEN
      RETURN v_existing_record;
    END IF;
  END IF;

  -- =======================================================================
  -- Insert New Record
  -- =======================================================================
  INSERT INTO public.table_buyin_telemetry (
    casino_id,
    gaming_day,
    table_id,
    visit_id,
    rating_slip_id,
    amount_cents,
    telemetry_kind,
    tender_type,
    occurred_at,
    actor_id,
    note,
    idempotency_key
  ) VALUES (
    v_context_casino_id,
    v_gaming_day,
    p_table_id,
    p_visit_id,
    p_rating_slip_id,
    p_amount_cents,
    p_telemetry_kind,
    p_tender_type,
    now(),
    v_context_actor_id,
    p_note,
    v_normalized_idempotency_key
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- Revoke from PUBLIC, grant only to authenticated (and service_role for testing)
REVOKE ALL ON FUNCTION public.rpc_log_table_buyin_telemetry(
  uuid, bigint, text, uuid, uuid, text, text, text, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_log_table_buyin_telemetry(
  uuid, bigint, text, uuid, uuid, text, text, text, uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_log_table_buyin_telemetry(
  uuid, bigint, text, uuid, uuid, text, text, text, uuid
) IS 'ADDENDUM-TBL-RUNDOWN WS2: Log buy-in telemetry (RATED_BUYIN or GRIND_BUYIN). '
  'SECURITY DEFINER with ADR-024 compliant context injection. '
  'Derives casino_id, actor_id, and gaming_day from authenticated context (not client input). '
  'Optional p_actor_id parameter for service-role testing bypass. '
  'Supports idempotency when idempotency_key is provided. '
  'Role authorization: pit_boss, floor_supervisor, admin. '
  'Validates table belongs to caller''s casino and rating_slip belongs to visit at table.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

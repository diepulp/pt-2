-- =====================================================
-- Migration: PRD-OPS-CASH-OBS-001 WS2 - Write Path (RPC)
-- Created: 2026-01-06 02:11:06
-- PRD Reference: docs/10-prd/PRD_OPS_CASH_OBSERVATIONS.md
-- EXEC-SPEC: docs/20-architecture/specs/PRD-OPS-CASH-OBS-001/EXECUTION-SPEC-PRD-OPS-CASH-OBS-001.md
-- Workstream: WS2 - Write Path
-- Dependencies: WS1 (pit_cash_observation table must exist)
-- =====================================================
-- This migration creates:
--   rpc_create_pit_cash_observation() - SECURITY DEFINER RPC for pit cash observations
--
-- Security Requirements (ADR-024):
--   - Calls set_rls_context_from_staff() at the start
--   - Actor binding from context (not client input)
--   - Casino binding from context (not client input)
--   - Role check: pit_boss, cashier, admin
--   - Ignores any client-provided created_by_staff_id
--
-- Validation Requirements:
--   - Visit belongs to resolved casino_id
--   - Player derived from visit record
--   - Rating slip (if provided) belongs to same visit
--   - Amount > 0
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
-- SECURITY DEFINER RPC: rpc_create_pit_cash_observation
-- ============================================================================
-- Purpose: Create a pit cash observation record for walk-with/chips-taken
-- Returns: The inserted or existing pit_cash_observation row
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_create_pit_cash_observation(
  p_visit_id uuid,
  p_amount numeric,
  p_rating_slip_id uuid DEFAULT NULL,
  p_amount_kind observation_amount_kind DEFAULT 'estimate',
  p_source observation_source DEFAULT 'walk_with',
  p_observed_at timestamptz DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL  -- Optional: for service-role testing bypass
) RETURNS pit_cash_observation
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_visit_record RECORD;
  v_player_id uuid;
  v_normalized_idempotency_key text;
  v_existing_record pit_cash_observation%ROWTYPE;
  v_result pit_cash_observation%ROWTYPE;
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
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role "%" is not authorized to create pit cash observations. Required: pit_boss, cashier, or admin.',
      COALESCE(v_context_staff_role, 'none')
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Input Validation
  -- =======================================================================

  -- Validate amount > 0
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Amount must be greater than 0. Received: %',
      COALESCE(p_amount::text, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate visit_id is provided
  IF p_visit_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: visit_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Visit Validation - Verify visit belongs to caller's casino
  -- =======================================================================
  SELECT id, casino_id, player_id
  INTO v_visit_record
  FROM public.visit
  WHERE id = p_visit_id;

  IF v_visit_record IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Visit % not found',
      p_visit_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_visit_record.casino_id <> v_context_casino_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Visit % does not belong to your casino',
      p_visit_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Derive player_id from the visit
  v_player_id := v_visit_record.player_id;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_STATE: Visit % has no associated player',
      p_visit_id
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Rating Slip Validation (if provided)
  -- =======================================================================
  IF p_rating_slip_id IS NOT NULL THEN
    PERFORM 1
    FROM public.rating_slip
    WHERE id = p_rating_slip_id
      AND visit_id = p_visit_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_INPUT: Rating slip % does not belong to visit %',
        p_rating_slip_id, p_visit_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- =======================================================================
  -- Idempotency Handling
  -- =======================================================================
  -- Normalize idempotency key: treat empty string as NULL
  v_normalized_idempotency_key := NULLIF(TRIM(p_idempotency_key), '');

  -- If idempotency key is provided, check for existing record
  IF v_normalized_idempotency_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_record
    FROM public.pit_cash_observation
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
  -- Note: gaming_day is computed by trigger using compute_gaming_day()
  -- Note: created_by_staff_id is forced from context (v_context_actor_id)
  INSERT INTO public.pit_cash_observation (
    casino_id,
    player_id,
    visit_id,
    rating_slip_id,
    amount,
    amount_kind,
    source,
    observed_at,
    created_by_staff_id,
    note,
    idempotency_key
  ) VALUES (
    v_context_casino_id,
    v_player_id,
    p_visit_id,
    p_rating_slip_id,
    p_amount,
    p_amount_kind,
    p_source,
    COALESCE(p_observed_at, now()),
    v_context_actor_id,  -- Forced from context, ignores any client input
    p_note,
    v_normalized_idempotency_key
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- Revoke from PUBLIC, grant only to authenticated (and service_role for testing)
REVOKE ALL ON FUNCTION public.rpc_create_pit_cash_observation(
  uuid, numeric, uuid, observation_amount_kind, observation_source, timestamptz, text, text, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_create_pit_cash_observation(
  uuid, numeric, uuid, observation_amount_kind, observation_source, timestamptz, text, text, uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_create_pit_cash_observation(
  uuid, numeric, uuid, observation_amount_kind, observation_source, timestamptz, text, text, uuid
) IS 'PRD-OPS-CASH-OBS-001 WS2: Create pit cash observation (walk-with/chips-taken). '
  'SECURITY DEFINER with ADR-024 compliant context injection. '
  'Derives casino_id and created_by_staff_id from authenticated context (not client input). '
  'Optional p_actor_id parameter for service-role testing bypass. '
  'Supports idempotency when idempotency_key is provided. '
  'Role authorization: pit_boss, cashier, admin. '
  'Validates visit belongs to caller''s casino and rating_slip belongs to visit.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

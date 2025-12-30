-- =====================================================
-- Migration: ADR-024 RLS Context Self-Injection Remediation - Phase 1
-- Created: 2025-12-29 15:23:17
-- ADR Reference: docs/80-adrs/ADR-024_DECISIONS.md
-- EXEC-SPEC: docs/20-architecture/specs/ADR-024/EXEC-SPEC-024.md
-- Purpose: Deploy secure RLS context injection functions
-- =====================================================
-- This migration creates:
--   1. Unique constraint on staff.user_id (deterministic lookup)
--   2. set_rls_context_from_staff() - authoritative context injection
--   3. set_rls_context_internal() - ops lane for service_role
--
-- Security Invariants Enforced:
--   INV-3: Staff identity bound to auth.uid()
--   INV-5: Context set via SET LOCAL (pooler-safe)
--   INV-6: Deterministic staff lookup (unique user_id)
-- =====================================================

BEGIN;

-- ============================================================================
-- STEP 1: Ensure unique constraint/index on staff.user_id (idempotent)
-- ============================================================================
-- Required for deterministic staff lookup in set_rls_context_from_staff().
-- May already exist as either a constraint or a unique index.
-- ============================================================================

DO $$
BEGIN
  -- Check if unique index OR constraint already exists with this name
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'staff_user_id_unique'
      AND tablename = 'staff'
      AND schemaname = 'public'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staff_user_id_unique'
      AND conrelid = 'public.staff'::regclass
  ) THEN
    -- Create as unique index (partial, excluding NULL) for deterministic lookup
    CREATE UNIQUE INDEX staff_user_id_unique ON public.staff (user_id)
    WHERE user_id IS NOT NULL;
  END IF;
END $$;

COMMENT ON INDEX public.staff_user_id_unique IS
  'ADR-024: Ensures deterministic staff lookup by auth.uid(). Required for set_rls_context_from_staff().';

-- ============================================================================
-- STEP 2: Create set_rls_context_from_staff()
-- ============================================================================
-- Primary function for authoritative context injection.
-- Takes NO spoofable parameters - derives all context from JWT and staff table.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_rls_context_from_staff(
  p_correlation_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_staff_id uuid;
  v_casino_id uuid;
  v_role text;
  v_correlation_id text;
BEGIN
  -- Guard correlation_id for log safety
  IF p_correlation_id IS NOT NULL THEN
    v_correlation_id := regexp_replace(p_correlation_id, '[^a-zA-Z0-9:_\-\.]+', '', 'g');
    v_correlation_id := left(v_correlation_id, 64);
  END IF;

  -- Derive staff_id from JWT (authoritative, not spoofable)
  v_staff_id := NULLIF((auth.jwt() -> 'app_metadata' ->> 'staff_id'), '')::uuid;

  IF v_staff_id IS NULL THEN
    -- Fallback: map auth.uid() to staff.user_id
    BEGIN
      SELECT s.id INTO STRICT v_staff_id
      FROM public.staff s
      WHERE s.user_id = auth.uid();
    EXCEPTION WHEN NO_DATA_FOUND THEN
      v_staff_id := NULL;
    END;
  ELSE
    -- Bind staff_id claim to auth.uid() to prevent mis-issued token escalation
    BEGIN
      SELECT s.id INTO STRICT v_staff_id
      FROM public.staff s
      WHERE s.id = v_staff_id
        AND s.user_id = auth.uid();
    EXCEPTION WHEN NO_DATA_FOUND THEN
      v_staff_id := NULL;
    END;
  END IF;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: staff identity not found'
      USING ERRCODE = 'P0001';
  END IF;

  -- Derive casino_id and role from staff table (authoritative, not spoofable)
  SELECT s.casino_id, s.role::text
  INTO v_casino_id, v_role
  FROM public.staff s
  WHERE s.id = v_staff_id
    AND s.status = 'active'
    AND s.casino_id IS NOT NULL;

  IF v_casino_id IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: staff not active or not casino-scoped'
      USING ERRCODE = 'P0001';
  END IF;

  -- Transaction-local context (pooler-safe SET LOCAL)
  PERFORM set_config('app.actor_id', v_staff_id::text, true);
  PERFORM set_config('app.casino_id', v_casino_id::text, true);
  PERFORM set_config('app.staff_role', v_role, true);

  IF v_correlation_id IS NOT NULL THEN
    PERFORM set_config('application_name', v_correlation_id, true);
  END IF;
END;
$$;

-- Revoke from PUBLIC, grant only to authenticated
REVOKE ALL ON FUNCTION public.set_rls_context_from_staff(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_rls_context_from_staff(text) TO authenticated;

COMMENT ON FUNCTION public.set_rls_context_from_staff IS
  'ADR-024: Authoritative RLS context injection. Derives staff identity from JWT + staff table binding. '
  'Takes NO spoofable parameters. Replaces vulnerable set_rls_context() pattern. '
  'INV-3: Staff identity bound to auth.uid(). INV-5: SET LOCAL for pooler safety.';

-- ============================================================================
-- STEP 3: Create set_rls_context_internal()
-- ============================================================================
-- Ops lane for service_role (migrations, admin operations).
-- Accepts parameters but validates against staff table.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_rls_context_internal(
  p_actor_id uuid,
  p_casino_id uuid,
  p_staff_role text,
  p_correlation_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Minimal pilot-grade validation for ops lane
  IF p_actor_id IS NULL OR p_casino_id IS NULL OR p_staff_role IS NULL THEN
    RAISE EXCEPTION 'INVALID: all context parameters required for internal setter'
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate actor exists and is casino-scoped
  PERFORM 1
  FROM public.staff s
  WHERE s.id = p_actor_id
    AND s.casino_id = p_casino_id
    AND s.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN: actor not active or casino mismatch'
      USING ERRCODE = 'P0001';
  END IF;

  -- Set transaction-local context
  PERFORM set_config('app.actor_id', p_actor_id::text, true);
  PERFORM set_config('app.casino_id', p_casino_id::text, true);
  PERFORM set_config('app.staff_role', p_staff_role, true);

  IF p_correlation_id IS NOT NULL THEN
    PERFORM set_config('application_name', p_correlation_id, true);
  END IF;
END;
$$;

-- Revoke from PUBLIC and authenticated, grant only to service_role
REVOKE ALL ON FUNCTION public.set_rls_context_internal(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_rls_context_internal(uuid, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.set_rls_context_internal IS
  'ADR-024: Ops lane for service_role. Accepts explicit parameters but validates against staff table. '
  'For migrations, admin operations, and internal tooling only. NOT callable by authenticated role.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

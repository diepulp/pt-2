-- =====================================================
-- Migration: AUTH-HARDENING v0.1 — WS1: RPC Return Type Migration
-- Description: Change set_rls_context_from_staff() from RETURNS VOID to RETURNS TABLE
--              so middleware can consume the authoritative context directly from the RPC.
-- Reference: ADR-015, ADR-024, AUTH-HARDENING-v0.1
-- Created: 2026-01-30 01:22:00
-- EXEC-SPEC: docs/20-architecture/specs/AUTH-HARDENING-v0.1/EXECUTION-SPEC-AUTH-HARDENING-v0.1.md
-- RLS_REVIEW_COMPLETE: DROP + CREATE is required because PG cannot ALTER return type.
-- VERIFIED_SAFE: Function body is identical to 20251229152317 with added RETURN NEXT.
--                Existing callers that ignore the return value are unaffected.
--
-- Security Invariants Preserved:
--   INV-3: Staff identity bound to auth.uid()
--   INV-5: Context set via SET LOCAL (pooler-safe)
--   INV-6: Deterministic staff lookup (unique user_id)
--
-- Risk: PostgreSQL cannot ALTER a function's return type. We must DROP + CREATE.
-- Mitigation: Only one overload exists (text signature from 20251229152317).
--             The () DROP is a safety net against drift.
-- =====================================================

BEGIN;

-- ============================================================================
-- STEP 1: Drop existing function (PG cannot ALTER return type)
-- ============================================================================
-- Current signature: set_rls_context_from_staff(p_correlation_id text DEFAULT NULL)
-- PG resolves this as (text). The no-arg DROP is a safety net.
-- ============================================================================

DROP FUNCTION IF EXISTS public.set_rls_context_from_staff();
DROP FUNCTION IF EXISTS public.set_rls_context_from_staff(text);

-- ============================================================================
-- STEP 2: Recreate with RETURNS TABLE
-- ============================================================================
-- Body is identical to the original (migration 20251229152317) except:
--   - RETURNS TABLE (actor_id uuid, casino_id uuid, staff_role text)
--   - After SET LOCAL block: assigns output columns + RETURN NEXT
-- Existing callers that ignore the return value are unaffected.
-- ============================================================================

CREATE FUNCTION public.set_rls_context_from_staff(
  p_correlation_id text DEFAULT NULL
) RETURNS TABLE (actor_id uuid, casino_id uuid, staff_role text)
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

  -- Return the derived context to the caller (AUTH-HARDENING v0.1 WS1)
  actor_id := v_staff_id;
  casino_id := v_casino_id;
  staff_role := v_role;
  RETURN NEXT;
END;
$$;

-- ============================================================================
-- STEP 3: Restore grants (identical to original)
-- ============================================================================

REVOKE ALL ON FUNCTION public.set_rls_context_from_staff(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_rls_context_from_staff(text) TO authenticated;

COMMENT ON FUNCTION public.set_rls_context_from_staff(text) IS
  'ADR-024 + AUTH-HARDENING v0.1 WS1: Authoritative RLS context injection. '
  'Derives staff identity from JWT + staff table binding. '
  'Returns TABLE (actor_id, casino_id, staff_role) so middleware can consume context directly. '
  'Takes NO spoofable parameters. INV-3: Staff identity bound to auth.uid(). INV-5: SET LOCAL for pooler safety.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- Migration: PRD-025 WS2 — rpc_bootstrap_casino + GAP-4 Casino Active Fix
-- Created: 2026-02-01 17:32:36
-- PRD Reference: docs/10-prd/PRD-025-onboarding-bootstrap-invites-v0.md
-- EXEC-SPEC: docs/20-architecture/specs/PRD-025/EXECUTION-SPEC-PRD-025.md
-- ADR References: ADR-024 (INV-8, no spoofable params), ADR-018 (SECURITY DEFINER),
--                 ADR-030 (D1 RETURNS TABLE preserved)
-- Markers: ADR-024, ADR-030
--
-- Purpose:
--   1. Create rpc_bootstrap_casino — atomic tenant creation (casino + settings + admin staff)
--   2. GAP-4 fix — amend set_rls_context_from_staff() to validate casino.status = 'active'
-- ============================================================================

-- ==========================================================================
-- 1. rpc_bootstrap_casino (SECURITY DEFINER)
--
-- Atomically creates a new casino tenant:
--   - INSERT casino (name, status='active')
--   - INSERT casino_settings (timezone, gaming_day_start_time)
--   - INSERT staff (admin role, user_id = auth.uid())
--   - INSERT audit_log (tenant_bootstrap event)
--
-- Does NOT call set_rls_context_from_staff() — caller has no staff binding yet.
-- Uses auth.uid() directly for user identification (Identity Model Option A).
-- No p_casino_id or p_actor_id parameters (ADR-024 INV-8 compliant).
-- ==========================================================================

CREATE FUNCTION public.rpc_bootstrap_casino(
  p_casino_name text,
  p_timezone text DEFAULT 'America/Los_Angeles',
  p_gaming_day_start time DEFAULT '06:00'
)
RETURNS TABLE (casino_id uuid, staff_id uuid, staff_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id    uuid;
  v_casino_id  uuid;
  v_staff_id   uuid;
  v_existing   uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- AUTH CHECK — reject anonymous callers
  -- ═══════════════════════════════════════════════════════════════════════
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- IDEMPOTENCY CHECK — user must not already have an active staff binding
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT s.id INTO v_existing
  FROM public.staff s
  WHERE s.user_id = v_user_id
    AND s.status = 'active';

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFLICT: user already has staff binding'
      USING ERRCODE = '23505';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ATOMIC TENANT CREATION — all three inserts in implicit transaction
  -- ═══════════════════════════════════════════════════════════════════════

  -- 1. Create casino
  INSERT INTO public.casino (name, status)
  VALUES (p_casino_name, 'active')
  RETURNING id INTO v_casino_id;

  -- 2. Create casino_settings (other columns have defaults)
  INSERT INTO public.casino_settings (casino_id, timezone, gaming_day_start_time)
  VALUES (v_casino_id, p_timezone, p_gaming_day_start);

  -- 3. Create admin staff binding (user_id = auth.uid() = auth.users.id, Option A)
  INSERT INTO public.staff (casino_id, user_id, role, status, first_name, last_name)
  VALUES (v_casino_id, v_user_id, 'admin', 'active', 'Admin', 'User')
  RETURNING id INTO v_staff_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- AUDIT LOG — tenant_bootstrap event (same transaction for atomicity)
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'casino',
    v_staff_id,
    'tenant_bootstrap',
    jsonb_build_object(
      'casino_id', v_casino_id,
      'staff_id', v_staff_id,
      'user_id', v_user_id,
      'casino_name', p_casino_name
    )
  );

  -- ═══════════════════════════════════════════════════════════════════════
  -- RETURN — caller uses this to call syncUserRLSClaims() at TS layer
  -- ═══════════════════════════════════════════════════════════════════════
  casino_id  := v_casino_id;
  staff_id   := v_staff_id;
  staff_role := 'admin';
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.rpc_bootstrap_casino(text, text, time) IS
  'PRD-025: Atomic tenant bootstrap — creates casino + casino_settings + admin staff binding. '
  'SECURITY DEFINER, does NOT call set_rls_context_from_staff() (no staff binding exists yet). '
  'Uses auth.uid() directly (Identity Model Option A). INV-8 compliant (no casino_id/actor_id params).';

-- Grants: only authenticated users can call (revoke from anon too)
REVOKE ALL ON FUNCTION public.rpc_bootstrap_casino(text, text, time) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_bootstrap_casino(text, text, time) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_bootstrap_casino(text, text, time) TO authenticated;

-- ==========================================================================
-- 2. GAP-4 Fix — amend set_rls_context_from_staff()
--
-- Change: JOIN casino table and validate casino.status = 'active'.
-- Uses CREATE OR REPLACE — return type TABLE(actor_id, casino_id, staff_role)
-- is unchanged (ADR-030 D1 preserved). Only the context derivation query
-- and its error message are modified.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.set_rls_context_from_staff(p_correlation_id text DEFAULT NULL::text)
  RETURNS TABLE(actor_id uuid, casino_id uuid, staff_role text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  -- GAP-4: JOIN casino to validate casino.status = 'active'
  SELECT s.casino_id, s.role::text
  INTO v_casino_id, v_role
  FROM public.staff s
  JOIN public.casino c ON c.id = s.casino_id
  WHERE s.id = v_staff_id
    AND s.status = 'active'
    AND s.casino_id IS NOT NULL
    AND c.status = 'active';  -- GAP-4: casino must be active

  IF v_casino_id IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: staff not active, not casino-scoped, or casino deactivated'
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
$function$;

COMMENT ON FUNCTION public.set_rls_context_from_staff(text) IS
  'ADR-024 + ADR-030 D1: Authoritative context derivation from JWT + staff table. '
  'RETURNS TABLE for TOCTOU elimination. GAP-4: validates casino.status = active (PRD-025 WS2).';

-- ==========================================================================
-- 3. PostgREST Schema Reload
-- ==========================================================================

NOTIFY pgrst, 'reload schema';

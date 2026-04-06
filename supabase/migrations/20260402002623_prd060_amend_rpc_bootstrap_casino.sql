-- ============================================================================
-- Migration: PRD-060 — Amend rpc_bootstrap_casino
-- Created: 2026-04-02 00:26:23
-- PRD Reference: docs/10-prd/PRD-060-company-registration-bootstrap.md
-- EXEC-SPEC: docs/21-exec-spec/EXEC-060-company-registration-bootstrap.md
-- ADR References: ADR-024 (INV-8, company_id derived from DB state),
--                 ADR-030 (fail-closed posture),
--                 ADR-043 (company foundation — synthetic auto-create superseded)
--
-- Purpose:
--   Amend rpc_bootstrap_casino to resolve company from onboarding_registration
--   instead of synthetic auto-create (ADR-043 D4 superseded by PRD-060).
--
-- Changes:
--   - REMOVE: synthetic company auto-create (INSERT INTO company)
--   - ADD: Registration lookup from onboarding_registration
--   - ADD: Fail-closed check (P0002 if no pending registration)
--   - ADD: Mark registration consumed after successful bootstrap
--   - ADD: registration_id in audit log payload
--
-- Signature UNCHANGED — CREATE OR REPLACE is safe.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_bootstrap_casino(
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
  v_user_id         uuid;
  v_casino_id       uuid;
  v_staff_id        uuid;
  v_company_id      uuid;
  v_registration_id uuid;
  v_existing        uuid;
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
  -- REGISTRATION LOOKUP — resolve company from onboarding_registration
  -- PRD-060: replaces ADR-043 D4 synthetic company auto-create
  -- ADR-024: company_id derived from DB state, not parameters
  -- ADR-030: fail-closed if no pending registration exists
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT r.company_id, r.id
  INTO v_company_id, v_registration_id
  FROM public.onboarding_registration r
  WHERE r.user_id = v_user_id
    AND r.status = 'pending';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'BOOTSTRAP_NO_REGISTRATION: No pending registration found for user'
      USING ERRCODE = 'P0002';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ATOMIC TENANT CREATION — casino + settings + staff
  -- Company already exists (created by rpc_register_company)
  -- ═══════════════════════════════════════════════════════════════════════

  -- 1. Create casino (with company_id from registration — NOT NULL enforced)
  INSERT INTO public.casino (name, status, company_id)
  VALUES (p_casino_name, 'active', v_company_id)
  RETURNING id INTO v_casino_id;

  -- 2. Create casino_settings (other columns have defaults)
  INSERT INTO public.casino_settings (casino_id, timezone, gaming_day_start_time)
  VALUES (v_casino_id, p_timezone, p_gaming_day_start);

  -- 3. Create admin staff binding (user_id = auth.uid() = auth.users.id, Option A)
  INSERT INTO public.staff (casino_id, user_id, role, status, first_name, last_name)
  VALUES (v_casino_id, v_user_id, 'admin', 'active', 'Admin', 'User')
  RETURNING id INTO v_staff_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- MARK REGISTRATION CONSUMED — same transaction for atomicity
  -- ═══════════════════════════════════════════════════════════════════════
  UPDATE public.onboarding_registration
  SET status = 'consumed', consumed_at = now()
  WHERE id = v_registration_id;

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
      'company_id', v_company_id,
      'registration_id', v_registration_id,
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
  'PRD-025 + ADR-043 + PRD-060: Atomic tenant bootstrap — creates casino + casino_settings + admin staff binding. '
  'Company resolved from onboarding_registration (PRD-060, replaces ADR-043 D4 synthetic auto-create). '
  'SECURITY DEFINER, does NOT call set_rls_context_from_staff() (no staff binding exists yet). '
  'Uses auth.uid() directly (Identity Model Option A). INV-8 compliant (no casino_id/actor_id params). '
  'Fail-closed: raises P0002 if no pending registration exists (ADR-030).';

-- ═══════════════════════════════════════════════════════════════════════
-- PostgREST Schema Reload
-- ═══════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Migration: Fix bootstrap idempotency + re-registration guardrail
-- Created: 2026-04-03 23:14:30
-- References: EXEC-060 risks[2], DoD final item
--
-- Two fixes, different weight:
--
-- PRIMARY (WS3): rpc_bootstrap_casino — replace CONFLICT exception with
--   idempotent return. If user already has an active staff binding, return
--   existing (casino_id, staff_id, staff_role) instead of throwing 23505.
--   The invariant: retrying the same bootstrap intent returns the same result.
--
-- SECONDARY (WS2): rpc_register_company — add ALREADY_BOOTSTRAPPED guard.
--   If user already has an active staff binding, block re-registration to
--   prevent orphaned company rows. Defensive perimeter, not the primary cure.
--
-- Signature UNCHANGED for both RPCs — CREATE OR REPLACE is safe.
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- WS3 (PRIMARY): rpc_bootstrap_casino — idempotent return on existing binding
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_staff_role_text text;
  v_company_id      uuid;
  v_registration_id uuid;
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
  -- IDEMPOTENCY — if already bootstrapped, return existing binding
  -- The invariant: retrying the same bootstrap intent returns the same
  -- result. No new error, no new state — if the work is done, say so.
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT s.casino_id, s.id, s.role::text
    INTO v_casino_id, v_staff_id, v_staff_role_text
  FROM public.staff s
  WHERE s.user_id = v_user_id
    AND s.status = 'active';

  IF v_casino_id IS NOT NULL THEN
    casino_id  := v_casino_id;
    staff_id   := v_staff_id;
    staff_role := v_staff_role_text;
    RETURN NEXT;
    RETURN;
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
  'Fail-closed: raises P0002 if no pending registration exists (ADR-030). '
  'Idempotent: returns existing (casino_id, staff_id, staff_role) if staff binding already exists.';


-- ═══════════════════════════════════════════════════════════════════════════
-- WS2 (SECONDARY): rpc_register_company — block re-registration after bootstrap
-- Defensive perimeter: a bootstrapped user has no business creating a new
-- company. This prevents orphaned company rows, but is NOT the primary
-- idempotency fix — that lives above in rpc_bootstrap_casino.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_register_company(
  p_company_name text,
  p_legal_name text DEFAULT NULL
)
RETURNS TABLE (company_id uuid, registration_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id         uuid;
  v_company_id      uuid;
  v_registration_id uuid;
  v_existing_staff  uuid;
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
  -- ALREADY-BOOTSTRAPPED GUARD — containment guardrail
  -- A user with an active staff binding has already completed bootstrap.
  -- Re-registration would create an orphaned company row.
  -- P0003: consistent with project P0xxx error taxonomy.
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT s.id INTO v_existing_staff
  FROM public.staff s
  WHERE s.user_id = v_user_id
    AND s.status = 'active';

  IF v_existing_staff IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_BOOTSTRAPPED: user already has an active staff binding'
      USING ERRCODE = 'P0003';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ATOMIC REGISTRATION — company + onboarding_registration
  -- Conflict detection relies on partial unique index
  -- uq_onboarding_registration_pending (user_id) WHERE status = 'pending'
  -- which raises 23505 (unique_violation) naturally on duplicate INSERT.
  -- ═══════════════════════════════════════════════════════════════════════

  -- 1. Create company row
  INSERT INTO public.company (name, legal_name)
  VALUES (p_company_name, p_legal_name)
  RETURNING id INTO v_company_id;

  -- 2. Create pending registration (23505 if one already exists for this user)
  INSERT INTO public.onboarding_registration (user_id, company_id, status)
  VALUES (v_user_id, v_company_id, 'pending')
  RETURNING id INTO v_registration_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- RETURN — caller uses company_id and registration_id
  -- ═══════════════════════════════════════════════════════════════════════
  company_id      := v_company_id;
  registration_id := v_registration_id;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.rpc_register_company(text, text) IS
  'PRD-060: Atomic company registration — creates company + pending onboarding_registration. '
  'SECURITY DEFINER, auth-flow exception (ADR-018): does NOT call set_rls_context_from_staff() '
  'because no staff binding exists yet. Uses auth.uid() directly (pre-staff pattern). '
  'ADR-024 INV-8 compliant (no casino_id/actor_id params). '
  'Conflict detection via partial unique index uq_onboarding_registration_pending (23505). '
  'ALREADY_BOOTSTRAPPED guard (P0003): rejects registration if user already has active staff binding.';


-- ═══════════════════════════════════════════════════════════════════════════
-- PostgREST Schema Reload
-- ═══════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

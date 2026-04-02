-- ============================================================================
-- Migration: PRD-060 — rpc_register_company
-- Created: 2026-04-02 00:26:22
-- PRD Reference: docs/10-prd/PRD-060-company-registration-bootstrap.md
-- EXEC-SPEC: docs/21-exec-spec/EXEC-060-company-registration-bootstrap.md
-- ADR References: ADR-018 (SECURITY DEFINER governance, auth-flow exception),
--                 ADR-024 INV-8 (no client-carried casino_id/actor_id),
--                 ADR-030 (fail-closed posture)
--
-- Purpose:
--   Create rpc_register_company — a SECURITY DEFINER RPC that creates a
--   company row and a pending onboarding_registration in one transaction.
--   This is a pre-staff auth-flow function (like rpc_bootstrap_casino):
--   it uses auth.uid() directly, NOT set_rls_context_from_staff().
--
-- Security:
--   - SECURITY DEFINER with search_path = pg_catalog, public
--   - Auth check: auth.uid() must not be NULL
--   - No set_rls_context_from_staff() call (pre-staff, no staff binding exists)
--   - Conflict detection via partial unique index (23505 on duplicate pending)
--   - REVOKE ALL from PUBLIC/anon, GRANT EXECUTE to authenticated
--   - ADR-024 INV-8: no p_casino_id or p_actor_id parameters
-- ============================================================================

CREATE FUNCTION public.rpc_register_company(
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
  'Conflict detection via partial unique index uq_onboarding_registration_pending (23505).';

-- ═══════════════════════════════════════════════════════════════════════
-- GRANTS — deny-by-default, then grant to authenticated only
-- ═══════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.rpc_register_company(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_register_company(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_register_company(text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- PostgREST Schema Reload
-- ═══════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

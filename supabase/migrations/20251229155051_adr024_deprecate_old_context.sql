-- ═══════════════════════════════════════════════════════════════════════════════
-- ADR-024: Deprecate Old set_rls_context Function
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- SECURITY REMEDIATION: This migration completes the ADR-024 pilot by revoking
-- the vulnerable param-based context setter from client-callable roles.
--
-- INVARIANTS ENFORCED:
-- - INV-1: set_rls_context(uuid,uuid,text,text) is NOT callable by authenticated/anon/PUBLIC
-- - INV-2: Only set_rls_context_from_staff() is callable by authenticated role
-- - INV-3: set_rls_context_internal() is ONLY callable by service_role (ops lane)
--
-- DoD VERIFICATION:
--   SELECT has_function_privilege('authenticated', 'public.set_rls_context(uuid,uuid,text,text)', 'execute');
--   -- Must return FALSE
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Revoke old set_rls_context from all client-callable roles
-- ═══════════════════════════════════════════════════════════════════════════════

-- Revoke from authenticated (primary client role)
REVOKE EXECUTE ON FUNCTION public.set_rls_context(uuid, uuid, text, text) FROM authenticated;

-- Revoke from anon (should never have had access, but belt-and-suspenders)
REVOKE EXECUTE ON FUNCTION public.set_rls_context(uuid, uuid, text, text) FROM anon;

-- Revoke from PUBLIC (catch-all for any implicit grants)
REVOKE EXECUTE ON FUNCTION public.set_rls_context(uuid, uuid, text, text) FROM PUBLIC;

-- NOTE: service_role retains access for migrations, admin operations, and rollback capability

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Fix set_rls_context_internal grants (should be service_role ONLY)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Revoke from authenticated (ops lane is not for client use)
REVOKE EXECUTE ON FUNCTION public.set_rls_context_internal(uuid, uuid, text, text) FROM authenticated;

-- Revoke from anon
REVOKE EXECUTE ON FUNCTION public.set_rls_context_internal(uuid, uuid, text, text) FROM anon;

-- Revoke from PUBLIC
REVOKE EXECUTE ON FUNCTION public.set_rls_context_internal(uuid, uuid, text, text) FROM PUBLIC;

-- Ensure service_role has access (should already, but explicit)
GRANT EXECUTE ON FUNCTION public.set_rls_context_internal(uuid, uuid, text, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Add deprecation comment to old function
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON FUNCTION public.set_rls_context(uuid, uuid, text, text) IS
'DEPRECATED (ADR-024): This function accepts spoofable parameters and is a security vulnerability.
Use set_rls_context_from_staff() for authenticated users (derives context from auth.uid()).
Use set_rls_context_internal() for service_role ops (migrations, admin).
This function is retained for rollback capability but MUST NOT be granted to client roles.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Verify grants are correct (assertion block)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_old_auth boolean;
  v_old_anon boolean;
  v_internal_auth boolean;
  v_internal_anon boolean;
  v_from_staff_auth boolean;
BEGIN
  -- Check old function is revoked from client roles
  SELECT has_function_privilege('authenticated', 'public.set_rls_context(uuid,uuid,text,text)', 'execute')
  INTO v_old_auth;

  SELECT has_function_privilege('anon', 'public.set_rls_context(uuid,uuid,text,text)', 'execute')
  INTO v_old_anon;

  -- Check internal function is revoked from client roles
  SELECT has_function_privilege('authenticated', 'public.set_rls_context_internal(uuid,uuid,text,text)', 'execute')
  INTO v_internal_auth;

  SELECT has_function_privilege('anon', 'public.set_rls_context_internal(uuid,uuid,text,text)', 'execute')
  INTO v_internal_anon;

  -- Check new function IS available to authenticated
  SELECT has_function_privilege('authenticated', 'public.set_rls_context_from_staff(text)', 'execute')
  INTO v_from_staff_auth;

  -- Assert invariants
  IF v_old_auth THEN
    RAISE EXCEPTION 'ADR-024 INVARIANT VIOLATION: set_rls_context still callable by authenticated';
  END IF;

  IF v_old_anon THEN
    RAISE EXCEPTION 'ADR-024 INVARIANT VIOLATION: set_rls_context still callable by anon';
  END IF;

  IF v_internal_auth THEN
    RAISE EXCEPTION 'ADR-024 INVARIANT VIOLATION: set_rls_context_internal callable by authenticated';
  END IF;

  IF v_internal_anon THEN
    RAISE EXCEPTION 'ADR-024 INVARIANT VIOLATION: set_rls_context_internal callable by anon';
  END IF;

  IF NOT v_from_staff_auth THEN
    RAISE EXCEPTION 'ADR-024 INVARIANT VIOLATION: set_rls_context_from_staff NOT callable by authenticated';
  END IF;

  RAISE NOTICE 'ADR-024 INVARIANTS VERIFIED: All grant assertions passed';
END $$;

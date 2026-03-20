-- Migration: append_audit_log SECURITY DEFINER RPC
--
-- Provides a narrow privileged audit append path for the authenticated role.
-- INSERT on audit_log was revoked from authenticated by SEC-007 P0 hardening.
-- This RPC is the only way application code can write audit records.
--
-- Identity derivation: casino_id and actor_id are read from session variables
-- set by set_rls_context_from_staff() earlier in the request. If session vars
-- are not set, the RPC falls back to JWT app_metadata. This matches Pattern C
-- (ADR-015 hybrid) used throughout the codebase.
--
-- The caller provides domain, action, and details — but NEVER identity fields.

CREATE OR REPLACE FUNCTION public.append_audit_log(
  p_domain text,
  p_action text,
  p_details jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
BEGIN
  -- Derive identity from trusted context (session vars or JWT fallback)
  v_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  v_actor_id := COALESCE(
    NULLIF(current_setting('app.actor_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
  );

  INSERT INTO public.audit_log (casino_id, domain, actor_id, action, details)
  VALUES (v_casino_id, p_domain, v_actor_id, p_action, p_details);
END;
$$;

-- Grant execute to authenticated role only
REVOKE ALL ON FUNCTION public.append_audit_log(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_audit_log(text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.append_audit_log IS
  'Append-only audit log writer. SECURITY DEFINER — derives identity from session vars/JWT. '
  'Direct INSERT on audit_log remains revoked from authenticated (SEC-007).';

-- ============================================================================
-- SEC-007 P0 RPC Context Fixes
-- Fixes: P0-6 (rpc_get_rating_slip_duration exposed without auth/context)
-- Source: SEC-007 Tenant Isolation Enforcement Contract (EXEC-040)
-- ADR: ADR-024
-- ============================================================================
-- P0-6: rpc_get_rating_slip_duration is a STABLE helper with no auth check,
--        no context injection, and no casino scoping. It's exposed via PostgREST
--        to authenticated users, allowing any tenant to query any rating slip
--        duration by UUID.
--
--        This function is INTERNAL-ONLY — called by compliant RPCs:
--          - rpc_get_visit_live_view (SECURITY DEFINER, has set_rls_context_from_staff)
--          - rpc_get_rating_slip_modal_data (SECURITY DEFINER, has set_rls_context_from_staff)
--
--        Fix: REVOKE from authenticated (and PUBLIC/anon). DEFINER callers
--        execute as function owner so they can still invoke it.
-- ============================================================================

-- REVOKE from all non-owner roles
REVOKE ALL ON FUNCTION public.rpc_get_rating_slip_duration(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_rating_slip_duration(uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_get_rating_slip_duration(uuid, timestamptz) FROM authenticated;

-- GRANT to service_role only (for admin/migration scripts)
GRANT EXECUTE ON FUNCTION public.rpc_get_rating_slip_duration(uuid, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';

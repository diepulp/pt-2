-- ============================================================================
-- SEC-007 WS4: DROP deprecated set_rls_context()
-- Source: SEC-007 Tenant Isolation Enforcement Contract (EXEC-040)
-- ADR: ADR-024
-- ============================================================================
-- The deprecated set_rls_context(uuid, uuid, text, text) is the root cause of
-- copy-paste regressions across RPCs. It was superseded by
-- set_rls_context_from_staff() (ADR-024) which derives context authoritatively
-- from JWT claims + staff table lookup.
--
-- Already REVOKED from authenticated/anon/PUBLIC since migration 20251229155051.
-- Any runtime caller already fails. This DROP eliminates the function entirely
-- to prevent future copy-paste into new RPCs.
--
-- Note: RPCs that still reference set_rls_context() in their bodies
-- (e.g., table management RPCs from 20251221173716) are overridden by later
-- CREATE OR REPLACE migrations (20251231072655) that use set_rls_context_from_staff().
-- ============================================================================

DROP FUNCTION IF EXISTS public.set_rls_context(uuid, uuid, text, text);

NOTIFY pgrst, 'reload schema';

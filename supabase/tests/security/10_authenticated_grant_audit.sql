-- ============================================================================
-- SEC-010: Authenticated GRANT Audit
-- Verifies every rpc_* function in public schema has GRANT EXECUTE TO
-- authenticated, with an explicit exclusion list for internal-only functions.
--
-- Root cause: P1 incident (2026-04-08) — rpc_get_rating_slip_duration lacked
-- GRANT EXECUTE TO authenticated after bulk REVOKE stripped inherited grants.
-- No test layer caught this because all tests used service_role or DEV_AUTH_BYPASS.
--
-- Reference: GAP-AUTHENTICATED-ROLE-GRANT-BLIND-SPOT
-- Reference: PRODUCTION-READINESS-REPORT-04-08, Section 1.4
-- ============================================================================

DO $$
DECLARE
  -- Internal-only functions that should NOT be callable by authenticated role.
  -- Each entry must have a comment explaining why it is excluded.
  v_exclusions text[] := ARRAY[]::text[]; -- No exclusions currently. All rpc_* functions are client-callable.
  -- To exclude a function, add it here:
  -- v_exclusions text[] := ARRAY['rpc_internal_helper'];  -- Only called by service_role

  v_missing text := '';
  v_missing_count int := 0;
  rec record;
BEGIN
  FOR rec IN
    SELECT p.proname AS function_name
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'rpc_%'
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND p.proname != ALL(v_exclusions)
    ORDER BY p.proname
  LOOP
    v_missing := v_missing || format(
      E'  - %s: missing GRANT EXECUTE TO authenticated\n',
      rec.function_name
    );
    v_missing_count := v_missing_count + 1;
  END LOOP;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION E'FAIL: Found % rpc_* function(s) without GRANT EXECUTE TO authenticated:\n%\nFix: Add explicit GRANT EXECUTE ... TO authenticated in the migration that creates the function.',
      v_missing_count, v_missing;
  END IF;

  RAISE NOTICE 'PASS: All rpc_* functions have GRANT EXECUTE TO authenticated (% excluded)',
    COALESCE(array_length(v_exclusions, 1), 0);
END;
$$;

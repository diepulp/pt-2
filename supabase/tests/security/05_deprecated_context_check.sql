-- ============================================================================
-- SEC-005: Deprecated Context Check
-- Checks that no rpc_* function in the database still uses the deprecated
-- set_rls_context() call. The authoritative function is set_rls_context_from_staff().
-- set_rls_context_internal() is also acceptable (used internally by the from_staff wrapper).
--
-- This queries pg_proc prosrc for the LATEST compiled function bodies,
-- not raw migration files, so it reflects the actual deployed state.
-- ============================================================================

DO $$
DECLARE
  v_violations text := '';
  v_violation_count int := 0;
  rec record;
BEGIN
  FOR rec IN
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'rpc_%'
      AND p.prosrc ~* 'set_rls_context\s*\('
      AND p.prosrc !~* 'set_rls_context_(from_staff|internal)\s*\('
    ORDER BY p.proname
  LOOP
    v_violations := v_violations || format(E'  - %s\n', rec.proname);
    v_violation_count := v_violation_count + 1;
  END LOOP;

  IF v_violation_count > 0 THEN
    RAISE EXCEPTION E'FAIL [SEC-005]: % rpc_* function(s) use deprecated set_rls_context():\n%Update to set_rls_context_from_staff() per ADR-024.',
      v_violation_count, v_violations;
  END IF;

  RAISE NOTICE 'PASS: No rpc_* functions use deprecated set_rls_context()';
END;
$$;

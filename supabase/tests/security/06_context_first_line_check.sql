-- ============================================================================
-- SEC-006: Context First-Line Check
-- Verifies all SECURITY DEFINER rpc_* functions call set_rls_context_from_staff()
-- (or set_rls_context_internal()) as their first PERFORM statement (ADR-024).
--
-- Allowlist: auth-flow functions that don't use staff context,
--            internal-only functions REVOKE'd from authenticated.
-- ============================================================================

DO $$
DECLARE
  v_violations text := '';
  v_violation_count int := 0;
  rec record;
  v_first_perform text;
  v_allowlist text[] := ARRAY[
    'rpc_get_rating_slip_duration',
    'rpc_bootstrap_casino',
    'rpc_accept_staff_invite',
    'rpc_current_gaming_day',
    'rpc_gaming_day_range'
  ];
BEGIN
  FOR rec IN
    SELECT
      p.proname,
      p.prosrc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'rpc_%'
      AND p.prosecdef = true
      AND p.proname != ALL(v_allowlist)
    ORDER BY p.proname
  LOOP
    -- Extract the first PERFORM target (handles optional public. prefix)
    v_first_perform := (regexp_match(rec.prosrc, 'PERFORM\s+([\w.]+)', 'i'))[1];

    -- Accept set_rls_context_from_staff or set_rls_context_internal
    -- with or without public. prefix
    IF v_first_perform IS NULL
       OR v_first_perform NOT IN (
         'set_rls_context_from_staff',
         'public.set_rls_context_from_staff',
         'set_rls_context_internal',
         'public.set_rls_context_internal'
       )
    THEN
      v_violations := v_violations || format(
        E'  - %s: first PERFORM is ''%s'' (expected set_rls_context_from_staff)\n',
        rec.proname, COALESCE(v_first_perform, '<none>')
      );
      v_violation_count := v_violation_count + 1;
    END IF;
  END LOOP;

  IF v_violation_count > 0 THEN
    RAISE EXCEPTION E'FAIL [SEC-006]: % SECURITY DEFINER rpc_* function(s) without context-first-line:\n%',
      v_violation_count, v_violations;
  END IF;

  RAISE NOTICE 'PASS: All SECURITY DEFINER rpc_* functions call set_rls_context_from_staff() as first PERFORM';
END;
$$;

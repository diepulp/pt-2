-- ============================================================================
-- SEC-003: Identity Parameter Check
-- Scans pg_proc for any rpc_* function with a spoofable p_actor_id parameter.
-- Per ADR-024, identity must be derived from JWT via set_rls_context_from_staff(),
-- never passed as a user-supplied parameter.
--
-- p_casino_id in validate-pattern RPCs is deferred to P2 (warn only).
-- p_actor_id in any rpc_* function is a hard failure.
-- ============================================================================

DO $$
DECLARE
  v_violations text := '';
  v_violation_count int := 0;
  v_warnings text := '';
  v_warning_count int := 0;
  rec record;
  v_args text;
BEGIN
  FOR rec IN
    SELECT
      p.proname,
      pg_get_function_arguments(p.oid) AS func_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'rpc_%'
  LOOP
    v_args := rec.func_args;

    -- Hard fail: p_actor_id found
    IF v_args ILIKE '%p_actor_id%' THEN
      v_violations := v_violations || format(
        E'  - %s(%s)\n',
        rec.proname, v_args
      );
      v_violation_count := v_violation_count + 1;
    END IF;

    -- Warn only: p_casino_id found (deferred to P2)
    IF v_args ILIKE '%p_casino_id%' THEN
      v_warnings := v_warnings || format(
        E'  - %s(%s)\n',
        rec.proname, v_args
      );
      v_warning_count := v_warning_count + 1;
    END IF;
  END LOOP;

  -- Emit warnings for p_casino_id (non-fatal, deferred to P2)
  IF v_warning_count > 0 THEN
    RAISE NOTICE E'WARN: Found % rpc_* function(s) with p_casino_id parameter (deferred to P2):\n%',
      v_warning_count, v_warnings;
  END IF;

  -- Hard fail for p_actor_id
  IF v_violation_count > 0 THEN
    RAISE EXCEPTION E'FAIL: Found % rpc_* function(s) with spoofable p_actor_id parameter (ADR-024 violation):\n%',
      v_violation_count, v_violations;
  END IF;

  RAISE NOTICE 'PASS: No rpc_* functions accept spoofable p_actor_id parameter';
END;
$$;

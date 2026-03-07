-- ============================================================================
-- SEC-002: Overload Ambiguity Check
-- Scans pg_proc for any rpc_* function with multiple overloads (same proname,
-- different pronargs). DEFAULT-arg overlap creates PostgREST disambiguation
-- failures.
--
-- Allowlist: Pre-existing overloads tracked in separate remediation backlog.
-- These use intentional DEFAULT-param versioning (not PostgREST-exposed).
-- ============================================================================

DO $$
DECLARE
  -- Pre-existing overloads outside SEC-007 scope (shift metrics RPCs use
  -- intentional DEFAULT-param versioning for backward compat during migration)
  v_allowlist text[] := ARRAY[
    'rpc_shift_casino_metrics',
    'rpc_shift_pit_metrics',
    'rpc_shift_table_metrics'
  ];
  v_violations text := '';
  v_violation_count int := 0;
  rec record;
BEGIN
  FOR rec IN
    SELECT
      p.proname,
      count(*)            AS overload_count,
      array_agg(p.pronargs ORDER BY p.pronargs) AS arg_counts
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'rpc_%'
      AND p.proname != ALL(v_allowlist)
    GROUP BY p.proname
    HAVING count(*) > 1
  LOOP
    v_violations := v_violations || format(
      E'  - %s: %s overloads (arg counts: %s)\n',
      rec.proname, rec.overload_count, rec.arg_counts::text
    );
    v_violation_count := v_violation_count + 1;
  END LOOP;

  IF v_violation_count > 0 THEN
    RAISE EXCEPTION E'FAIL: Found % ambiguous rpc_* function overload(s):\n%PostgREST cannot disambiguate overloaded functions with DEFAULT parameters.',
      v_violation_count, v_violations;
  END IF;

  RAISE NOTICE 'PASS: No ambiguous rpc_* function overloads found';
END;
$$;

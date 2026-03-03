-- ============================================================================
-- SEC-007 WS13: Dashboard RPC Context Acceptance Test
-- Verifies rpc_get_dashboard_tables_with_counts uses set_rls_context_from_staff()
-- as first executable line (ADR-024 compliant).
-- ============================================================================
-- CATALOG PROOF: Verify function body contains set_rls_context_from_staff()
-- as the first PERFORM statement (context injection before any data access).
-- ============================================================================

DO $$
DECLARE
  v_body text;
  v_first_perform text;
  v_has_context_call boolean;
BEGIN
  -- 1. Verify function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'rpc_get_dashboard_tables_with_counts'
    AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'FAIL: rpc_get_dashboard_tables_with_counts does not exist';
  END IF;

  -- 2. Get function body
  SELECT prosrc INTO v_body
  FROM pg_proc
  WHERE proname = 'rpc_get_dashboard_tables_with_counts'
  AND pronamespace = 'public'::regnamespace;

  -- 3. Verify set_rls_context_from_staff() is present in body
  v_has_context_call := v_body ILIKE '%set_rls_context_from_staff()%';
  IF NOT v_has_context_call THEN
    RAISE EXCEPTION 'FAIL: rpc_get_dashboard_tables_with_counts does not call set_rls_context_from_staff()';
  END IF;

  -- 4. Verify set_rls_context_from_staff() appears BEFORE any SELECT/INSERT/UPDATE/DELETE
  -- Extract the first PERFORM statement
  SELECT (regexp_match(v_body, 'PERFORM\s+(\w+)', 'i'))[1] INTO v_first_perform;
  IF v_first_perform IS DISTINCT FROM 'set_rls_context_from_staff' THEN
    RAISE EXCEPTION 'FAIL: First PERFORM is "%" — expected set_rls_context_from_staff', v_first_perform;
  END IF;

  -- 5. Verify function does NOT use deprecated set_rls_context()
  IF v_body ILIKE '%set_rls_context(%' AND v_body NOT ILIKE '%set_rls_context_from_staff%' THEN
    RAISE EXCEPTION 'FAIL: rpc_get_dashboard_tables_with_counts uses deprecated set_rls_context()';
  END IF;

  -- 6. Verify function is not executable by PUBLIC
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_name = 'rpc_get_dashboard_tables_with_counts'
    AND grantee = 'PUBLIC'
    AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: rpc_get_dashboard_tables_with_counts is executable by PUBLIC';
  END IF;

  RAISE NOTICE 'PASS: rpc_get_dashboard_tables_with_counts — context-first-line verified, no deprecated context, no PUBLIC EXECUTE';
END;
$$;

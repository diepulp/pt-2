-- ============================================================================
-- SEC-008: Deprecated Function Body Check
-- Prevents regression from cherry-picks, rebases, or copy-paste of legacy RPCs.
--
-- Two checks:
--   1. RESURRECTION — set_rls_context(uuid,uuid,text,text) must not exist
--      in pg_proc. Dropped in 20260302230024. Any reappearance is P0.
--   2. BODY SCAN — No public function may call set_rls_context() in
--      executable code. Only set_rls_context_from_staff() and
--      set_rls_context_internal() are permitted.
--
-- Comment-aware: SQL single-line comments (-- ...) are stripped before
-- matching so that explanatory comments like "Replaces set_rls_context()"
-- do not trigger false positives.
--
-- Scope: ALL public functions, not just rpc_* prefix.
-- Supersedes: 05_deprecated_context_check.sh (bash, rpc_*-only)
-- ADR: ADR-024, SEC-007
-- ============================================================================

DO $$
DECLARE
  v_resurrected boolean;
  v_offenders text := '';
  v_offender_count int := 0;
  rec record;
  v_clean_body text;
BEGIN
  -- ======================================================================
  -- CHECK 1: Resurrection guard
  -- ======================================================================
  SELECT EXISTS(
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_rls_context'
  ) INTO v_resurrected;

  IF v_resurrected THEN
    RAISE EXCEPTION
      'FAIL [SEC-008-RESURRECTION]: set_rls_context() exists in catalog. '
      'Dropped in 20260302230024 — must not be recreated. '
      'Use set_rls_context_from_staff() per ADR-024.';
  END IF;

  -- ======================================================================
  -- CHECK 2: Body scan — all public functions
  --
  -- Strategy:
  --   a) Strip single-line SQL comments (-- ... to end of line)
  --   b) Strip approved variant names (_from_staff, _internal)
  --   c) Check if bare "set_rls_context(" remains in executable code
  -- ======================================================================
  FOR rec IN
    SELECT
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args,
      CASE p.prosecdef WHEN true THEN 'DEFINER' ELSE 'INVOKER' END AS sec,
      p.prosrc AS body
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ~* 'set_rls_context'
    ORDER BY p.proname
  LOOP
    -- Strip single-line comments
    v_clean_body := regexp_replace(rec.body, '--[^\n]*', '', 'g');
    -- Strip block comments
    v_clean_body := regexp_replace(v_clean_body, '/\*.*?\*/', '', 'gs');
    -- Strip string literals (single-quoted) to avoid matching inside SQL strings
    v_clean_body := regexp_replace(v_clean_body, '''[^'']*''', '', 'g');
    -- Remove approved variants so only bare deprecated calls remain
    v_clean_body := regexp_replace(v_clean_body, 'set_rls_context_from_staff', '', 'gi');
    v_clean_body := regexp_replace(v_clean_body, 'set_rls_context_internal', '', 'gi');

    -- Check for bare deprecated call in executable code
    IF v_clean_body ~* 'set_rls_context\s*\(' THEN
      v_offenders := v_offenders || format(
        E'  - %s(%s) [SECURITY %s]\n',
        rec.proname, rec.args, rec.sec
      );
      v_offender_count := v_offender_count + 1;
    END IF;
  END LOOP;

  IF v_offender_count > 0 THEN
    RAISE EXCEPTION
      E'FAIL [SEC-008-BODY]: % function(s) call deprecated set_rls_context():\n%'
      'Update to set_rls_context_from_staff() per ADR-024.',
      v_offender_count, v_offenders;
  END IF;

  RAISE NOTICE 'PASS [SEC-008]: No resurrection, zero bodies reference deprecated set_rls_context()';
END;
$$;

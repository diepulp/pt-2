-- ============================================================================
-- SEC-011: Outbox transport table access control (ADR-054 R3)
--
-- finance_outbox and processed_messages are service_role-only surfaces.
-- The authenticated role must be denied all direct table access; relay
-- workers and the cleanup cron are the only callers, using service_role.
--
-- Replaces the original pgTAP version (pgTAP failures are not detectable
-- via psql exit code; RAISE EXCEPTION is required for the gate runner).
-- ============================================================================

DO $$
DECLARE
  v_violations text := '';
  v_violation_count int := 0;
BEGIN

  -- ─── finance_outbox ────────────────────────────────────────────────────────

  IF has_table_privilege('authenticated', 'public.finance_outbox', 'SELECT') THEN
    v_violations := v_violations ||
      '  - authenticated has SELECT on finance_outbox' || E'\n';
    v_violation_count := v_violation_count + 1;
  END IF;

  IF has_table_privilege('authenticated', 'public.finance_outbox', 'INSERT') THEN
    v_violations := v_violations ||
      '  - authenticated has INSERT on finance_outbox (Phase 2.1 REVOKE not applied?)' || E'\n';
    v_violation_count := v_violation_count + 1;
  END IF;

  IF has_table_privilege('authenticated', 'public.finance_outbox', 'UPDATE') THEN
    v_violations := v_violations ||
      '  - authenticated has UPDATE on finance_outbox' || E'\n';
    v_violation_count := v_violation_count + 1;
  END IF;

  IF has_table_privilege('authenticated', 'public.finance_outbox', 'DELETE') THEN
    v_violations := v_violations ||
      '  - authenticated has DELETE on finance_outbox' || E'\n';
    v_violation_count := v_violation_count + 1;
  END IF;

  -- ─── processed_messages ────────────────────────────────────────────────────

  IF has_table_privilege('authenticated', 'public.processed_messages', 'SELECT') THEN
    v_violations := v_violations ||
      '  - authenticated has SELECT on processed_messages' || E'\n';
    v_violation_count := v_violation_count + 1;
  END IF;

  IF has_table_privilege('authenticated', 'public.processed_messages', 'INSERT') THEN
    v_violations := v_violations ||
      '  - authenticated has INSERT on processed_messages' || E'\n';
    v_violation_count := v_violation_count + 1;
  END IF;

  IF has_table_privilege('authenticated', 'public.processed_messages', 'UPDATE') THEN
    v_violations := v_violations ||
      '  - authenticated has UPDATE on processed_messages' || E'\n';
    v_violation_count := v_violation_count + 1;
  END IF;

  IF has_table_privilege('authenticated', 'public.processed_messages', 'DELETE') THEN
    v_violations := v_violations ||
      '  - authenticated has DELETE on processed_messages' || E'\n';
    v_violation_count := v_violation_count + 1;
  END IF;

  -- ─── Structural: RLS must be enabled on both tables ────────────────────────

  IF NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE relname = 'finance_outbox'
      AND relnamespace = 'public'::regnamespace
  ) THEN
    v_violations := v_violations ||
      '  - RLS is NOT enabled on finance_outbox' || E'\n';
    v_violation_count := v_violation_count + 1;
  END IF;

  IF NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE relname = 'processed_messages'
      AND relnamespace = 'public'::regnamespace
  ) THEN
    v_violations := v_violations ||
      '  - RLS is NOT enabled on processed_messages' || E'\n';
    v_violation_count := v_violation_count + 1;
  END IF;

  -- ─── Result ────────────────────────────────────────────────────────────────

  IF v_violation_count > 0 THEN
    RAISE EXCEPTION E'FAIL [SEC-011]: % outbox transport access violation(s):\n%See ADR-054 R3.',
      v_violation_count, v_violations;
  END IF;

  RAISE NOTICE 'PASS: finance_outbox and processed_messages inaccessible to authenticated role; RLS enabled on both';
END;
$$;

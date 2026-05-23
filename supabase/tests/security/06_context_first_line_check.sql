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
    -- Auth-flow functions with no staff JWT context available
    'rpc_get_rating_slip_duration',
    'rpc_bootstrap_casino',
    'rpc_accept_staff_invite',
    'rpc_register_company',
    'rpc_current_gaming_day',
    'rpc_gaming_day_range',
    -- Wave 2 outbox relay / lifecycle infrastructure (service_role-only — ADR-054 R3)
    -- These are invoked by the relay worker / cron with service_role credentials.
    -- No staff JWT context exists at call time; set_rls_context_from_staff() would fail.
    'rpc_claim_outbox_batch',
    'rpc_commit_consumer_receipt',
    'rpc_acknowledge_outbox_delivery',
    'rpc_get_outbox_relay_health',
    'rpc_get_outbox_event_page',
    'rpc_claim_class_a_outbox_batch',
    'rpc_process_class_a_projection',
    'rpc_claim_operational_outbox_batch',
    'rpc_process_operational_projection',
    'rpc_cleanup_outbox_processed',
    'rpc_close_gaming_day'
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

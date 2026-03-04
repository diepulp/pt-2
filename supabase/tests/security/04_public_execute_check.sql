-- ============================================================================
-- SEC-004: Public EXECUTE Check
-- Two-tier check:
--   HARD FAIL: SEC-007 fixed functions regress (REVOKE removed)
--   WARNING:   Pre-existing PUBLIC grants (P2 remediation backlog)
--
-- Auth-flow functions (rpc_bootstrap_casino, rpc_accept_staff_invite) are
-- allowlisted — they intentionally accept anon calls.
-- ============================================================================

DO $$
DECLARE
  -- Auth-flow functions that intentionally accept anon/PUBLIC
  v_allowlist text[] := ARRAY[
    'rpc_bootstrap_casino',
    'rpc_accept_staff_invite'
  ];

  -- SEC-007 WS9: These 10 functions were REVOKE'd from PUBLIC in migration
  -- 20260302223126_sec007_p1_revoke_public_batch.sql. Any regression is a P0.
  v_sec007_fixed text[] := ARRAY[
    'rpc_create_financial_txn',
    'rpc_create_financial_adjustment',
    'rpc_get_dashboard_stats',
    'rpc_get_rating_slip_modal_data',
    'rpc_get_dashboard_tables_with_counts',
    'rpc_list_active_players_casino_wide',
    'rpc_list_closed_slips_for_gaming_day',
    'rpc_shift_active_visitors_summary',
    'rpc_promo_exposure_rollup',
    'rpc_promo_coupon_inventory'
  ];

  v_regressions text := '';
  v_regression_count int := 0;
  v_warnings text := '';
  v_warning_count int := 0;
  rec record;
BEGIN
  FOR rec IN
    SELECT
      rp.routine_name,
      rp.grantee
    FROM information_schema.routine_privileges rp
    WHERE rp.routine_schema = 'public'
      AND rp.routine_name LIKE 'rpc_%'
      AND rp.grantee IN ('PUBLIC', 'anon')
      AND rp.privilege_type = 'EXECUTE'
      AND rp.routine_name != ALL(v_allowlist)
    ORDER BY rp.routine_name, rp.grantee
  LOOP
    IF rec.routine_name = ANY(v_sec007_fixed) THEN
      -- SEC-007 regression — hard fail
      v_regressions := v_regressions || format(
        E'  - %s: EXECUTE granted to %s (SEC-007 REGRESSION)\n',
        rec.routine_name, rec.grantee
      );
      v_regression_count := v_regression_count + 1;
    ELSE
      -- Pre-existing — warning only (P2 backlog)
      v_warnings := v_warnings || format(
        E'  - %s: EXECUTE granted to %s\n',
        rec.routine_name, rec.grantee
      );
      v_warning_count := v_warning_count + 1;
    END IF;
  END LOOP;

  -- Emit P2 backlog warnings (non-fatal)
  IF v_warning_count > 0 THEN
    RAISE NOTICE E'WARN: % pre-existing rpc_* function(s) with PUBLIC/anon EXECUTE (P2 backlog):\n%',
      v_warning_count, v_warnings;
  END IF;

  -- Hard fail on SEC-007 regressions
  IF v_regression_count > 0 THEN
    RAISE EXCEPTION E'FAIL: Found % SEC-007 regression(s) — REVOKE FROM PUBLIC was removed:\n%',
      v_regression_count, v_regressions;
  END IF;

  RAISE NOTICE 'PASS: All 10 SEC-007 functions verified — no PUBLIC/anon EXECUTE grants';
END;
$$;

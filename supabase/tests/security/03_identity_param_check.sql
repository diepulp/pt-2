-- ============================================================================
-- SEC-003: Identity Parameter Check (WS6 Prep — allowlist + drift check)
--
-- Three checks:
--   1. p_actor_id on any rpc_* → HARD FAIL (spoofable identity)
--   2. p_casino_id on rpc_* not in allowlist → FAIL (allowlist incomplete)
--   3. p_casino_id allowlist vs catalog drift → NOTICE for stale entries
--   4. p_created_by_staff_id → NOTICE (deferred pending delegation decision)
--
-- Per ADR-024, identity must be derived from JWT via set_rls_context_from_staff(),
-- never passed as a user-supplied parameter.
--
-- Allowlist: RPCs with known-deferred p_casino_id that are outside EXEC-041
-- WS1-WS5 scope. Generated from catalog on 2026-03-04.
-- ============================================================================

DO $$
DECLARE
  -- ── Corrected allowlist (14 entries, catalog-verified) ──────────
  -- These RPCs still carry p_casino_id and are known-deferred.
  -- Phantoms removed: rpc_compute_gaming_day, rpc_apply_mid_session_reward
  v_casino_id_allowlist text[] := ARRAY[
    -- Original EXEC-041 entries (8 verified)
    'rpc_create_financial_txn',
    'rpc_create_financial_adjustment',
    'rpc_issue_mid_session_reward',
    'rpc_start_rating_slip',
    'rpc_get_player_recent_sessions',
    'rpc_get_player_last_session_context',
    'rpc_get_rating_slip_modal_data',
    'rpc_get_dashboard_tables_with_counts',
    -- Loyalty context (deferred; still carries p_casino_id)
    'rpc_accrue_on_close',
    'rpc_apply_promotion',
    'rpc_get_player_ledger',
    'rpc_manual_credit',
    'rpc_reconcile_loyalty_balance',
    'rpc_redeem'
  ];

  v_violations text := '';
  v_violation_count int := 0;
  v_casino_warnings text := '';
  v_casino_warning_count int := 0;
  v_casino_new text := '';
  v_casino_new_count int := 0;
  v_staff_id_warnings text := '';
  v_staff_id_warning_count int := 0;
  v_stale text := '';
  v_stale_count int := 0;
  rec record;
  v_args text;
  v_entry text;
BEGIN
  -- ── CHECK 1: p_actor_id hard fail ────────────────────────────────
  FOR rec IN
    SELECT p.proname, pg_get_function_arguments(p.oid) AS func_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'rpc_%'
      AND 'p_actor_id' = ANY(p.proargnames)
    ORDER BY p.proname
  LOOP
    v_violations := v_violations || format(E'  - %s(%s)\n', rec.proname, rec.func_args);
    v_violation_count := v_violation_count + 1;
  END LOOP;

  IF v_violation_count > 0 THEN
    RAISE EXCEPTION E'FAIL [SEC-003]: % rpc_* function(s) with spoofable p_actor_id (ADR-024 violation):\n%',
      v_violation_count, v_violations;
  END IF;

  -- ── CHECK 2: p_casino_id — allowlisted vs new ───────────────────
  FOR rec IN
    SELECT p.proname, pg_get_function_arguments(p.oid) AS func_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'rpc_%'
      AND 'p_casino_id' = ANY(p.proargnames)
    ORDER BY p.proname
  LOOP
    IF rec.proname = ANY(v_casino_id_allowlist) THEN
      -- Known deferred — notice only
      v_casino_warnings := v_casino_warnings || format(E'  - %s (allowlisted)\n', rec.proname);
      v_casino_warning_count := v_casino_warning_count + 1;
    ELSE
      -- In catalog but NOT allowlisted — drift or new RPC
      v_casino_new := v_casino_new || format(E'  - %s(%s)\n', rec.proname, rec.func_args);
      v_casino_new_count := v_casino_new_count + 1;
    END IF;
  END LOOP;

  -- ── CHECK 3: Allowlist drift — stale entries ─────────────────────
  FOREACH v_entry IN ARRAY v_casino_id_allowlist
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = v_entry
        AND 'p_casino_id' = ANY(p.proargnames)
    ) THEN
      v_stale := v_stale || format(E'  - %s\n', v_entry);
      v_stale_count := v_stale_count + 1;
    END IF;
  END LOOP;

  -- ── CHECK 4: p_created_by_staff_id — notice only ─────────────────
  FOR rec IN
    SELECT p.proname, pg_get_function_arguments(p.oid) AS func_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'rpc_%'
      AND 'p_created_by_staff_id' = ANY(p.proargnames)
    ORDER BY p.proname
  LOOP
    v_staff_id_warnings := v_staff_id_warnings || format(E'  - %s (delegation param, deferred)\n', rec.proname);
    v_staff_id_warning_count := v_staff_id_warning_count + 1;
  END LOOP;

  -- ── Emit results ─────────────────────────────────────────────────

  -- Stale allowlist entries (warn, don't fail)
  IF v_stale_count > 0 THEN
    RAISE NOTICE E'WARN [SEC-003-DRIFT]: % allowlist entry/entries not found in catalog (stale):\n%',
      v_stale_count, v_stale;
  END IF;

  -- Allowlisted p_casino_id → HARD FAIL (WS6 enforcement)
  -- These RPCs must remove p_casino_id and derive from set_rls_context_from_staff().
  IF v_casino_warning_count > 0 THEN
    RAISE EXCEPTION E'FAIL [SEC-003]: % rpc_* function(s) still accept p_casino_id (ADR-024 violation):\n%Remove parameter and derive casino_id from set_rls_context_from_staff() session vars.',
      v_casino_warning_count, v_casino_warnings;
  END IF;

  -- Un-allowlisted p_casino_id RPCs in catalog → FAIL (allowlist incomplete)
  -- This is NOT the WS6 enforcement flip — this catches allowlist drift.
  -- If the catalog changed under you (rebase, cherry-pick), this screams.
  IF v_casino_new_count > 0 THEN
    RAISE EXCEPTION E'FAIL [SEC-003-DRIFT]: % rpc_* function(s) with p_casino_id NOT in allowlist:\n%Update the allowlist in 03_identity_param_check.sql or remove the parameter.',
      v_casino_new_count, v_casino_new;
  END IF;

  -- p_created_by_staff_id (notice, INV-8 deferred)
  IF v_staff_id_warning_count > 0 THEN
    RAISE NOTICE E'INFO [SEC-003]: % rpc_* function(s) with p_created_by_staff_id (deferred INV-8):\n%',
      v_staff_id_warning_count, v_staff_id_warnings;
  END IF;

  RAISE NOTICE 'PASS [SEC-003]: No p_actor_id violations; p_casino_id allowlist checked; drift checked';
END;
$$;

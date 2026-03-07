-- ============================================================================
-- SEC-003: Identity Parameter Check (ADR-040 expanded)
--
-- Six checks:
--   1. p_actor_id on any rpc_* → HARD FAIL (spoofable identity)
--   2. p_casino_id on rpc_* not in allowlist → FAIL (zero-tolerance)
--   3. p_casino_id allowlist drift → NOTICE for stale entries
--   4. Category A identity params → HARD FAIL (spoofable delegation)
--   5. Category B attribution params not in allowlist → HARD FAIL
--   6. Category B allowlist drift → NOTICE for stale entries
--
-- Per ADR-024, identity must be derived from JWT via set_rls_context_from_staff(),
-- never passed as a user-supplied parameter.
--
-- Per ADR-040, Category A params (actor identity) must be derived from context.
-- Category B params (multi-party attestation) are allowed with same-casino
-- validation and explicit allowlist governance.
--
-- Allowlist: EMPTY for p_casino_id (all removed by PRD-043 + PRD-044).
-- Zero-tolerance enforcement active since 2026-03-06.
-- ============================================================================

DO $$
DECLARE
  -- ── p_casino_id Allowlist (EMPTY — all removed by PRD-043 + PRD-044) ──
  v_casino_id_allowlist text[] := ARRAY[]::text[];

  -- ── Category B Allowlist (ADR-040 §6) ──
  -- Format: {param_name, owning_rpc, category, rationale, validation_rule}
  v_category_b_allowlist text[][] := ARRAY[
    ARRAY['p_witnessed_by', 'rpc_log_table_drop', 'B', 'ADR-040: multi-party drop witness', 'staff.casino_id check'],
    ARRAY['p_verified_by', 'rpc_log_table_inventory_snapshot', 'B', 'ADR-040: inventory verification', 'staff.casino_id check'],
    ARRAY['p_sent_by', 'rpc_request_table_credit', 'B', 'ADR-040: credit sender attestation', 'staff.casino_id check'],
    ARRAY['p_delivered_by', 'rpc_request_table_fill', 'B', 'ADR-040: fill delivery attestation', 'staff.casino_id check'],
    ARRAY['p_received_by', 'rpc_request_table_fill', 'B', 'ADR-040: fill receipt attestation', 'staff.casino_id check'],
    ARRAY['p_received_by', 'rpc_request_table_credit', 'B', 'ADR-040: credit receipt attestation', 'staff.casino_id check']
  ];

  v_violations text := '';
  v_violation_count int := 0;
  v_casino_warnings text := '';
  v_casino_warning_count int := 0;
  v_casino_new text := '';
  v_casino_new_count int := 0;
  v_stale text := '';
  v_stale_count int := 0;
  v_cat_a_violations text := '';
  v_cat_a_count int := 0;
  v_cat_b_violations text := '';
  v_cat_b_count int := 0;
  v_cat_b_stale text := '';
  v_cat_b_stale_count int := 0;
  rec record;
  v_entry text;
  v_arg_name text;
  v_is_allowlisted boolean;
  v_i int;
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

  -- ── CHECK 4: Category A identity params — HARD FAIL ─────────────
  -- Scans for spoofable identity params per ADR-040 Appendix A:
  --   p_%_staff_id, p_created_by_%, p_issued_by_%, p_awarded_by_%, p_approved_by_%
  -- Excludes params that are explicitly allowlisted as Category B for that (param, rpc) pair.
  FOR rec IN
    SELECT p.proname, p.proargnames, pg_get_function_arguments(p.oid) AS func_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'rpc_%'
      AND p.proargnames IS NOT NULL
    ORDER BY p.proname
  LOOP
    IF rec.proargnames IS NOT NULL THEN
      FOREACH v_arg_name IN ARRAY rec.proargnames
      LOOP
        -- Skip NULL entries in proargnames (output params can be NULL-named)
        IF v_arg_name IS NULL THEN
          CONTINUE;
        END IF;

        -- Check Category A patterns
        IF v_arg_name LIKE 'p\_%\_staff\_id' OR
           v_arg_name LIKE 'p\_created\_by\_%' OR
           v_arg_name LIKE 'p\_issued\_by\_%' OR
           v_arg_name LIKE 'p\_awarded\_by\_%' OR
           v_arg_name LIKE 'p\_approved\_by\_%' THEN

          -- Check if this (param, rpc) pair is in the Category B allowlist
          v_is_allowlisted := false;
          FOR v_i IN 1..array_length(v_category_b_allowlist, 1) LOOP
            IF v_category_b_allowlist[v_i][1] = v_arg_name
               AND v_category_b_allowlist[v_i][2] = rec.proname THEN
              v_is_allowlisted := true;
              EXIT;
            END IF;
          END LOOP;

          IF NOT v_is_allowlisted THEN
            v_cat_a_violations := v_cat_a_violations || format(E'  - %s.%s (%s)\n', rec.proname, v_arg_name, rec.func_args);
            v_cat_a_count := v_cat_a_count + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- ── CHECK 5: Category B attribution params — allowlist-gated FAIL ──
  -- Scans for multi-party attestation params and validates each is in allowlist.
  FOR rec IN
    SELECT p.proname, p.proargnames, pg_get_function_arguments(p.oid) AS func_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'rpc_%'
      AND p.proargnames IS NOT NULL
    ORDER BY p.proname
  LOOP
    IF rec.proargnames IS NOT NULL THEN
      FOREACH v_arg_name IN ARRAY rec.proargnames
      LOOP
        IF v_arg_name IS NULL THEN
          CONTINUE;
        END IF;

        -- Check Category B patterns
        IF v_arg_name IN ('p_witnessed_by', 'p_verified_by', 'p_sent_by', 'p_delivered_by', 'p_received_by') THEN
          -- Verify this (param, rpc) pair is in the Category B allowlist
          v_is_allowlisted := false;
          FOR v_i IN 1..array_length(v_category_b_allowlist, 1) LOOP
            IF v_category_b_allowlist[v_i][1] = v_arg_name
               AND v_category_b_allowlist[v_i][2] = rec.proname THEN
              v_is_allowlisted := true;
              EXIT;
            END IF;
          END LOOP;

          IF NOT v_is_allowlisted THEN
            v_cat_b_violations := v_cat_b_violations || format(E'  - %s.%s (not in Category B allowlist)\n', rec.proname, v_arg_name);
            v_cat_b_count := v_cat_b_count + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- ── CHECK 6: Category B allowlist drift — stale entries ────────────
  FOR v_i IN 1..array_length(v_category_b_allowlist, 1) LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = v_category_b_allowlist[v_i][2]
        AND v_category_b_allowlist[v_i][1] = ANY(p.proargnames)
    ) THEN
      v_cat_b_stale := v_cat_b_stale || format(E'  - %s.%s (%s)\n',
        v_category_b_allowlist[v_i][2],
        v_category_b_allowlist[v_i][1],
        v_category_b_allowlist[v_i][4]);
      v_cat_b_stale_count := v_cat_b_stale_count + 1;
    END IF;
  END LOOP;

  -- ── Emit results ─────────────────────────────────────────────────

  -- Stale p_casino_id allowlist entries (warn, don't fail)
  IF v_stale_count > 0 THEN
    RAISE NOTICE E'WARN [SEC-003-DRIFT]: % p_casino_id allowlist entry/entries not found in catalog (stale):\n%',
      v_stale_count, v_stale;
  END IF;

  -- Zero tolerance: any p_casino_id on allowlisted RPCs is now a hard fail.
  IF v_casino_warning_count > 0 THEN
    RAISE EXCEPTION E'FAIL [SEC-003]: % rpc_* function(s) with allowlisted p_casino_id (zero-tolerance enforced):\n%',
      v_casino_warning_count, v_casino_warnings;
  END IF;

  -- Un-allowlisted p_casino_id RPCs in catalog → FAIL
  IF v_casino_new_count > 0 THEN
    RAISE EXCEPTION E'FAIL [SEC-003-DRIFT]: % rpc_* function(s) with p_casino_id NOT in allowlist:\n%Update the allowlist in 03_identity_param_check.sql or remove the parameter.',
      v_casino_new_count, v_casino_new;
  END IF;

  -- Category A violations → HARD FAIL
  IF v_cat_a_count > 0 THEN
    RAISE EXCEPTION E'FAIL [SEC-003-CAT-A]: % rpc_* param(s) match Category A identity patterns (ADR-040 violation):\n%These params must be derived from context, not client-supplied.',
      v_cat_a_count, v_cat_a_violations;
  END IF;

  -- Category B violations → HARD FAIL
  IF v_cat_b_count > 0 THEN
    RAISE EXCEPTION E'FAIL [SEC-003-CAT-B]: % rpc_* param(s) match Category B patterns but are NOT in allowlist:\n%Add to v_category_b_allowlist with governance metadata or remove the parameter.',
      v_cat_b_count, v_cat_b_violations;
  END IF;

  -- Stale Category B allowlist entries (warn, don't fail)
  IF v_cat_b_stale_count > 0 THEN
    RAISE NOTICE E'WARN [SEC-003-CAT-B-DRIFT]: % Category B allowlist entry/entries not found in catalog (stale):\n%',
      v_cat_b_stale_count, v_cat_b_stale;
  END IF;

  RAISE NOTICE 'PASS [SEC-003]: All identity parameter checks passed (Checks 1-6)';
END;
$$;

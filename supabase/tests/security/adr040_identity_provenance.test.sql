-- ============================================================================
-- ADR-040 Identity Provenance Integration Tests
--
-- Proves ADR-040 enforcement:
--   1. Category A: spoofable identity params removed from loyalty RPCs
--   2. Category A: context derivation block present in loyalty RPCs
--   3. Category B: same-casino staff validation present in chip custody RPCs
--   4. Category B: validation covers all required params
--
-- Pattern: Catalog proof + function body assertions (matches SEC-003 style)
-- ============================================================================

DO $$
DECLARE
  v_body text;
  v_old_sig_count int;
  v_failures text := '';
  v_failure_count int := 0;
  rec record;
BEGIN
  -- ══════════════════════════════════════════════════════════════════════
  -- TEST 1: Category A — old rpc_redeem signature (8 params) must not exist
  -- ══════════════════════════════════════════════════════════════════════
  SELECT count(*) INTO v_old_sig_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'rpc_redeem'
    AND 'p_issued_by_staff_id' = ANY(p.proargnames);

  IF v_old_sig_count > 0 THEN
    v_failures := v_failures || E'  - rpc_redeem still has p_issued_by_staff_id parameter\n';
    v_failure_count := v_failure_count + 1;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- TEST 2: Category A — old rpc_manual_credit signature (5 params) must not exist
  -- ══════════════════════════════════════════════════════════════════════
  SELECT count(*) INTO v_old_sig_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'rpc_manual_credit'
    AND 'p_awarded_by_staff_id' = ANY(p.proargnames);

  IF v_old_sig_count > 0 THEN
    v_failures := v_failures || E'  - rpc_manual_credit still has p_awarded_by_staff_id parameter\n';
    v_failure_count := v_failure_count + 1;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- TEST 3: Category A — rpc_redeem derives actor from context
  -- ══════════════════════════════════════════════════════════════════════
  SELECT prosrc INTO v_body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_redeem';

  IF v_body IS NULL THEN
    v_failures := v_failures || E'  - rpc_redeem does not exist\n';
    v_failure_count := v_failure_count + 1;
  ELSE
    -- Must contain context derivation pattern
    IF v_body NOT ILIKE '%v_context_actor_id%:=%current_setting(%''app.actor_id''%)%' THEN
      v_failures := v_failures || E'  - rpc_redeem missing v_context_actor_id derivation from app.actor_id\n';
      v_failure_count := v_failure_count + 1;
    END IF;

    -- Must call set_rls_context_from_staff()
    IF v_body NOT ILIKE '%set_rls_context_from_staff()%' THEN
      v_failures := v_failures || E'  - rpc_redeem missing set_rls_context_from_staff() call\n';
      v_failure_count := v_failure_count + 1;
    END IF;

    -- Must use v_context_actor_id in ledger INSERT (staff_id column)
    IF v_body NOT ILIKE '%v_context_actor_id%' THEN
      v_failures := v_failures || E'  - rpc_redeem does not use v_context_actor_id\n';
      v_failure_count := v_failure_count + 1;
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- TEST 4: Category A — rpc_manual_credit derives actor from context
  -- ══════════════════════════════════════════════════════════════════════
  SELECT prosrc INTO v_body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_manual_credit';

  IF v_body IS NULL THEN
    v_failures := v_failures || E'  - rpc_manual_credit does not exist\n';
    v_failure_count := v_failure_count + 1;
  ELSE
    IF v_body NOT ILIKE '%v_context_actor_id%:=%current_setting(%''app.actor_id''%)%' THEN
      v_failures := v_failures || E'  - rpc_manual_credit missing v_context_actor_id derivation from app.actor_id\n';
      v_failure_count := v_failure_count + 1;
    END IF;

    IF v_body NOT ILIKE '%set_rls_context_from_staff()%' THEN
      v_failures := v_failures || E'  - rpc_manual_credit missing set_rls_context_from_staff() call\n';
      v_failure_count := v_failure_count + 1;
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- TEST 5: Category B — rpc_log_table_drop validates p_witnessed_by
  -- ══════════════════════════════════════════════════════════════════════
  SELECT prosrc INTO v_body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_log_table_drop';

  IF v_body IS NULL THEN
    v_failures := v_failures || E'  - rpc_log_table_drop does not exist\n';
    v_failure_count := v_failure_count + 1;
  ELSE
    IF v_body NOT ILIKE '%p_witnessed_by%casino_id%v_casino_id%' THEN
      v_failures := v_failures || E'  - rpc_log_table_drop missing same-casino validation for p_witnessed_by\n';
      v_failure_count := v_failure_count + 1;
    END IF;
    IF v_body NOT ILIKE '%SEC-007%' THEN
      v_failures := v_failures || E'  - rpc_log_table_drop missing SEC-007 error tag in validation\n';
      v_failure_count := v_failure_count + 1;
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- TEST 6: Category B — rpc_log_table_inventory_snapshot validates p_verified_by
  -- ══════════════════════════════════════════════════════════════════════
  SELECT prosrc INTO v_body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_log_table_inventory_snapshot';

  IF v_body IS NULL THEN
    v_failures := v_failures || E'  - rpc_log_table_inventory_snapshot does not exist\n';
    v_failure_count := v_failure_count + 1;
  ELSE
    -- NULL-guarded validation (p_verified_by is optional)
    IF v_body NOT ILIKE '%p_verified_by IS NOT NULL%' THEN
      v_failures := v_failures || E'  - rpc_log_table_inventory_snapshot missing NULL guard for p_verified_by\n';
      v_failure_count := v_failure_count + 1;
    END IF;
    IF v_body NOT ILIKE '%p_verified_by%casino_id%v_casino_id%' THEN
      v_failures := v_failures || E'  - rpc_log_table_inventory_snapshot missing same-casino validation for p_verified_by\n';
      v_failure_count := v_failure_count + 1;
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- TEST 7: Category B — rpc_request_table_fill validates p_delivered_by, p_received_by
  -- ══════════════════════════════════════════════════════════════════════
  SELECT prosrc INTO v_body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_request_table_fill';

  IF v_body IS NULL THEN
    v_failures := v_failures || E'  - rpc_request_table_fill does not exist\n';
    v_failure_count := v_failure_count + 1;
  ELSE
    IF v_body NOT ILIKE '%p_delivered_by%casino_id%v_casino_id%' THEN
      v_failures := v_failures || E'  - rpc_request_table_fill missing same-casino validation for p_delivered_by\n';
      v_failure_count := v_failure_count + 1;
    END IF;
    IF v_body NOT ILIKE '%p_received_by%casino_id%v_casino_id%' THEN
      v_failures := v_failures || E'  - rpc_request_table_fill missing same-casino validation for p_received_by\n';
      v_failure_count := v_failure_count + 1;
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- TEST 8: Category B — rpc_request_table_credit validates p_sent_by, p_received_by
  -- ══════════════════════════════════════════════════════════════════════
  SELECT prosrc INTO v_body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_request_table_credit';

  IF v_body IS NULL THEN
    v_failures := v_failures || E'  - rpc_request_table_credit does not exist\n';
    v_failure_count := v_failure_count + 1;
  ELSE
    IF v_body NOT ILIKE '%p_sent_by%casino_id%v_casino_id%' THEN
      v_failures := v_failures || E'  - rpc_request_table_credit missing same-casino validation for p_sent_by\n';
      v_failure_count := v_failure_count + 1;
    END IF;
    IF v_body NOT ILIKE '%p_received_by%casino_id%v_casino_id%' THEN
      v_failures := v_failures || E'  - rpc_request_table_credit missing same-casino validation for p_received_by\n';
      v_failure_count := v_failure_count + 1;
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- TEST 9: Category A — actor_id NULL check (fail-closed guard)
  -- ══════════════════════════════════════════════════════════════════════
  FOR rec IN
    SELECT p.proname, p.prosrc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('rpc_redeem', 'rpc_manual_credit')
  LOOP
    IF rec.prosrc NOT ILIKE '%v_context_actor_id IS NULL%' THEN
      v_failures := v_failures || format(E'  - %s missing fail-closed NULL guard for v_context_actor_id\n', rec.proname);
      v_failure_count := v_failure_count + 1;
    END IF;
  END LOOP;

  -- ══════════════════════════════════════════════════════════════════════
  -- RESULTS
  -- ══════════════════════════════════════════════════════════════════════
  IF v_failure_count > 0 THEN
    RAISE EXCEPTION E'FAIL [ADR-040]: % identity provenance check(s) failed:\n%',
      v_failure_count, v_failures;
  END IF;

  RAISE NOTICE 'PASS [ADR-040]: All identity provenance checks passed (9 tests, Category A + Category B)';
END;
$$;

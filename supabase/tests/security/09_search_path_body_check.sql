-- ============================================================================
-- SEC-009: Search Path / Function Body Consistency Check
-- Detects functions with restrictive search_path (empty or missing 'public')
-- whose bodies contain unqualified table references.
--
-- Background: Setting search_path = '' via ALTER FUNCTION without rewriting
-- the function body breaks runtime resolution of unqualified references
-- (e.g., FROM casino_settings fails when search_path is empty because
-- Postgres cannot resolve the table without the public schema in the path).
--
-- This gate queries pg_proc for functions in the public schema that have
-- search_path set to '' (empty) and scans their prosrc for FROM/JOIN/INTO
-- clauses referencing tables without a schema qualifier.
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
  v_violations text := '';
  v_violation_count int := 0;
  -- Tables known to live in public schema (add new tables as needed)
  v_public_tables text[] := ARRAY[
    'casino', 'casino_settings', 'company', 'staff', 'staff_pin_attempts',
    'gaming_table', 'game_settings', 'game_settings_side_bet',
    'player', 'player_casino', 'player_identity', 'player_loyalty',
    'player_note', 'player_tag', 'player_exclusion', 'player_financial_transaction',
    'visit', 'rating_slip', 'rating_slip_pause',
    'table_session', 'table_buyin_telemetry', 'table_opening_attestation',
    'table_rundown_report', 'table_metric_baseline',
    'shift_checkpoint', 'shift_alert', 'alert_acknowledgment',
    'mtl_entry', 'mtl_audit_note',
    'loyalty_ledger', 'loyalty_outbox', 'loyalty_valuation_policy',
    'loyalty_liability_snapshot', 'loyalty_earn_config', 'reward_catalog',
    'promo_program', 'promo_coupon',
    'pit_cash_observation', 'onboarding_registration', 'staff_invite',
    'import_batch', 'import_batch_row'
  ];
  v_table text;
BEGIN
  -- Find all public-schema functions with search_path = '' (empty string)
  FOR rec IN
    SELECT
      p.proname AS func_name,
      pg_get_function_identity_arguments(p.oid) AS func_args,
      p.prosrc AS func_body,
      array_to_string(p.proconfig, ', ') AS config
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proconfig IS NOT NULL
      AND (
        -- search_path is empty string
        p.proconfig @> ARRAY['search_path=']
        -- or search_path is explicitly set to empty quotes
        OR p.proconfig @> ARRAY['search_path=""']
      )
      AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
  LOOP
    -- Check function body for unqualified references to known public tables
    FOREACH v_table IN ARRAY v_public_tables
    LOOP
      -- Match patterns like: FROM table_name, JOIN table_name, INTO table_name
      -- but NOT: FROM public.table_name (already qualified)
      -- Uses word boundary matching to avoid false positives on substrings
      IF rec.func_body ~* (
        '(FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+' || v_table || '\b'
      )
      AND rec.func_body !~* (
        '(FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+public\.' || v_table || '\b'
      )
      THEN
        v_violations := v_violations || format(
          E'  - Function %s(%s): unqualified reference to table "%s"\n',
          rec.func_name, rec.func_args, v_table
        );
        v_violation_count := v_violation_count + 1;
      END IF;
    END LOOP;

    -- Also check for unqualified function calls to known context/utility functions
    IF rec.func_body ~ '\bset_rls_context_from_staff\s*\('
       AND rec.func_body !~ '\bpublic\.set_rls_context_from_staff\s*\('
    THEN
      v_violations := v_violations || format(
        E'  - Function %s(%s): unqualified call to set_rls_context_from_staff()\n',
        rec.func_name, rec.func_args
      );
      v_violation_count := v_violation_count + 1;
    END IF;

    IF rec.func_body ~ '\bcompute_gaming_day\s*\('
       AND rec.func_body !~ '\bpublic\.compute_gaming_day\s*\('
    THEN
      v_violations := v_violations || format(
        E'  - Function %s(%s): unqualified call to compute_gaming_day()\n',
        rec.func_name, rec.func_args
      );
      v_violation_count := v_violation_count + 1;
    END IF;
  END LOOP;

  IF v_violation_count > 0 THEN
    RAISE EXCEPTION E'FAIL: Found % search_path/body inconsistency violation(s):\n%\nFunctions with search_path='''' must use schema-qualified references (public.table_name).\nUse CREATE OR REPLACE to rewrite function bodies before setting search_path = ''''.',
      v_violation_count, v_violations;
  END IF;

  RAISE NOTICE 'PASS: All functions with restrictive search_path use schema-qualified references';
END;
$$;

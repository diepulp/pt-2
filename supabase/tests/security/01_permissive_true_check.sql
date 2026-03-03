-- ============================================================================
-- SEC-001: Permissive TRUE Check
-- Scans pg_policy for any tenant-scoped table with permissive policies
-- containing USING(true) or WITH CHECK(true). No allowlist — zero tolerance.
-- ============================================================================

DO $$
DECLARE
  v_tenant_tables text[] := ARRAY[
    'staff', 'visit', 'player', 'rating_slip', 'gaming_table',
    'audit_log', 'casino_settings', 'loyalty_ledger', 'player_loyalty',
    'promo_program', 'promo_coupon', 'report', 'table_inventory_snapshot'
  ];
  v_table text;
  v_violations text := '';
  v_violation_count int := 0;
  rec record;
BEGIN
  FOREACH v_table IN ARRAY v_tenant_tables
  LOOP
    FOR rec IN
      SELECT
        pol.polname   AS policy_name,
        cls.relname   AS table_name,
        CASE pol.polpermissive WHEN TRUE THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS policy_type,
        pg_get_expr(pol.polqual, pol.polrelid)   AS using_expr,
        pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expr
      FROM pg_policy pol
      JOIN pg_class cls ON cls.oid = pol.polrelid
      JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
      WHERE cls.relname = v_table
        AND nsp.nspname = 'public'
        AND pol.polpermissive = TRUE
    LOOP
      -- Check USING(true)
      IF rec.using_expr IS NOT NULL AND trim(rec.using_expr) = 'true' THEN
        v_violations := v_violations || format(
          E'  - Table "%s", policy "%s": USING(true)\n',
          rec.table_name, rec.policy_name
        );
        v_violation_count := v_violation_count + 1;
      END IF;

      -- Check WITH CHECK(true)
      IF rec.with_check_expr IS NOT NULL AND trim(rec.with_check_expr) = 'true' THEN
        v_violations := v_violations || format(
          E'  - Table "%s", policy "%s": WITH CHECK(true)\n',
          rec.table_name, rec.policy_name
        );
        v_violation_count := v_violation_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  IF v_violation_count > 0 THEN
    RAISE EXCEPTION E'FAIL: Found % permissive-true violation(s) on tenant-scoped tables:\n%',
      v_violation_count, v_violations;
  END IF;

  RAISE NOTICE 'PASS: No permissive USING(true) or WITH CHECK(true) policies found on % tenant-scoped tables',
    array_length(v_tenant_tables, 1);
END;
$$;

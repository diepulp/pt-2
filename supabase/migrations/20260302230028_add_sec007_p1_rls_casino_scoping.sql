-- ============================================================================
-- SEC-007 P1 RLS Casino Scoping + WITH CHECK
-- Fixes: P1-1 (audit_log SELECT), P1-2 (report), P1-3 (table_inventory_snapshot),
--        P1-4 (promo_program/promo_coupon UPDATE WITH CHECK)
-- Source: SEC-007 Tenant Isolation Enforcement Contract (EXEC-040)
-- ADR: ADR-015, ADR-020
-- ============================================================================

-- P1-1: audit_log SELECT — add Pattern C casino_id scoping
-- Currently: role check only (admin/pit_boss), no casino_id = cross-tenant read
DROP POLICY IF EXISTS audit_log_select ON audit_log;
CREATE POLICY audit_log_select ON audit_log
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('admin', 'pit_boss')
  );

-- P1-2: report SELECT — add Pattern C casino_id scoping
-- Currently: staff subquery (admin/pit_boss), no casino_id
DROP POLICY IF EXISTS report_select ON report;
CREATE POLICY report_select ON report
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('admin', 'pit_boss')
  );

-- P1-2: report INSERT — add Pattern C casino_id scoping
DROP POLICY IF EXISTS report_insert ON report;
CREATE POLICY report_insert ON report
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('admin')
  );

-- P1-3: table_inventory_snapshot INSERT — add Pattern C casino_id scoping
-- Currently: only auth.uid() IS NOT NULL — any tenant can insert to any casino
DROP POLICY IF EXISTS table_inventory_snapshot_insert ON table_inventory_snapshot;
CREATE POLICY table_inventory_snapshot_insert ON table_inventory_snapshot
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- P1-4: promo_program UPDATE — add explicit WITH CHECK for casino_id
-- Currently: USING has casino_id but no WITH CHECK = could write to wrong casino
DROP POLICY IF EXISTS promo_program_update_staff ON promo_program;
CREATE POLICY promo_program_update_staff ON promo_program
  FOR UPDATE USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- P1-4: promo_coupon UPDATE — add explicit WITH CHECK for casino_id
DROP POLICY IF EXISTS promo_coupon_update_staff ON promo_coupon;
CREATE POLICY promo_coupon_update_staff ON promo_coupon
  FOR UPDATE USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

NOTIFY pgrst, 'reload schema';

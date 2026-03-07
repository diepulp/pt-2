-- ============================================================================
-- SEC-007 P0 RLS Remediation
-- Fixes: P0-1 (staff), P0-2 (audit_log), P0-3 (casino_settings)
-- Source: SEC-007 Tenant Isolation Enforcement Contract (EXEC-040)
-- ADR: ADR-015, ADR-020, ADR-030
-- ============================================================================
-- P0-1: staff.staff_read uses USING(true) — exposes ALL staff across tenants
--        Fix: Pattern C hybrid with casino_id scoping
-- P0-2: audit_log.audit_log_insert uses WITH CHECK(true) — any tenant can
--        poison another tenant's audit trail
--        Fix: session-var-only write path + REVOKE direct INSERT
-- P0-3: casino_settings.casino_settings_all_operations uses FOR ALL with no
--        role gate — any authenticated user can UPDATE/INSERT/DELETE settings
--        Fix: split into 4 operation-specific policies with role gates
-- ============================================================================

-- P0-1: staff SELECT — replace USING(true) with Pattern C
DROP POLICY IF EXISTS staff_read ON staff;
CREATE POLICY staff_read ON staff
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- P0-2: audit_log INSERT — session-var-only write path + REVOKE direct INSERT
DROP POLICY IF EXISTS audit_log_insert ON audit_log;
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = NULLIF((select current_setting('app.casino_id', true)), '')::uuid
    AND actor_id = NULLIF((select current_setting('app.actor_id', true)), '')::uuid
  );
REVOKE INSERT ON audit_log FROM authenticated;

-- P0-3: casino_settings — split FOR ALL into operation-specific policies
DROP POLICY IF EXISTS casino_settings_all_operations ON casino_settings;

CREATE POLICY casino_settings_select ON casino_settings
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY casino_settings_update ON casino_settings
  FOR UPDATE USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('admin', 'pit_boss')
  )
  WITH CHECK (
    casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY casino_settings_insert ON casino_settings
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

CREATE POLICY casino_settings_no_delete ON casino_settings
  FOR DELETE USING (
    (select auth.uid()) IS NOT NULL AND false
  );

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════
-- PRD-030: Fix gaming_table INSERT/UPDATE policies to use COALESCE
-- ═══════════════════════════════════════════════════════════════════════
--
-- gaming_table is NOT on the ADR-030 critical tables list (staff, player,
-- player_financial_transaction, visit, rating_slip, loyalty_ledger).
-- Its INSERT/UPDATE policies incorrectly require session vars only,
-- blocking PostgREST writes where SET LOCAL vars from
-- set_rls_context_from_staff() don't persist across requests.
--
-- Fix: Align INSERT/UPDATE with the existing SELECT policy which already
-- uses Pattern C (COALESCE with JWT fallback).
--
-- References: ADR-015, ADR-020, ADR-030 §D4 (critical tables list)
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Drop existing restrictive INSERT policy
DROP POLICY IF EXISTS gaming_table_insert_admin ON gaming_table;

-- 2. Recreate INSERT policy with COALESCE pattern + role gate
CREATE POLICY gaming_table_insert_admin ON gaming_table
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      ((auth.jwt() -> 'app_metadata' ->> 'casino_id'))::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- 3. Drop existing restrictive UPDATE policy
DROP POLICY IF EXISTS gaming_table_update_admin ON gaming_table;

-- 4. Recreate UPDATE policy with COALESCE pattern + role gate
CREATE POLICY gaming_table_update_admin ON gaming_table
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      ((auth.jwt() -> 'app_metadata' ->> 'casino_id'))::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      ((auth.jwt() -> 'app_metadata' ->> 'casino_id'))::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

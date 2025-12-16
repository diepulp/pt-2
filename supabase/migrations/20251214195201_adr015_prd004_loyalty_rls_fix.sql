-- ============================================================================
-- Migration: ADR-015 PRD-004 Loyalty RLS Policy Fix
-- ============================================================================
-- Created: 2025-12-14 19:52:01
-- Status: Hotfix for PRD-004 Loyalty Service RLS Policies
-- ADR: ADR-015 (Connection Pooling Strategy - Pattern C)
-- Reference: supabase/migrations/20251213003000_prd004_loyalty_service_schema.sql
--
-- ISSUE: Broken RLS policies in PRD-004 causing 500 errors:
--   - Missing NULLIF wrapper on current_setting()
--   - Wrong JWT path (missing app_metadata)
--
-- BROKEN PATTERN:
--   casino_id = COALESCE(
--     current_setting('app.casino_id', true)::uuid,    -- Missing NULLIF
--     (auth.jwt()->>'casino_id')::uuid                 -- Wrong path
--   )
--
-- CORRECT PATTERN (ADR-015 Pattern C):
--   casino_id = COALESCE(
--     NULLIF(current_setting('app.casino_id', true), '')::uuid,
--     (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
--   )
-- ============================================================================

-- ============================================================================
-- STEP 1: Fix loyalty_ledger RLS policies
-- ============================================================================

-- Drop broken policies
DROP POLICY IF EXISTS loyalty_ledger_select ON loyalty_ledger;
DROP POLICY IF EXISTS loyalty_ledger_insert ON loyalty_ledger;

-- Recreate with correct ADR-015 Pattern C
CREATE POLICY loyalty_ledger_select ON loyalty_ledger
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

COMMENT ON POLICY loyalty_ledger_select ON loyalty_ledger IS
  'ADR-015 Pattern C: Hybrid casino-scoped read with JWT fallback. Any authenticated staff can read their casino ledger.';

CREATE POLICY loyalty_ledger_insert ON loyalty_ledger
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'cashier', 'admin')
  );

COMMENT ON POLICY loyalty_ledger_insert ON loyalty_ledger IS
  'ADR-015 Pattern C: Hybrid with role gate. Only pit_boss, cashier, admin can insert ledger entries.';

-- ============================================================================
-- STEP 2: Fix player_loyalty RLS policies
-- ============================================================================

-- Drop broken policies
DROP POLICY IF EXISTS player_loyalty_select ON player_loyalty;
DROP POLICY IF EXISTS player_loyalty_insert ON player_loyalty;
DROP POLICY IF EXISTS player_loyalty_update ON player_loyalty;
DROP POLICY IF EXISTS player_loyalty_deny_delete ON player_loyalty;

-- Recreate with correct ADR-015 Pattern C
CREATE POLICY player_loyalty_select ON player_loyalty
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

COMMENT ON POLICY player_loyalty_select ON player_loyalty IS
  'ADR-015 Pattern C: Hybrid casino-scoped read with JWT fallback. Any authenticated staff can read their casino player balances.';

CREATE POLICY player_loyalty_insert ON player_loyalty
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

COMMENT ON POLICY player_loyalty_insert ON player_loyalty IS
  'ADR-015 Pattern C: Hybrid with role gate. Only pit_boss, admin can initialize player loyalty records.';

CREATE POLICY player_loyalty_update ON player_loyalty
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'cashier', 'admin')
  );

COMMENT ON POLICY player_loyalty_update ON player_loyalty IS
  'ADR-015 Pattern C: Hybrid with role gate. Balance updates via RPCs require pit_boss, cashier, or admin role.';

CREATE POLICY player_loyalty_deny_delete ON player_loyalty
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  );

COMMENT ON POLICY player_loyalty_deny_delete ON player_loyalty IS
  'ADR-015 Pattern C: Admin-only delete. Normal operations use soft-delete via preferences.';

-- ============================================================================
-- STEP 3: Notify PostgREST to reload schema
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Migration complete
-- ============================================================================
-- Fixes: "invalid input syntax for type uuid: ''" error in modal-data endpoint
-- Impact: All loyalty_ledger and player_loyalty queries now work with connection pooling
-- Testing: POST /api/rating-slip/modal-data should return 200 with loyalty data
-- ============================================================================

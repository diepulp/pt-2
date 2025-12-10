-- Migration: ADR-015 Hybrid RLS Policies (Pattern C)
-- Description: Update all casino-scoped RLS policies to support connection pooling
-- Workstream: WS4 - Hybrid RLS Policy Migration
-- Created: 2025-12-09
-- Reference: docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md

-- ============================================================================
-- CONTEXT
-- ============================================================================
-- Problem: Existing policies use current_setting('app.casino_id') without JWT
--          fallback. This fails with Supabase connection pooling (transaction mode).
--
-- Solution: Pattern C (Hybrid with Fallback) - works with both SET LOCAL and JWT:
--   COALESCE(
--     NULLIF(current_setting('app.casino_id', true), '')::uuid,
--     (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
--   )
--
-- Guards: ALL policies MUST have auth.uid() IS NOT NULL check.
-- ============================================================================

-- ============================================================================
-- 1. VISIT TABLE
-- ============================================================================

DROP POLICY IF EXISTS visit_select_same_casino ON visit;
DROP POLICY IF EXISTS visit_insert_staff ON visit;
DROP POLICY IF EXISTS visit_update_staff ON visit;

CREATE POLICY visit_select_same_casino ON visit
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY visit_insert_staff ON visit
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

CREATE POLICY visit_update_staff ON visit
  FOR UPDATE USING (
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

-- ============================================================================
-- 2. PLAYER_CASINO TABLE
-- ============================================================================

DROP POLICY IF EXISTS player_casino_select_same_casino ON player_casino;
DROP POLICY IF EXISTS player_casino_insert_staff ON player_casino;
DROP POLICY IF EXISTS player_casino_update_admin ON player_casino;

CREATE POLICY player_casino_select_same_casino ON player_casino
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY player_casino_insert_staff ON player_casino
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

CREATE POLICY player_casino_update_admin ON player_casino
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  );

-- ============================================================================
-- 3. PLAYER TABLE
-- ============================================================================
-- Player table is global (not casino-scoped), but access is restricted via
-- player_casino enrollment. We add auth.uid() guard for consistency.

DROP POLICY IF EXISTS player_select_enrolled ON player;
DROP POLICY IF EXISTS player_insert_admin ON player;
DROP POLICY IF EXISTS player_update_enrolled ON player;

CREATE POLICY player_select_enrolled ON player
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player.id
      AND pc.casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
    )
  );

CREATE POLICY player_insert_admin ON player
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('admin', 'pit_boss')
  );

CREATE POLICY player_update_enrolled ON player
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player.id
      AND pc.casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  );

-- ============================================================================
-- 4. RATING_SLIP_PAUSE TABLE
-- ============================================================================

DROP POLICY IF EXISTS rating_slip_pause_read_same_casino ON rating_slip_pause;
DROP POLICY IF EXISTS rating_slip_pause_write_pit_boss ON rating_slip_pause;
DROP POLICY IF EXISTS rating_slip_pause_update_pit_boss ON rating_slip_pause;

CREATE POLICY rating_slip_pause_read_same_casino ON rating_slip_pause
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY rating_slip_pause_write_pit_boss ON rating_slip_pause
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY rating_slip_pause_update_pit_boss ON rating_slip_pause
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- ============================================================================
-- 5. RATING_SLIP TABLE (NEW - RLS not yet enabled)
-- ============================================================================

ALTER TABLE rating_slip ENABLE ROW LEVEL SECURITY;

CREATE POLICY rating_slip_select_same_casino ON rating_slip
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY rating_slip_insert_staff ON rating_slip
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

CREATE POLICY rating_slip_update_staff ON rating_slip
  FOR UPDATE USING (
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

-- ============================================================================
-- 6. GAMING_TABLE TABLE (NEW - RLS not yet enabled)
-- ============================================================================

ALTER TABLE gaming_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY gaming_table_select_same_casino ON gaming_table
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY gaming_table_insert_admin ON gaming_table
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

CREATE POLICY gaming_table_update_admin ON gaming_table
  FOR UPDATE USING (
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

-- ============================================================================
-- 7. DEALER_ROTATION TABLE (NEW - RLS not yet enabled)
-- ============================================================================

ALTER TABLE dealer_rotation ENABLE ROW LEVEL SECURITY;

CREATE POLICY dealer_rotation_select_same_casino ON dealer_rotation
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY dealer_rotation_insert_staff ON dealer_rotation
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

CREATE POLICY dealer_rotation_update_staff ON dealer_rotation
  FOR UPDATE USING (
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

-- ============================================================================
-- VERIFICATION & DOCUMENTATION
-- ============================================================================

COMMENT ON POLICY visit_select_same_casino ON visit IS
  'ADR-015 Pattern C: Hybrid casino-scoped read with JWT fallback for connection pooling';
COMMENT ON POLICY rating_slip_select_same_casino ON rating_slip IS
  'ADR-015 Pattern C: Hybrid casino-scoped read with JWT fallback for connection pooling';
COMMENT ON POLICY gaming_table_select_same_casino ON gaming_table IS
  'ADR-015 Pattern C: Hybrid casino-scoped read with JWT fallback for connection pooling';
COMMENT ON POLICY dealer_rotation_select_same_casino ON dealer_rotation IS
  'ADR-015 Pattern C: Hybrid casino-scoped read with JWT fallback for connection pooling';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

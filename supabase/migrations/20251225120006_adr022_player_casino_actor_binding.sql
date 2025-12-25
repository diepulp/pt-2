-- Migration: ADR-022 Player Identity Enrollment - Player Casino Actor Binding
-- Purpose: Update player_casino RLS policies with enrolled_by actor binding
-- Reference: EXEC-SPEC-022 Section 4.2 (INV-9 Actor Binding)
-- Pattern: ADR-015 Pattern C (Hybrid with Fallback)

-- Drop existing policies to recreate with actor binding
DROP POLICY IF EXISTS player_casino_insert_staff ON player_casino;
DROP POLICY IF EXISTS player_casino_update_admin ON player_casino;

-- INSERT: pit_boss, admin with enrolled_by actor binding (INV-9)
CREATE POLICY "player_casino_insert" ON player_casino
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
    AND (
      enrolled_by IS NULL
      OR enrolled_by = COALESCE(
        NULLIF((select current_setting('app.actor_id', true)), '')::uuid,
        ((select auth.jwt()) -> 'app_metadata' ->> 'staff_id')::uuid
      )
    )
  );

-- UPDATE: pit_boss, admin with enrolled_by actor binding (INV-9)
CREATE POLICY "player_casino_update" ON player_casino
  FOR UPDATE
  USING (
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
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
    AND (
      enrolled_by IS NULL
      OR enrolled_by = COALESCE(
        NULLIF((select current_setting('app.actor_id', true)), '')::uuid,
        ((select auth.jwt()) -> 'app_metadata' ->> 'staff_id')::uuid
      )
    )
  );

-- Add policy comments for documentation
COMMENT ON POLICY "player_casino_insert" ON player_casino IS
  'Casino-scoped enrollment with enrolled_by actor binding (INV-9, ADR-015 Pattern C)';

COMMENT ON POLICY "player_casino_update" ON player_casino IS
  'Casino-scoped enrollment update with enrolled_by validation (INV-9, ADR-015 Pattern C)';

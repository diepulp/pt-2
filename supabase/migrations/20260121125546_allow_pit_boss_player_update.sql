-- Migration: Allow pit_boss role to update player profiles
--
-- Issue: Player profile edit form was showing "Player not found" error
-- because the RLS policy only allowed 'admin' role to update players.
--
-- Fix: Extend player_update_enrolled policy to include 'pit_boss' role
-- alongside 'admin'. This aligns with player_insert_admin which already
-- allows both roles.
--
-- @see PLAYER-PROFILE-EDIT PRD

-- Drop and recreate the player update policy with pit_boss access
DROP POLICY IF EXISTS player_update_enrolled ON player;

CREATE POLICY player_update_enrolled ON player
  FOR UPDATE USING (
    (select auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player.id
      AND pc.casino_id = COALESCE(
        NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
        ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
      )
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('admin', 'pit_boss')
  );

COMMENT ON POLICY player_update_enrolled ON player IS
  'ADR-015 Pattern C: Allow admin and pit_boss to update players enrolled in their casino. Performance optimized with auth function subqueries.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Migration: Rating Slip Drop player_id Column
-- PRD: PRD-002 (Rating Slip Service)
-- EXEC-SPEC: EXECUTION-SPEC-PRD-002.md
-- Workstream: WS1 (Schema Validation & Type Hardening)
--
-- This migration removes the deprecated player_id column from rating_slip.
-- Player identity is now derived from visit.player_id per SRM v4.0.0 invariant.
--
-- Changes:
-- 1. Drop unique index that uses player_id
-- 2. Create new unique index using visit_id instead
-- 3. Drop foreign key constraint on player_id
-- 4. Drop player_id column
-- 5. Update rpc_start_rating_slip to not require p_player_id parameter

BEGIN;

-- =====================================================================
-- 1. DROP OLD UNIQUE INDEX (player_id, table_id)
-- =====================================================================

DROP INDEX IF EXISTS ux_rating_slip_player_table_active;

-- =====================================================================
-- 2. CREATE NEW UNIQUE INDEX (visit_id, table_id)
-- =====================================================================
--
-- Rationale: A visit represents a player session. Only one open/paused
-- rating slip per visit per table. Different visits (even for same player)
-- can have separate slips at the same table.

CREATE UNIQUE INDEX ux_rating_slip_visit_table_active
  ON rating_slip (visit_id, table_id)
  WHERE status IN ('open', 'paused');

-- =====================================================================
-- 3. DROP FOREIGN KEY CONSTRAINT
-- =====================================================================

ALTER TABLE rating_slip DROP CONSTRAINT IF EXISTS rating_slip_player_id_fkey;

-- =====================================================================
-- 4. DROP player_id COLUMN
-- =====================================================================
--
-- player_id was deprecated in favor of visit.player_id derivation.
-- This is the SRM v4.0.0 invariant: rating_slip has NO direct player reference.

ALTER TABLE rating_slip DROP COLUMN IF EXISTS player_id;

-- =====================================================================
-- 5. UPDATE rpc_start_rating_slip
-- =====================================================================
--
-- Changes:
-- - Remove p_player_id parameter
-- - Derive player validation from visit.player_id
-- - No longer insert player_id into rating_slip

CREATE OR REPLACE FUNCTION rpc_start_rating_slip(
  p_casino_id UUID,
  p_visit_id UUID,
  p_table_id UUID,
  p_seat_number TEXT,
  p_game_settings JSONB,
  p_actor_id UUID
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result rating_slip;
  v_player_id UUID;
BEGIN
  -- Validate visit is open and get player_id for audit
  SELECT player_id INTO v_player_id
  FROM visit
  WHERE id = p_visit_id
    AND casino_id = p_casino_id
    AND ended_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_OPEN: Visit % is not active', p_visit_id;
  END IF;

  -- Validate table is active
  IF NOT EXISTS (
    SELECT 1 FROM gaming_table
    WHERE id = p_table_id
      AND casino_id = p_casino_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'TABLE_NOT_ACTIVE: Table % is not active', p_table_id;
  END IF;

  -- Create slip (unique constraint prevents duplicates per visit/table)
  INSERT INTO rating_slip (
    casino_id, visit_id, table_id,
    seat_number, game_settings, status, start_time
  )
  VALUES (
    p_casino_id, p_visit_id, p_table_id,
    p_seat_number, p_game_settings, 'open', now()
  )
  RETURNING * INTO v_result;

  -- Audit log (include player_id from visit for reference)
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating-slip',
    p_actor_id,
    'start_rating_slip',
    jsonb_build_object(
      'rating_slip_id', v_result.id,
      'visit_id', p_visit_id,
      'player_id', v_player_id,  -- From visit, for audit only
      'table_id', p_table_id
    )
  );

  RETURN v_result;
END;
$$;

-- =====================================================================
-- 6. NOTIFY POSTGREST TO RELOAD SCHEMA
-- =====================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- VERIFICATION NOTES
-- =====================================================================
--
-- After this migration:
-- - rating_slip no longer has player_id column
-- - Unique constraint is now (visit_id, table_id) for open/paused slips
-- - rpc_start_rating_slip no longer requires p_player_id
-- - Player identity derived from visit.player_id
-- - All RPCs that return rating_slip will no longer include player_id
--
-- SRM Invariant Compliance:
-- - rating_slip.player_id: DROPPED (was deprecated)
-- - Player identity: Derived from visit.player_id at query time

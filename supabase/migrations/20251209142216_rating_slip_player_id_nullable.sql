-- Migration: Make rating_slip.player_id nullable
-- Purpose: Allow rating slips without direct player reference
-- Rationale: Player identity is derived from visit.player_id per SRM v4.0.0
--
-- This is a SAFER alternative to dropping the column entirely.
-- It allows:
--   1. Seeds to work without player_id
--   2. Backwards compatibility with existing data
--   3. Gradual transition to visit-derived player identity
--
-- Note: Migration 20251207024918 attempted to DROP the column but may not
-- have been applied correctly. This migration handles both cases.

BEGIN;

-- =====================================================================
-- 1. MAKE player_id NULLABLE (if column exists)
-- =====================================================================
-- Using DO block to handle case where column might already be dropped

DO $$
BEGIN
  -- Check if column exists
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rating_slip'
      AND column_name = 'player_id'
  ) THEN
    -- Make it nullable
    ALTER TABLE rating_slip ALTER COLUMN player_id DROP NOT NULL;
    RAISE NOTICE 'rating_slip.player_id is now nullable';
  ELSE
    RAISE NOTICE 'rating_slip.player_id column does not exist (already dropped)';
  END IF;
END $$;

-- =====================================================================
-- 2. UPDATE UNIQUE INDEX (if old index exists)
-- =====================================================================
-- The old index uses player_id. Create a visit-based index if needed.

DO $$
BEGIN
  -- Drop old player-based index if exists
  DROP INDEX IF EXISTS ux_rating_slip_player_table_active;

  -- Create visit-based index if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'ux_rating_slip_visit_table_active'
  ) THEN
    CREATE UNIQUE INDEX ux_rating_slip_visit_table_active
      ON rating_slip (visit_id, table_id)
      WHERE status IN ('open', 'paused');
    RAISE NOTICE 'Created ux_rating_slip_visit_table_active index';
  END IF;
END $$;

-- =====================================================================
-- 3. NOTIFY POSTGREST TO RELOAD SCHEMA
-- =====================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- VERIFICATION
-- =====================================================================
-- After this migration:
-- - rating_slip.player_id is nullable (if column exists)
-- - Unique constraint now uses (visit_id, table_id) for open/paused slips
-- - Seeds can insert rating_slips without player_id

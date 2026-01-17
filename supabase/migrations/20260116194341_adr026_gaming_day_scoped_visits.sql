-- ============================================================================
-- Migration: ADR-026 Gaming-Day-Scoped Visits
-- ============================================================================
-- Purpose: Add gaming_day column to visit table to scope visits to a single
--          gaming day, preventing financial totals from including amounts
--          from prior gaming days.
--
-- Problem: When a player returns after gaming day cutoff, startVisit() returns
--          an existing active visit from the previous gaming day. Financial
--          totals aggregated by visit_id then show multi-day amounts as
--          "today's" total, creating CTR/MTL compliance risk.
--
-- Solution: Add gaming_day column with unique constraint ensuring one active
--           visit per player per casino per gaming day.
--
-- Reference: ADR-026-gaming-day-scoped-visits.md, EXECUTION-SPEC-ADR-026-PATCH.md
-- Security Invariants:
--   INV-1: Visit gaming_day is computed via compute_gaming_day(casino_id, started_at)
--   INV-2: At most one active visit per (casino_id, player_id, gaming_day) tuple
-- ============================================================================

-- ============================================================================
-- SECTION 1: ADD gaming_day COLUMN (nullable for backfill)
-- ============================================================================

ALTER TABLE visit ADD COLUMN IF NOT EXISTS gaming_day date;

COMMENT ON COLUMN visit.gaming_day IS
  'The gaming day this visit belongs to. Computed via compute_gaming_day(casino_id, started_at) trigger. Enforces one active visit per gaming day per player.';

-- ============================================================================
-- SECTION 2: CREATE TRIGGER TO AUTO-COMPUTE gaming_day
-- ============================================================================
-- Uses the canonical timezone-aware compute_gaming_day RPC from PRD-000
-- Pattern follows set_fin_txn_gaming_day() and set_table_session_gaming_day()

CREATE OR REPLACE FUNCTION set_visit_gaming_day()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Use the canonical compute_gaming_day RPC from PRD-000
  -- This RPC:
  --   1. Fetches gaming_day_start_time AND timezone from casino_settings
  --   2. Converts timestamp to casino's local timezone
  --   3. Computes gaming day boundary correctly
  NEW.gaming_day := compute_gaming_day(NEW.casino_id, COALESCE(NEW.started_at, now()));
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_visit_gaming_day() IS
  'Derives gaming_day from started_at using canonical timezone-aware compute_gaming_day RPC. Created for ADR-026.';

-- Create trigger (BEFORE INSERT only - gaming_day should not change after creation)
DROP TRIGGER IF EXISTS trg_visit_gaming_day ON visit;
CREATE TRIGGER trg_visit_gaming_day
  BEFORE INSERT ON visit
  FOR EACH ROW EXECUTE FUNCTION set_visit_gaming_day();

-- ============================================================================
-- SECTION 3: BACKFILL EXISTING VISITS
-- ============================================================================
-- Update existing visits with computed gaming_day using efficient IS DISTINCT FROM

UPDATE visit
SET gaming_day = compute_gaming_day(casino_id, started_at)
WHERE gaming_day IS DISTINCT FROM compute_gaming_day(casino_id, started_at);

-- ============================================================================
-- SECTION 4: SET NOT NULL CONSTRAINT
-- ============================================================================

ALTER TABLE visit ALTER COLUMN gaming_day SET NOT NULL;

-- ============================================================================
-- SECTION 5: DROP OLD UNIQUE INDEXES AND CREATE NEW GAMING-DAY-SCOPED INDEX
-- ============================================================================
-- The old indexes enforce "one active visit per player per casino"
-- The new index enforces "one active visit per player per casino per GAMING DAY"
-- This allows a player to have a new visit when the gaming day rolls over

-- Drop old indexes that conflict with new business rule
DROP INDEX IF EXISTS uq_visit_single_active_identified;
DROP INDEX IF EXISTS idx_visit_one_open_per_player;
DROP INDEX IF EXISTS uq_visit_single_active_per_player_casino;

-- Create new gaming-day-scoped unique partial index (INV-2)
-- Constraint: At most one active visit per (casino_id, player_id, gaming_day) tuple
CREATE UNIQUE INDEX uq_visit_player_gaming_day_active
  ON visit (casino_id, player_id, gaming_day)
  WHERE ended_at IS NULL AND player_id IS NOT NULL;

COMMENT ON INDEX uq_visit_player_gaming_day_active IS
  'ADR-026: Ensures at most one active visit per player per casino per gaming day. Ghost visits (player_id IS NULL) are excluded. Replaces uq_visit_single_active_identified.';

-- ============================================================================
-- SECTION 6: CREATE PERFORMANCE INDEX
-- ============================================================================
-- Supports queries filtering by casino and gaming day

CREATE INDEX IF NOT EXISTS ix_visit_casino_gaming_day
  ON visit (casino_id, gaming_day);

COMMENT ON INDEX ix_visit_casino_gaming_day IS
  'ADR-026: Performance index for queries filtering visits by casino and gaming day.';

-- ============================================================================
-- SECTION 7: VERIFICATION QUERY (for manual validation)
-- ============================================================================
-- Run this after migration to verify all visits have correct gaming_day:
--
--   SELECT id, casino_id, started_at, gaming_day,
--          compute_gaming_day(casino_id, started_at) AS expected_gaming_day
--   FROM visit
--   WHERE gaming_day IS DISTINCT FROM compute_gaming_day(casino_id, started_at);
--
-- Query should return 0 rows after successful migration.
-- ============================================================================

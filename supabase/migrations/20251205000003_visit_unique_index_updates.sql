-- =============================================================================
-- EXEC-VSE-001: WS-1C - Update unique index for ghost gaming visits support
-- =============================================================================
--
-- Purpose: Replace the original unique index with a partial index that only
--          applies to identified visits (player_id IS NOT NULL), allowing
--          multiple concurrent ghost visits per casino.
--
-- Changes:
--   1. Drop old unique index: uq_visit_single_active_per_player_casino
--   2. Create new partial unique index: uq_visit_single_active_identified
--      - Applies only to visits WHERE ended_at IS NULL AND player_id IS NOT NULL
--      - Ghost visits (player_id IS NULL) are excluded from uniqueness constraint
--
-- Business Rules:
--   - Identified visits: One active visit per player per casino (unchanged behavior)
--   - Ghost visits: Multiple concurrent ghost visits allowed per casino
--     (each ghost visit represents an anonymous gaming session at a table)
--
-- Dependencies: WS-1B (player_id must be nullable)
--
-- Note: Optional future constraint on (casino_id, table_id, seat) for ghost
--       visits remains deferred per EXEC-VSE-001 scope decisions.
--
-- Reference: docs/20-architecture/specs/EXEC-VSE/EXECUTION-SPEC-visit-service-evolution.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Step 1: Drop the old unique index
-- -----------------------------------------------------------------------------
-- The original index assumed player_id was always NOT NULL. With ghost visits,
-- player_id can be NULL, and PostgreSQL partial indexes handle NULLs differently.
-- We need a new index that explicitly filters for identified visits only.
DROP INDEX IF EXISTS uq_visit_single_active_per_player_casino;

-- -----------------------------------------------------------------------------
-- Step 2: Create new partial unique index for identified visits only
-- -----------------------------------------------------------------------------
-- This index ensures:
--   - A player can have at most ONE active visit per casino
--   - Only applies to visits where:
--     a) ended_at IS NULL (active visits)
--     b) player_id IS NOT NULL (identified/non-ghost visits)
--
-- Ghost visits (gaming_ghost_unrated with player_id = NULL) are excluded
-- from this constraint, allowing multiple concurrent ghost gaming sessions.
CREATE UNIQUE INDEX uq_visit_single_active_identified
  ON visit (player_id, casino_id)
  WHERE ended_at IS NULL AND player_id IS NOT NULL;

COMMENT ON INDEX uq_visit_single_active_identified IS
  'Ensures one active visit per player per casino. Excludes ghost visits (player_id IS NULL) from uniqueness constraint.';

-- =============================================================================
-- Notify PostgREST to reload schema cache
-- =============================================================================
NOTIFY pgrst, 'reload schema';

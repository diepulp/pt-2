-- =============================================================================
-- EXEC-VSE-001: WS-1A - Add visit_kind enum to visit table
-- =============================================================================
--
-- Purpose: Introduce visit archetypes to support ghost gaming and reward-only visits
--
-- Visit Archetypes:
--   - reward_identified:        Player exists, no gaming, redemptions only
--   - gaming_identified_rated:  Player exists, gaming, loyalty accrual eligible
--   - gaming_ghost_unrated:     No player, gaming, compliance tracking only
--
-- Dependencies: None (first migration in EXEC-VSE-001 sequence)
--
-- Reference: docs/20-architecture/specs/EXEC-VSE/EXECUTION-SPEC-visit-service-evolution.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Step 1: Create the visit_kind enum type
-- -----------------------------------------------------------------------------
CREATE TYPE visit_kind AS ENUM (
  'reward_identified',
  'gaming_identified_rated',
  'gaming_ghost_unrated'
);

COMMENT ON TYPE visit_kind IS 'Visit archetype classification: reward_identified (player, no gaming), gaming_identified_rated (player, gaming, loyalty), gaming_ghost_unrated (no player, gaming, compliance)';

-- -----------------------------------------------------------------------------
-- Step 2: Add visit_kind column to visit table (nullable initially for backfill)
-- -----------------------------------------------------------------------------
ALTER TABLE visit
  ADD COLUMN visit_kind visit_kind;

COMMENT ON COLUMN visit.visit_kind IS 'Classification of visit purpose and player identification status';

-- -----------------------------------------------------------------------------
-- Step 3: Backfill all existing visits as gaming_identified_rated
-- -----------------------------------------------------------------------------
-- All existing visits have a player_id (NOT NULL constraint) and represent
-- standard rated gaming sessions. This is the backward-compatible default.
UPDATE visit
SET visit_kind = 'gaming_identified_rated'
WHERE visit_kind IS NULL;

-- -----------------------------------------------------------------------------
-- Step 4: Make visit_kind NOT NULL after backfill
-- -----------------------------------------------------------------------------
ALTER TABLE visit
  ALTER COLUMN visit_kind SET NOT NULL;

-- -----------------------------------------------------------------------------
-- Step 5: Set default for new visits (backward compatibility with existing code)
-- -----------------------------------------------------------------------------
ALTER TABLE visit
  ALTER COLUMN visit_kind SET DEFAULT 'gaming_identified_rated';

-- -----------------------------------------------------------------------------
-- Step 6: Add index for visit_kind queries (filtering by archetype)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_visit_by_kind
  ON visit (casino_id, visit_kind, started_at DESC);

-- =============================================================================
-- Notify PostgREST to reload schema cache
-- =============================================================================
NOTIFY pgrst, 'reload schema';

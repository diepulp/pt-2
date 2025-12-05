-- =============================================================================
-- EXEC-VSE-001: WS-1B - Make visit.player_id nullable for ghost gaming visits
-- =============================================================================
--
-- Purpose: Allow NULL player_id for ghost gaming visits (visit_kind = 'gaming_ghost_unrated')
--
-- Changes:
--   1. Drop existing FK constraint (visit_player_id_fkey with ON DELETE CASCADE)
--   2. Make player_id column nullable
--   3. Re-add FK constraint with ON DELETE SET NULL
--   4. Add CHECK constraint to enforce player_id/visit_kind invariant:
--      - Ghost visits (gaming_ghost_unrated) MUST have NULL player_id
--      - Non-ghost visits MUST have NOT NULL player_id
--
-- Dependencies: WS-1A (visit_kind enum must exist)
--
-- Reference: docs/20-architecture/specs/EXEC-VSE/EXECUTION-SPEC-visit-service-evolution.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Step 1: Drop existing FK constraint
-- -----------------------------------------------------------------------------
-- Original constraint: player_id uuid not null references player(id) on delete cascade
ALTER TABLE visit
  DROP CONSTRAINT IF EXISTS visit_player_id_fkey;

-- -----------------------------------------------------------------------------
-- Step 2: Make player_id nullable
-- -----------------------------------------------------------------------------
ALTER TABLE visit
  ALTER COLUMN player_id DROP NOT NULL;

COMMENT ON COLUMN visit.player_id IS 'Player reference. NULL for ghost gaming visits (gaming_ghost_unrated), required for all other visit kinds.';

-- -----------------------------------------------------------------------------
-- Step 3: Re-add FK constraint with ON DELETE SET NULL
-- -----------------------------------------------------------------------------
-- Changed from ON DELETE CASCADE to ON DELETE SET NULL
-- If a player is deleted, their visits become orphaned ghost-like records
-- rather than being cascade-deleted (preserving audit trail)
ALTER TABLE visit
  ADD CONSTRAINT visit_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- Step 4: Add CHECK constraint for visit_kind/player_id invariant
-- -----------------------------------------------------------------------------
-- Business rules:
--   - gaming_ghost_unrated: player_id MUST be NULL (anonymous gaming)
--   - All other visit_kinds: player_id MUST NOT be NULL (identified visits)
--
-- This constraint enforces data integrity at the database level,
-- ensuring ghost visits cannot accidentally have a player_id and
-- identified visits cannot accidentally be missing a player_id.
ALTER TABLE visit
  ADD CONSTRAINT chk_visit_kind_player_presence CHECK (
    (visit_kind = 'gaming_ghost_unrated' AND player_id IS NULL)
    OR
    (visit_kind != 'gaming_ghost_unrated' AND player_id IS NOT NULL)
  );

COMMENT ON CONSTRAINT chk_visit_kind_player_presence ON visit IS 'Enforces that ghost visits have NULL player_id and non-ghost visits have NOT NULL player_id';

-- =============================================================================
-- Notify PostgREST to reload schema cache
-- =============================================================================
NOTIFY pgrst, 'reload schema';

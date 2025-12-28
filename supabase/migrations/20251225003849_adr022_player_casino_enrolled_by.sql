-- Migration: ADR-022 Player Identity Enrollment - Player Casino Enrolled By
-- Purpose: Add enrolled_by column and UNIQUE constraint to player_casino table
-- Reference: EXEC-SPEC-022 Section 1.2
-- CRITICAL: UNIQUE constraint required for FK from player_identity table

-- Add enrolled_by column for actor tracking (IF NOT EXISTS for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_casino' AND column_name = 'enrolled_by'
  ) THEN
    ALTER TABLE player_casino
      ADD COLUMN enrolled_by uuid NULL
        REFERENCES staff(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add UNIQUE constraint on (casino_id, player_id)
-- Required for FK reference from player_identity table
-- PK is (player_id, casino_id) but FK needs (casino_id, player_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_player_casino_casino_player'
  ) THEN
    ALTER TABLE player_casino
      ADD CONSTRAINT uq_player_casino_casino_player
      UNIQUE (casino_id, player_id);
  END IF;
END $$;

-- Add index for active enrollments listing
CREATE INDEX IF NOT EXISTS ix_player_casino_active
  ON player_casino(casino_id, status)
  WHERE status = 'active';

-- Add comments for documentation
COMMENT ON COLUMN player_casino.enrolled_by IS 'Staff member who enrolled the player (actor tracking per INV-9)';
COMMENT ON CONSTRAINT uq_player_casino_casino_player ON player_casino IS 'Required for player_identity FK reference';
COMMENT ON INDEX ix_player_casino_active IS 'Supports listing active enrollments per casino';

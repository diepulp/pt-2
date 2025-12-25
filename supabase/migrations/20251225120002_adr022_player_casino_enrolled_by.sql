-- Migration: ADR-022 Player Identity Enrollment - Player Casino Enrolled By
-- Purpose: Add enrolled_by column and UNIQUE constraint to player_casino table
-- Reference: EXEC-SPEC-022 Section 1.2
-- CRITICAL: UNIQUE constraint required for FK from player_identity table

-- Add enrolled_by column for actor tracking
ALTER TABLE player_casino
  ADD COLUMN enrolled_by uuid NULL
    REFERENCES staff(id) ON DELETE SET NULL;

-- Add UNIQUE constraint on (casino_id, player_id)
-- Required for FK reference from player_identity table
-- PK is (player_id, casino_id) but FK needs (casino_id, player_id)
ALTER TABLE player_casino
  ADD CONSTRAINT uq_player_casino_casino_player
  UNIQUE (casino_id, player_id);

-- Add index for active enrollments listing
CREATE INDEX ix_player_casino_active
  ON player_casino(casino_id, status)
  WHERE status = 'active';

-- Add comments for documentation
COMMENT ON COLUMN player_casino.enrolled_by IS 'Staff member who enrolled the player (actor tracking per INV-9)';
COMMENT ON CONSTRAINT uq_player_casino_casino_player ON player_casino IS 'Required for player_identity FK reference';
COMMENT ON INDEX ix_player_casino_active IS 'Supports listing active enrollments per casino';

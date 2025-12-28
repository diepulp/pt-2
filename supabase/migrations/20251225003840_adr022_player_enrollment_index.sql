-- Migration: ADR-022 Player Identity Enrollment - Player Enrollment Index
-- Purpose: Add index for enrollment matching on player table
-- Reference: EXEC-SPEC-022 Section 2

-- Create partial index for enrollment matching (IF NOT EXISTS for idempotency)
-- Supports fuzzy matching by first_name + last_name + birth_date
-- Partial index (WHERE birth_date IS NOT NULL) to optimize for enrollment scenarios
CREATE INDEX IF NOT EXISTS ix_player_enrollment_match
  ON player (lower(first_name), lower(last_name), birth_date)
  WHERE birth_date IS NOT NULL;

COMMENT ON INDEX ix_player_enrollment_match IS 'Enrollment matching index: supports case-insensitive name + DOB lookups';

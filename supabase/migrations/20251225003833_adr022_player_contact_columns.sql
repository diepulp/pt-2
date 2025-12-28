-- Migration: ADR-022 Player Identity Enrollment - Player Contact Columns
-- Purpose: Add middle_name, email, phone_number columns to player table
-- Reference: EXEC-SPEC-022 Section 1.1

-- Add optional contact columns to player table (IF NOT EXISTS for idempotency)
ALTER TABLE player
  ADD COLUMN IF NOT EXISTS middle_name text NULL,
  ADD COLUMN IF NOT EXISTS email text NULL,
  ADD COLUMN IF NOT EXISTS phone_number text NULL;

-- Add comments for documentation
COMMENT ON COLUMN player.middle_name IS 'Middle name from ID scanner (ScannedIdData.middleName)';
COMMENT ON COLUMN player.email IS 'Optional contact email';
COMMENT ON COLUMN player.phone_number IS 'Optional contact phone number';

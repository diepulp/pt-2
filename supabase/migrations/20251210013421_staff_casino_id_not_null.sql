-- Migration: staff_casino_id_not_null
-- Description: Make staff.casino_id column NOT NULL
-- Safety: This migration will FAIL if any staff records have NULL casino_id
-- Rationale: Every staff member must belong to a casino for RLS policies to work correctly

-- Step 1: Check for NULL values
-- This will cause the migration to fail if NULL values exist
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM staff
  WHERE casino_id IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION 'Cannot make staff.casino_id NOT NULL: % staff records have NULL casino_id. Please update these records manually before running this migration.', null_count;
  END IF;
END $$;

-- Step 2: Drop the existing foreign key constraint (references casino with ON DELETE SET NULL)
ALTER TABLE staff
  DROP CONSTRAINT IF EXISTS staff_casino_id_fkey;

-- Step 3: Make casino_id NOT NULL
ALTER TABLE staff
  ALTER COLUMN casino_id SET NOT NULL;

-- Step 4: Re-add the foreign key constraint with CASCADE delete behavior
-- This ensures that if a casino is deleted, its staff records are also deleted
ALTER TABLE staff
  ADD CONSTRAINT staff_casino_id_fkey
  FOREIGN KEY (casino_id)
  REFERENCES casino(id)
  ON DELETE CASCADE;

-- Step 5: Add a comment documenting the constraint
COMMENT ON COLUMN staff.casino_id IS 'Casino this staff member belongs to. Required for all staff members. Cascades on casino deletion.';

-- Phase C.1: Add UUID Column with Relational Integrity
-- Adds patron_uuid column with FK constraint, indexes, and parity enforcement
-- Part of Phase C: MTL Patron UUID Migration

BEGIN;

-- =============================================================================
-- Pre-Migration Validation
-- =============================================================================

-- Check for orphaned records BEFORE adding FK
DO $$
DECLARE
  orphan_count int;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM mtl_entry e
  LEFT JOIN player p ON e.patron_id::uuid = p.id
  WHERE e.patron_id IS NOT NULL
    AND p.id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Cannot proceed: % orphaned patron_id records found. Clean up required.', orphan_count;
  END IF;

  RAISE NOTICE 'Pre-migration validation passed: 0 orphaned records';
END $$;

-- =============================================================================
-- Step 1: Add UUID Column
-- =============================================================================

ALTER TABLE mtl_entry ADD COLUMN patron_uuid UUID;

COMMENT ON COLUMN mtl_entry.patron_uuid IS
'Authoritative patron identifier (UUID). Replaces TEXT patron_id with proper type safety and FK constraint.';

-- =============================================================================
-- Step 2: Backfill from Existing TEXT Column
-- =============================================================================

UPDATE mtl_entry
SET patron_uuid = patron_id::uuid
WHERE patron_id IS NOT NULL;

-- =============================================================================
-- Step 3: Validate Backfill
-- =============================================================================

DO $$
DECLARE
  null_count int;
  orphan_count int;
  total_count int;
  non_null_patron_id int;
BEGIN
  -- Get total counts
  SELECT COUNT(*), COUNT(patron_id) INTO total_count, non_null_patron_id
  FROM mtl_entry;

  -- Check for NULL patron_uuid where patron_id exists
  SELECT COUNT(*) INTO null_count
  FROM mtl_entry
  WHERE patron_uuid IS NULL AND patron_id IS NOT NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % NULL patron_uuid values where patron_id exists', null_count;
  END IF;

  -- Check for orphaned references
  SELECT COUNT(*) INTO orphan_count
  FROM mtl_entry e
  LEFT JOIN player p ON e.patron_uuid = p.id
  WHERE e.patron_uuid IS NOT NULL
    AND p.id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Orphaned records: % mtl_entry rows reference non-existent players', orphan_count;
  END IF;

  RAISE NOTICE 'Backfill validation passed: total_rows=%, non_null_patron_id=%, backfilled=%',
    total_count, non_null_patron_id, non_null_patron_id;
END $$;

-- =============================================================================
-- Step 4: Make NOT NULL (Future Enforcement)
-- =============================================================================

-- Note: Keeping nullable for now since patron_id is also nullable
-- This allows anonymous MTL entries (person_name only)
-- ALTER TABLE mtl_entry ALTER COLUMN patron_uuid SET NOT NULL;

-- =============================================================================
-- Step 5: Add Parity Constraint
-- =============================================================================

-- Ensures patron_id and patron_uuid stay in sync during transition
ALTER TABLE mtl_entry
  ADD CONSTRAINT mtl_patron_uuid_parity_chk
  CHECK (
    (patron_id IS NULL AND patron_uuid IS NULL) OR
    (patron_id IS NOT NULL AND patron_uuid IS NOT NULL AND patron_id::uuid = patron_uuid)
  )
  NOT VALID;

COMMENT ON CONSTRAINT mtl_patron_uuid_parity_chk ON mtl_entry IS
'Enforces parity between patron_id (TEXT) and patron_uuid (UUID) during migration. Both must be NULL or both must match.';

-- =============================================================================
-- Step 6: Validate Constraint
-- =============================================================================

-- This proves no divergence exists in current data
ALTER TABLE mtl_entry VALIDATE CONSTRAINT mtl_patron_uuid_parity_chk;

-- =============================================================================
-- Step 7: Add Foreign Key Constraint
-- =============================================================================

ALTER TABLE mtl_entry
  ADD CONSTRAINT fk_mtl_entry_patron
  FOREIGN KEY (patron_uuid)
  REFERENCES player(id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT fk_mtl_entry_patron ON mtl_entry IS
'Enforces referential integrity: patron_uuid must reference valid player.id. Cascades deletes.';

-- =============================================================================
-- Step 8: Create Indexes
-- =============================================================================

-- Index for patron lookups
CREATE INDEX idx_mtl_entry_patron_uuid
  ON mtl_entry(patron_uuid)
  WHERE patron_uuid IS NOT NULL;

COMMENT ON INDEX idx_mtl_entry_patron_uuid IS
'Optimizes queries filtering by patron_uuid. Partial index excludes NULLs.';

-- Index for patron transaction history (common query pattern)
CREATE INDEX idx_mtl_entry_patron_created
  ON mtl_entry(patron_uuid, created_at DESC)
  WHERE patron_uuid IS NOT NULL;

COMMENT ON INDEX idx_mtl_entry_patron_created IS
'Optimizes patron transaction history queries ordered by date. Covers listByPatron service function.';

-- =============================================================================
-- Step 9: Analyze for Query Planner
-- =============================================================================

ANALYZE mtl_entry;

-- =============================================================================
-- Post-Migration Verification
-- =============================================================================

DO $$
DECLARE
  fk_count int;
  index_count int;
  constraint_count int;
BEGIN
  -- Verify FK constraint exists
  SELECT COUNT(*) INTO fk_count
  FROM pg_constraint
  WHERE conrelid = 'mtl_entry'::regclass
    AND contype = 'f'
    AND conname = 'fk_mtl_entry_patron';

  IF fk_count = 0 THEN
    RAISE EXCEPTION 'FK constraint fk_mtl_entry_patron not created';
  END IF;

  -- Verify parity constraint exists
  SELECT COUNT(*) INTO constraint_count
  FROM pg_constraint
  WHERE conrelid = 'mtl_entry'::regclass
    AND contype = 'c'
    AND conname = 'mtl_patron_uuid_parity_chk';

  IF constraint_count = 0 THEN
    RAISE EXCEPTION 'Parity constraint mtl_patron_uuid_parity_chk not created';
  END IF;

  -- Verify specific indexes created
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE tablename = 'mtl_entry'
    AND indexname IN ('idx_mtl_entry_patron_uuid', 'idx_mtl_entry_patron_created');

  IF index_count < 2 THEN
    RAISE EXCEPTION 'Expected 2 indexes (idx_mtl_entry_patron_uuid, idx_mtl_entry_patron_created), found %', index_count;
  END IF;

  RAISE NOTICE 'Phase C.1 verification passed: FK constraint, parity constraint, and % indexes created', index_count;
END $$;

COMMIT;

-- =============================================================================
-- Validation Summary
-- =============================================================================

-- Show column structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'mtl_entry'
  AND column_name LIKE '%patron%'
ORDER BY ordinal_position;

-- Show constraints
SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'mtl_entry'::regclass
  AND (conname LIKE '%patron%' OR pg_get_constraintdef(oid) LIKE '%patron%')
ORDER BY conname;

-- Show indexes
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'mtl_entry'
  AND indexname LIKE '%patron%'
ORDER BY indexname;

-- Note: Cutover gate can be tested manually after migration:
-- SELECT * FROM check_phase_c1_cutover_gate();

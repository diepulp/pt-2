-- Phase C.2.2: Convert patron_id to Generated Column
-- Migration: 20251020162716_phase_c2_patron_id_generated_column.sql
-- Issue: #2 - MTL patron type mismatch (TEXT vs UUID)
-- Phase: C.2.2 - Generated Column Swap
--
-- Purpose: Convert patron_id from mutable TEXT column to immutable generated column
--          This enforces patron_uuid as the authoritative source while maintaining
--          backward compatibility for legacy read-only consumers.
--
-- Strategy:
-- 1. Drop original patron_id TEXT column (CASCADE removes parity constraint)
-- 2. Add patron_id as GENERATED ALWAYS column derived from patron_uuid::text
-- 3. STORED computation ensures patron_id is materialized for query performance
--
-- Impact:
-- - Write operations to patron_id will fail with immutability error
-- - Read operations continue to work (patron_id automatically populated)
-- - Legacy read-only consumers (reports, dashboards) unaffected
-- - Application must use patron_uuid for all writes (Phase C.2.1 complete)
--
-- Rollback: See PHASE_C_STATUS.md Section "Rollback Procedure" (lines 338-354)

-- =============================================================================
-- Step 1: Drop Original patron_id Column
-- =============================================================================

-- Drop the mutable patron_id TEXT column
-- CASCADE will automatically drop dependent objects:
--   - mtl_patron_uuid_parity_chk constraint (enforces patron_id = patron_uuid::text)
--   - Any indexes on patron_id (if they exist)
--
-- Note: This is safe because:
-- - Phase C.2.1 migrated all writes to patron_uuid
-- - Empty table (0 rows) means no data loss
-- - Parity constraint no longer needed (patron_id becomes read-only)

ALTER TABLE mtl_entry
  DROP COLUMN patron_id CASCADE;

-- =============================================================================
-- Step 2: Add patron_id as Generated Column
-- =============================================================================

-- Add patron_id as a GENERATED ALWAYS column
-- - Computed as: patron_uuid::text (UUID cast to TEXT)
-- - STORED: Materialized on disk for query performance (vs VIRTUAL)
-- - Nullable: Inherits nullability from patron_uuid (anonymous MTL entries allowed)
-- - Immutable: Cannot be written to (INSERT/UPDATE will fail)
--
-- Benefits:
-- - Zero maintenance: Automatically stays in sync with patron_uuid
-- - Zero divergence: Impossible for patron_id ≠ patron_uuid::text
-- - Legacy compatibility: SELECT patron_id continues to work
-- - Type safety: Application forced to use UUID type (patron_uuid)

ALTER TABLE mtl_entry
  ADD COLUMN patron_id text
  GENERATED ALWAYS AS (patron_uuid::text) STORED;

-- =============================================================================
-- Validation Queries (Run After Migration)
-- =============================================================================

-- 1. Verify column is GENERATED ALWAYS
-- Expected: is_generated = 'ALWAYS'
-- SELECT column_name, is_generated, generation_expression
-- FROM information_schema.columns
-- WHERE table_name = 'mtl_entry' AND column_name = 'patron_id';

-- 2. Test immutability (should fail)
-- Expected: ERROR: cannot insert into column "patron_id"
-- INSERT INTO mtl_entry (patron_id, ...) VALUES ('test', ...);

-- 3. Test read-only access (should succeed)
-- Expected: patron_id = patron_uuid::text for all rows
-- INSERT INTO mtl_entry (patron_uuid, ...) VALUES ('...', ...);
-- SELECT patron_id, patron_uuid FROM mtl_entry WHERE patron_uuid IS NOT NULL;

-- 4. Test NULL handling (should succeed)
-- Expected: patron_id IS NULL when patron_uuid IS NULL
-- INSERT INTO mtl_entry (patron_uuid, ...) VALUES (NULL, ...);
-- SELECT patron_id FROM mtl_entry WHERE patron_uuid IS NULL;

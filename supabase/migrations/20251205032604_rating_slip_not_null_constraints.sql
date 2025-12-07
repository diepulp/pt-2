-- WS-1D: Rating Slip NOT NULL Constraints
-- EXEC-SPEC: EXEC-VSE-001
-- Phase: 2 (Rating Slip Hardening)
-- Depends on: GATE-1 (Schema Foundation Complete)
--
-- This migration hardens the rating_slip table by enforcing NOT NULL constraints
-- on visit_id and table_id columns. All rating slips must be anchored to a visit
-- (including ghost visits) and associated with a gaming table.
--
-- Architectural constraint: Ghost gaming visits (visit_kind = 'gaming_ghost_unrated')
-- provide the anchor for unidentified play. Rating slips NEVER have NULL visit_id.

-- Pre-check: Verify no NULL values exist before applying constraints
-- This block will raise an exception if any NULL values are found
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM rating_slip
  WHERE visit_id IS NULL OR table_id IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION 'Cannot apply migration: % rating_slip rows have NULL visit_id or table_id', null_count;
  END IF;
END $$;

-- Harden rating_slip: Make visit_id and table_id NOT NULL
-- All rating slips must reference a visit (identified or ghost) and a gaming table
ALTER TABLE rating_slip ALTER COLUMN visit_id SET NOT NULL;
ALTER TABLE rating_slip ALTER COLUMN table_id SET NOT NULL;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Verification comment:
-- After this migration:
-- - rating_slip.visit_id: NOT NULL (was nullable)
-- - rating_slip.table_id: NOT NULL (was nullable)
-- - Ghost gaming visits provide visit anchors for unidentified play
-- - All telemetry is now properly anchored to a visit

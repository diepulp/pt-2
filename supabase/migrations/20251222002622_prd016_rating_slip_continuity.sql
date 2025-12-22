-- Migration: PRD-016 Rating Slip Session Continuity
-- Purpose: Enable session continuity across player table/seat moves
--
-- Changes:
-- 1. Add slip chaining columns (previous_slip_id, move_group_id)
-- 2. Add duration continuity columns (accumulated_seconds, final_duration_seconds)
-- 3. Add partial unique index for max 1 open/paused slip per visit
-- 4. Add indexes for efficient chain traversal
-- 5. Enforce visit_id NOT NULL on player_financial_transaction
--
-- Session Identity: visit_id is the canonical operator session key (not move_group_id)
-- move_group_id is segment-chain metadata for traversal/presentation/audit only

-- ============================================================================
-- 1. Add slip chaining and duration continuity columns to rating_slip
-- ============================================================================

-- previous_slip_id: FK for segment chaining (NULL for first segment)
ALTER TABLE rating_slip
ADD COLUMN IF NOT EXISTS previous_slip_id UUID NULL
REFERENCES rating_slip(id) ON DELETE SET NULL;

COMMENT ON COLUMN rating_slip.previous_slip_id IS
'FK to previous rating slip in segment chain. NULL for first segment of a visit.';

-- move_group_id: Segment chain identifier
-- First segment: NULL (or self-ref set by application)
-- Subsequent moves: carry forward from previous slip
ALTER TABLE rating_slip
ADD COLUMN IF NOT EXISTS move_group_id UUID NULL;

COMMENT ON COLUMN rating_slip.move_group_id IS
'Segment chain identifier. First segment: NULL or self-ref. Moves: carry forward. NOT the session key (use visit_id).';

-- accumulated_seconds: Prior segments total duration (before this segment)
ALTER TABLE rating_slip
ADD COLUMN IF NOT EXISTS accumulated_seconds INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN rating_slip.accumulated_seconds IS
'Total play duration (seconds) from all prior segments in this visit. Excludes current segment.';

-- final_duration_seconds: Authoritative duration computed on close
-- NULL while slip is open/paused, set by compute_slip_final_seconds on close
ALTER TABLE rating_slip
ADD COLUMN IF NOT EXISTS final_duration_seconds INTEGER NULL;

COMMENT ON COLUMN rating_slip.final_duration_seconds IS
'Authoritative play duration (seconds) for this segment. Set on close via compute_slip_final_seconds. NULL while active.';

-- ============================================================================
-- 2. Partial unique index: max 1 open/paused slip per visit
-- ============================================================================

-- This constraint prevents race conditions where two pit bosses create
-- overlapping slips for the same visit. Combined with visit row locking
-- in the move endpoint, this ensures data integrity.

CREATE UNIQUE INDEX IF NOT EXISTS idx_rating_slip_one_active_per_visit
ON rating_slip (visit_id)
WHERE status IN ('open', 'paused');

COMMENT ON INDEX idx_rating_slip_one_active_per_visit IS
'Enforces at most one open or paused rating slip per visit. Prevents concurrent slip creation races.';

-- ============================================================================
-- 3. Indexes for efficient chain traversal
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_rating_slip_previous_slip_id
ON rating_slip(previous_slip_id)
WHERE previous_slip_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rating_slip_move_group_id
ON rating_slip(move_group_id)
WHERE move_group_id IS NOT NULL;

-- ============================================================================
-- 4. Enforce visit_id NOT NULL on player_financial_transaction
-- ============================================================================

-- All financial transactions must be anchored to a visit for proper session
-- tracking. This enforces the invariant that financials are visit-scoped.
--
-- Prerequisites:
-- - All existing rows must have visit_id populated
-- - Application code must always provide visit_id when creating transactions

-- First, check for any NULL visit_id values (diagnostic)
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM player_financial_transaction
  WHERE visit_id IS NULL;

  IF orphan_count > 0 THEN
    RAISE WARNING 'Found % financial transactions with NULL visit_id. These must be fixed before enforcing NOT NULL.', orphan_count;
  END IF;
END $$;

-- Enforce NOT NULL constraint
-- Note: This will fail if there are existing NULL values
ALTER TABLE player_financial_transaction
ALTER COLUMN visit_id SET NOT NULL;

-- ============================================================================
-- 5. Verification queries (for manual validation)
-- ============================================================================

-- Verify columns added:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'rating_slip'
-- AND column_name IN ('previous_slip_id', 'move_group_id', 'accumulated_seconds', 'final_duration_seconds');

-- Verify partial unique index:
-- SELECT indexname, indexdef FROM pg_indexes WHERE indexname = 'idx_rating_slip_one_active_per_visit';

-- Verify visit_id NOT NULL:
-- SELECT column_name, is_nullable FROM information_schema.columns
-- WHERE table_name = 'player_financial_transaction' AND column_name = 'visit_id';

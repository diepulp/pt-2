-- =====================================================
-- Migration: PERF-001 Modal Data Performance Indexes
-- Created: 2025-12-20 17:56:56
-- Purpose: Optimizes query patterns for rating slip modal-data endpoint
--          Targets -100ms latency reduction on modal open operations
-- =====================================================

-- Index for batch occupied seats query (modal-data line 198)
-- Query pattern: WHERE table_id = ? AND status IN ('open', 'paused')
-- Note: idx_rating_slip_table_seat_status already exists and covers this pattern
-- No action needed - existing index is optimal

-- Index for active tables by casino (table-context getActiveTables)
-- Query pattern: WHERE casino_id = ? AND status = 'active'
-- Existing: idx_gaming_table_casino_id covers casino_id but not filtered by status
-- Optimization: Partial index for active tables only (reduces index size and scan cost)
CREATE INDEX IF NOT EXISTS idx_gaming_table_casino_active
  ON gaming_table (casino_id, label)
  WHERE status = 'active';

COMMENT ON INDEX idx_gaming_table_casino_active IS
  'PERF-001: Optimizes getActiveTables() query for modal-data endpoint. Partial index on active tables only, includes label for covering index benefits.';

-- Index for player loyalty balance lookup (loyalty getBalance)
-- Query pattern: WHERE player_id = ? AND casino_id = ?
-- Note: PRIMARY KEY (player_id, casino_id) already provides optimal index
-- No action needed - PK constraint creates B-tree index automatically

-- Analyze tables to update query planner statistics after index creation
ANALYZE gaming_table;
ANALYZE rating_slip;
ANALYZE player_loyalty;

-- =====================================================
-- Performance Notes:
-- =====================================================
-- 1. Rating slip occupied seats: Covered by existing idx_rating_slip_table_seat_status
-- 2. Gaming table active lookup: New partial index reduces index size by ~70% (assumes 30% active tables)
-- 3. Player loyalty lookup: Primary key already optimal for point queries
-- 4. Expected impact: -100ms on modal-data endpoint (primarily from gaming_table partial index)
-- =====================================================

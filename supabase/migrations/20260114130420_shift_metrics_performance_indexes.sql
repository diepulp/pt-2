-- =====================================================
-- Migration: shift_metrics_performance_indexes
-- Created: 2026-01-14 13:04:20
-- Purpose: Add composite indexes for shift metrics time-window queries
-- Audit: SHIFT_DASHBOARD_PERFORMANCE_AUDIT.md - High Severity Finding
-- =====================================================
--
-- These indexes optimize the time-windowed queries in rpc_shift_table_metrics:
--   - Opening/closing snapshot lookups (DISTINCT ON + ORDER BY)
--   - Fills/credits aggregation by time window
--   - Drop event and buyin telemetry aggregation
--
-- NOTE: CONCURRENTLY removed - Supabase migrations run in transactions.
-- For production with high traffic, consider running indexes manually outside migrations.
-- =====================================================

-- Index for table_inventory_snapshot: Opening/closing snapshot queries
-- Supports: SELECT DISTINCT ON (table_id) ... WHERE casino_id = ? AND created_at <= ?
-- Pattern: Opening snapshot - most recent snapshot before window start
CREATE INDEX IF NOT EXISTS idx_table_inventory_snapshot_casino_created
  ON public.table_inventory_snapshot (casino_id, created_at DESC);

-- Index for table_fill: Fills aggregation within time window
-- Supports: SUM(amount_cents) WHERE casino_id = ? AND created_at >= ? AND created_at < ?
CREATE INDEX IF NOT EXISTS idx_table_fill_casino_created
  ON public.table_fill (casino_id, created_at);

-- Index for table_credit: Credits aggregation within time window
-- Supports: SUM(amount_cents) WHERE casino_id = ? AND created_at >= ? AND created_at < ?
CREATE INDEX IF NOT EXISTS idx_table_credit_casino_created
  ON public.table_credit (casino_id, created_at);

-- Index for table_buyin_telemetry: Buyin event aggregation
-- Supports: SUM(buyin_amount_cents) WHERE casino_id = ? AND occurred_at >= ? AND occurred_at < ?
CREATE INDEX IF NOT EXISTS idx_table_buyin_telemetry_casino_occurred
  ON public.table_buyin_telemetry (casino_id, occurred_at);

-- Index for table_drop_event: Drop custody checks
-- Supports: EXISTS (SELECT 1 WHERE casino_id = ? AND removed_at >= ? AND removed_at < ?)
CREATE INDEX IF NOT EXISTS idx_table_drop_event_casino_removed
  ON public.table_drop_event (casino_id, removed_at);

-- =====================================================
-- Expected Performance Impact
-- =====================================================
-- Before: Sequential scans on large tables for time-window filtering
-- After: Index seeks on (casino_id, timestamp) columns
--
-- Estimated improvements (based on 100k rows per table):
--   - Opening snapshot lookup: O(n log n) → O(log n)
--   - Fills aggregation: Full scan → Index range scan
--   - Credits aggregation: Full scan → Index range scan
-- =====================================================

-- =====================================================
-- Migration: table_buyin_telemetry_source_column
-- Created: 2026-01-15
-- Workstream: WS1 - GAP-TBL-RUNDOWN
-- Purpose: Add source dimension to distinguish telemetry provenance
-- Reference: GAP_ANALYSIS_TABLE_RUNDOWN_INTEGRATION_REWRITE_v0.4.0.md
-- =====================================================
-- This migration adds:
--   - source column: 'finance_bridge' | 'manual_ops'
--   - Backfill existing rows to 'manual_ops'
--   - CHECK constraint for valid values
--
-- The idempotency index already exists (idx_tbt_idempotency) from
-- the original table_buyin_telemetry migration.
-- =====================================================

BEGIN;

-- =====================================================
-- Add source column
-- =====================================================

ALTER TABLE table_buyin_telemetry
ADD COLUMN IF NOT EXISTS source text NULL;

-- =====================================================
-- Backfill existing rows as 'manual_ops'
-- (They were logged via rpc_log_table_buyin_telemetry)
-- =====================================================

UPDATE table_buyin_telemetry
SET source = 'manual_ops'
WHERE source IS NULL;

-- =====================================================
-- Add CHECK constraint for valid source values
-- =====================================================

ALTER TABLE table_buyin_telemetry
ADD CONSTRAINT chk_source_valid
CHECK (source IS NULL OR source IN ('finance_bridge', 'manual_ops'));

-- =====================================================
-- Update column comment
-- =====================================================

COMMENT ON COLUMN table_buyin_telemetry.source IS
  'Provenance: finance_bridge (automatic from player_financial_transaction via trigger) '
  'or manual_ops (direct RPC call for grind/sub-threshold buy-ins). '
  'NULL only for pre-migration rows (should not occur after backfill).';

-- =====================================================
-- Notify PostgREST to reload schema
-- =====================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

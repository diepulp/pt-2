-- ============================================================================
-- Migration: PRD-033 Drop Event Cage Received Columns
-- Created: 2026-02-17
-- PRD Reference: docs/10-prd/PRD-033-cashier-workflow-mvp-v0.md
-- Purpose: Add cage-side receipt acknowledgement columns to table_drop_event
--          for ghost-drop prevention workflow.
-- ============================================================================

ALTER TABLE table_drop_event
  ADD COLUMN IF NOT EXISTS cage_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS cage_received_by uuid REFERENCES staff(id);

-- Partial index includes gaming_day to avoid infinite backlog scan
CREATE INDEX IF NOT EXISTS idx_drop_event_pending
  ON table_drop_event (casino_id, gaming_day) WHERE cage_received_at IS NULL;

NOTIFY pgrst, 'reload schema';

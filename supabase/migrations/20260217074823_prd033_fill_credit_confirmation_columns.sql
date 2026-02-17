-- ============================================================================
-- Migration: PRD-033 Fill/Credit Confirmation Columns
-- Created: 2026-02-17
-- PRD Reference: docs/10-prd/PRD-033-cashier-workflow-mvp-v0.md
-- Purpose: Add two-step request→confirmation lifecycle columns to table_fill
--          and table_credit for cashier attestation workflow.
-- Backward Compatibility: DEFAULT 'confirmed' ensures existing rows treated
--          as already confirmed (they were fulfilled at insert time).
-- ============================================================================

-- table_fill confirmation columns
ALTER TABLE table_fill
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS confirmed_amount_cents int,
  ADD COLUMN IF NOT EXISTS discrepancy_note text;

-- Add CHECK constraint separately (IF NOT EXISTS doesn't support inline CHECK)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'table_fill_status_check'
  ) THEN
    ALTER TABLE table_fill ADD CONSTRAINT table_fill_status_check
      CHECK (status IN ('requested', 'confirmed'));
  END IF;
END $$;

-- table_credit confirmation columns (identical pattern)
ALTER TABLE table_credit
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS confirmed_amount_cents int,
  ADD COLUMN IF NOT EXISTS discrepancy_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'table_credit_status_check'
  ) THEN
    ALTER TABLE table_credit ADD CONSTRAINT table_credit_status_check
      CHECK (status IN ('requested', 'confirmed'));
  END IF;
END $$;

-- Partial indexes for pending queue queries (cashier console)
CREATE INDEX IF NOT EXISTS idx_table_fill_status_casino
  ON table_fill (casino_id, status) WHERE status = 'requested';
CREATE INDEX IF NOT EXISTS idx_table_credit_status_casino
  ON table_credit (casino_id, status) WHERE status = 'requested';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Migration: PRD-033 Financial Transaction External Ref
-- Created: 2026-02-17
-- PRD Reference: docs/10-prd/PRD-033-cashier-workflow-mvp-v0.md
-- Purpose: Add receipt/ticket reference field to player_financial_transaction
--          for cage cash-out confirmation workflow.
-- ============================================================================

ALTER TABLE player_financial_transaction
  ADD COLUMN IF NOT EXISTS external_ref text;

COMMENT ON COLUMN player_financial_transaction.external_ref IS
  'Receipt/ticket reference for cage transactions (PRD-033)';

NOTIFY pgrst, 'reload schema';

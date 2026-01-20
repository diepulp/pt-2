-- ============================================================================
-- Migration: MTL Derived-Only Constraint for Financial Types
-- Created: 2026-01-20
-- PRD Reference: PRD-MTL-VIEW-MODAL-KILL-REVERSE-BRIDGE
-- Purpose: Enforce that buy_in/cash_out MTL entries must originate from
--          the forward bridge (player_financial_transaction -> mtl_entry)
-- ============================================================================
-- This constraint ensures:
--   - Financial-type MTL entries (buy_in, cash_out) MUST have idempotency_key
--     with 'fin:' prefix, indicating they were created by the forward bridge
--   - Non-financial MTL types are unaffected
--   - Prevents manual/UI creation of competing financial ledger entries
--
-- Rationale:
--   player_financial_transaction is the single source of truth for rating slip
--   totals. MTL entries for financial types are strictly DERIVED via the
--   forward bridge trigger (trg_derive_mtl_from_finance).
-- ============================================================================

BEGIN;

-- ============================================================================
-- Add CHECK constraint (idempotent)
-- ============================================================================

DO $$
BEGIN
  -- Only add if constraint doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mtl_financial_types_must_be_derived'
    AND conrelid = 'public.mtl_entry'::regclass
  ) THEN
    ALTER TABLE public.mtl_entry
    ADD CONSTRAINT mtl_financial_types_must_be_derived
    CHECK (
      txn_type NOT IN ('buy_in', 'cash_out')
      OR (idempotency_key IS NOT NULL AND idempotency_key LIKE 'fin:%')
    );

    RAISE NOTICE 'Constraint mtl_financial_types_must_be_derived added to mtl_entry';
  ELSE
    RAISE NOTICE 'Constraint mtl_financial_types_must_be_derived already exists, skipping';
  END IF;
END $$;

-- ============================================================================
-- Add comment for documentation
-- ============================================================================

COMMENT ON CONSTRAINT mtl_financial_types_must_be_derived ON public.mtl_entry IS
  'PRD-MTL-VIEW-MODAL-KILL-REVERSE-BRIDGE: Enforces that buy_in and cash_out '
  'MTL entries must originate from the forward bridge (fn_derive_mtl_from_finance). '
  'These entries must have idempotency_key LIKE ''fin:%'' to prove derivation. '
  'This prevents UI/API regression creating a competing financial ledger.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

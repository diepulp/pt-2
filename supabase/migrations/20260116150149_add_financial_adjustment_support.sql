-- =====================================================
-- Migration: Financial Adjustment Support
-- Created: 2026-01-16 15:01:49 UTC
-- Purpose: Add adjustment/reversal transaction support for compliance-friendly
--          corrections to financial totals without editing/deleting originals.
-- =====================================================
--
-- Strategy: "Total Cash In is never edited - it's re-expressed by adding
--           a new, explicit record that explains the correction."
--
-- Key Design Principles:
--   - Non-destructive: No UPDATE/DELETE on historical rows
--   - Attributable: Who made the adjustment
--   - Scoped: casino_id + gaming_day/visit_id
--   - Justified: reason_code + note required
--   - Reversible: Can undo with another adjustment
--   - Traceable: related_txn_id links to original
--
-- New Columns:
--   - txn_kind: 'original' | 'adjustment' | 'reversal'
--   - reason_code: Required for adjustments
--   - note: Required for adjustments
--
-- Constraints:
--   - Negative amounts only for adjustment/reversal
--   - Adjustments require reason_code + note
-- =====================================================

BEGIN;

-- =============================================================================
-- STEP 1: Create new enum types
-- =============================================================================

-- Transaction kind: distinguishes original entries from corrections
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'financial_txn_kind') THEN
    CREATE TYPE financial_txn_kind AS ENUM ('original', 'adjustment', 'reversal');
  END IF;
END;
$$;

-- Reason codes for adjustments (compliance requirement)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'adjustment_reason_code') THEN
    CREATE TYPE adjustment_reason_code AS ENUM (
      'data_entry_error',  -- Staff entered wrong amount
      'duplicate',         -- Transaction was recorded twice
      'wrong_player',      -- Applied to wrong player
      'wrong_amount',      -- Amount was incorrect
      'system_bug',        -- System created erroneous record
      'other'              -- Requires detailed note
    );
  END IF;
END;
$$;

-- =============================================================================
-- STEP 2: Add new columns to player_financial_transaction
-- =============================================================================

ALTER TABLE public.player_financial_transaction
  ADD COLUMN IF NOT EXISTS txn_kind financial_txn_kind NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS reason_code adjustment_reason_code,
  ADD COLUMN IF NOT EXISTS note text;

-- Add comment explaining the columns
COMMENT ON COLUMN public.player_financial_transaction.txn_kind IS
  'Transaction kind: original (initial entry), adjustment (correction), reversal (undo adjustment)';

COMMENT ON COLUMN public.player_financial_transaction.reason_code IS
  'Required for adjustments. Explains why correction was needed.';

COMMENT ON COLUMN public.player_financial_transaction.note IS
  'Required for adjustments. Free-text explanation with additional context.';

-- =============================================================================
-- STEP 3: Handle existing data before adding constraints
-- =============================================================================

-- If there are any existing rows with negative amounts, mark them as adjustments
-- This is a one-time data migration to handle pre-existing data
UPDATE public.player_financial_transaction
SET txn_kind = 'adjustment',
    reason_code = 'system_bug',
    note = 'Pre-migration adjustment: Existing negative amount transaction migrated to adjustment type'
WHERE amount < 0 AND txn_kind = 'original';

-- =============================================================================
-- STEP 4: Add constraints for data integrity
-- =============================================================================

-- Constraint 1: Negative amounts only allowed for adjustment/reversal
-- Note: Using a function to check because we need conditional logic
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_negative_amount_requires_adjustment_kind'
  ) THEN
    ALTER TABLE public.player_financial_transaction
      ADD CONSTRAINT chk_negative_amount_requires_adjustment_kind
      CHECK (
        amount >= 0 OR txn_kind IN ('adjustment', 'reversal')
      );
  END IF;
END;
$$;

-- Constraint 2: Adjustments require reason_code and note (STEP 4 continued)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_adjustment_requires_justification'
  ) THEN
    ALTER TABLE public.player_financial_transaction
      ADD CONSTRAINT chk_adjustment_requires_justification
      CHECK (
        txn_kind = 'original' OR (
          reason_code IS NOT NULL AND
          note IS NOT NULL AND
          length(trim(note)) > 0
        )
      );
  END IF;
END;
$$;

-- =============================================================================
-- STEP 5: Create the adjustment RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_create_financial_adjustment(
  p_casino_id uuid,
  p_player_id uuid,
  p_visit_id uuid,
  p_delta_amount numeric,                -- Signed: negative reduces total, positive increases
  p_reason_code adjustment_reason_code,
  p_note text,
  p_original_txn_id uuid DEFAULT NULL,   -- Optional: link to the transaction being corrected
  p_idempotency_key text DEFAULT NULL
) RETURNS player_financial_transaction
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_original_txn player_financial_transaction%ROWTYPE;
  v_row player_financial_transaction%ROWTYPE;
  v_direction financial_direction;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- =======================================================================
  -- Authentication and Authorization Checks
  -- =======================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  IF v_casino_id IS NULL OR v_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Casino ID mismatch';
  END IF;

  -- Only pit_boss, cashier, admin can create adjustments
  IF v_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % not authorized for adjustments', v_staff_role;
  END IF;

  -- =======================================================================
  -- Input Validation
  -- =======================================================================
  IF p_delta_amount = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Delta amount cannot be zero';
  END IF;

  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Note is required for adjustments';
  END IF;

  IF length(trim(p_note)) < 10 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Note must be at least 10 characters';
  END IF;

  -- =======================================================================
  -- If linking to original transaction, validate and inherit scope
  -- =======================================================================
  IF p_original_txn_id IS NOT NULL THEN
    SELECT * INTO v_original_txn
      FROM player_financial_transaction
     WHERE id = p_original_txn_id
       AND casino_id = p_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND: Original transaction not found or access denied';
    END IF;

    -- Enforce scoping consistency: adjustment must be for same player/visit
    IF v_original_txn.player_id <> p_player_id THEN
      RAISE EXCEPTION 'INVALID_INPUT: Cannot adjust transaction for different player';
    END IF;

    IF v_original_txn.visit_id <> p_visit_id THEN
      RAISE EXCEPTION 'INVALID_INPUT: Cannot adjust transaction for different visit';
    END IF;
  END IF;

  -- =======================================================================
  -- Determine direction based on delta sign
  -- Positive delta = more cash in = direction 'in'
  -- Negative delta = less cash in = direction 'in' with negative amount
  -- (We keep direction as 'in' for cash-in adjustments regardless of sign)
  -- =======================================================================
  v_direction := 'in';

  -- =======================================================================
  -- Create the adjustment transaction
  -- =======================================================================
  INSERT INTO public.player_financial_transaction AS t (
    id,
    player_id,
    casino_id,
    visit_id,
    amount,
    direction,
    source,
    tender_type,
    created_by_staff_id,
    related_transaction_id,
    created_at,
    idempotency_key,
    txn_kind,
    reason_code,
    note
  )
  VALUES (
    gen_random_uuid(),
    p_player_id,
    p_casino_id,
    p_visit_id,
    p_delta_amount,                    -- Can be negative for corrections
    v_direction,
    'pit',                             -- Adjustments always come from pit staff
    'adjustment',                      -- Special tender type to distinguish
    v_actor_id,
    p_original_txn_id,
    now(),
    p_idempotency_key,
    'adjustment',
    p_reason_code,
    p_note
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING t.* INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION rpc_create_financial_adjustment IS
  'Creates a financial adjustment transaction. Used for compliance-friendly corrections '
  'to cash-in totals without modifying/deleting original records. '
  'Requires: reason_code + note (min 10 chars). '
  'Authorization: pit_boss, cashier, or admin role. '
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context.';

-- =============================================================================
-- STEP 6: Grant execute permission to authenticated users
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.rpc_create_financial_adjustment TO authenticated;

-- =============================================================================
-- STEP 7: Create index for efficient adjustment queries
-- =============================================================================

-- Index for finding adjustments linked to a specific transaction
CREATE INDEX IF NOT EXISTS idx_financial_txn_related_txn_id
  ON public.player_financial_transaction (related_transaction_id)
  WHERE related_transaction_id IS NOT NULL;

-- Index for finding adjustments by kind (for reporting)
CREATE INDEX IF NOT EXISTS idx_financial_txn_kind
  ON public.player_financial_transaction (txn_kind)
  WHERE txn_kind != 'original';

-- =============================================================================
-- STEP 8: Create helper function to get adjustments summary for a visit
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_visit_cash_in_with_adjustments(
  p_visit_id uuid
) RETURNS TABLE (
  original_total numeric,
  adjustment_total numeric,
  net_total numeric,
  adjustment_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN txn_kind = 'original' AND direction = 'in' THEN amount ELSE 0 END), 0) AS original_total,
    COALESCE(SUM(CASE WHEN txn_kind IN ('adjustment', 'reversal') AND direction = 'in' THEN amount ELSE 0 END), 0) AS adjustment_total,
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END), 0) AS net_total,
    COUNT(CASE WHEN txn_kind IN ('adjustment', 'reversal') THEN 1 END)::integer AS adjustment_count
  FROM player_financial_transaction
  WHERE visit_id = p_visit_id;
$$;

COMMENT ON FUNCTION get_visit_cash_in_with_adjustments IS
  'Returns breakdown of cash-in totals for a visit: original entries, adjustments, and net total. '
  'Useful for displaying "Total Cash In (computed): $X | Adjustments: +$A/-$B | Net: $Y"';

GRANT EXECUTE ON FUNCTION public.get_visit_cash_in_with_adjustments TO authenticated;

-- =============================================================================
-- STEP 9: Notify PostgREST to reload schema
-- =============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

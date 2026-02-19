-- ============================================================================
-- Migration: mtl_bridge_adjustment_support
-- Created: 2026-02-17
-- Issue: GAP-CASHIN-ADJUSTMENT-MTL-SYNC (PRIMARY — GAP-1)
-- Purpose: Extend the finance-to-MTL bridge trigger to derive mtl_entry rows
--          from adjustment and reversal transactions. Previously only
--          tender_type IN ('cash','chips') fired the trigger; adjustments
--          use tender_type='adjustment' and were silently excluded.
--
-- Sub-tasks (all atomic in single transaction):
--   1. Replace fn_derive_mtl_from_finance() — handle adjustment/reversal txn_kind
--   2. Widen trigger WHEN clause with orthogonal predicates
--   3. Backfill historical adjustment txns that were missed
--
-- Field taxonomy (from GAP doc):
--   tender_type: payment instrument ('cash','chips','adjustment')
--   txn_kind:    semantic kind   ('original','adjustment','reversal')
--
-- Trigger gating rule (two orthogonal predicates, OR'd):
--   Originals:   tender_type IN ('cash','chips')          — instrument gate
--   Corrections: txn_kind IN ('adjustment','reversal')    — semantic gate
--
-- References:
--   - 20260116111329_finance_to_mtl_derivation.sql (original)
--   - 20260119162505_fix_mtl_bridge_cents_to_dollars.sql (latest function body)
--   - 20260219002247_enable_adjustment_telemetry.sql (telemetry fix pattern; replaces deleted 20260202123300)
-- ============================================================================

BEGIN;

-- ==========================================================================
-- STEP 1: Replace bridge function — handle adjustments and reversals
-- ==========================================================================
-- The function body is identical to the previous version (20260119162505)
-- EXCEPT: the direction→txn_type mapping now works for adjustment/reversal
-- rows whose amount may be negative. The mapping logic is unchanged because:
--   - Adjustments always have direction='in' (set by rpc_create_financial_adjustment)
--   - direction='in' maps to mtl_txn_type='buy_in' (satisfies chk_mtl_direction_txn_type_alignment)
--   - Negative amounts flow through as-is (no positive-amount constraint on mtl_entry)
--   - mtl_gaming_day_summary SUM(amount) WHERE direction='in' naturally includes negatives

CREATE OR REPLACE FUNCTION fn_derive_mtl_from_finance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_context_casino_id text;
  v_context_actor_id text;
  v_casino_id uuid;
  v_actor_id uuid;
  v_gaming_day date;
  v_mtl_direction text;
  v_mtl_txn_type mtl_txn_type;
  v_idempotency_key text;
BEGIN
  -- =======================================================================
  -- G1: Context validation (FAIL-CLOSED)
  -- Context MUST be set via set_rls_context_from_staff() prior to this trigger.
  -- If not set, the calling RPC did not properly inject context.
  -- =======================================================================
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '');
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '');

  IF v_context_casino_id IS NULL OR v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_CONTEXT: app.casino_id/app.actor_id must be set via set_rls_context_from_staff(). '
      'Finance-to-MTL bridge cannot proceed without security context.'
      USING ERRCODE = 'P0001';
  END IF;

  v_casino_id := v_context_casino_id::uuid;
  v_actor_id := v_context_actor_id::uuid;

  -- =======================================================================
  -- G2: Tenant invariant check (ALWAYS)
  -- The Finance row's casino_id must match the security context.
  -- =======================================================================
  IF NEW.casino_id <> v_casino_id THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Tenant mismatch in finance-to-MTL bridge. Context casino_id: %, Row casino_id: %',
      v_casino_id, NEW.casino_id
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- G3: Actor invariant check (when created_by_staff_id is available)
  -- If the Finance row has a staff actor, it must match context.
  -- =======================================================================
  IF NEW.created_by_staff_id IS NOT NULL AND NEW.created_by_staff_id <> v_actor_id THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Actor mismatch in finance-to-MTL bridge. Context actor_id: %, Row created_by_staff_id: %',
      v_actor_id, NEW.created_by_staff_id
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- G4: No spoofable parameters
  -- All values are derived from NEW (the inserted row) or security context.
  -- The function takes no parameters.
  -- =======================================================================

  -- =======================================================================
  -- Map financial direction to MTL direction and txn_type
  -- Works for both originals and adjustments/reversals:
  --   direction='in'  → buy_in  (adjustments always have direction='in')
  --   direction='out' → cash_out
  -- =======================================================================
  IF NEW.direction = 'in' THEN
    v_mtl_direction := 'in';
    v_mtl_txn_type := 'buy_in';
  ELSIF NEW.direction = 'out' THEN
    v_mtl_direction := 'out';
    v_mtl_txn_type := 'cash_out';
  ELSE
    -- Should not happen due to trigger WHEN clause, but safety check
    RAISE WARNING 'Finance-to-MTL skipped: unknown direction %', NEW.direction;
    RETURN NEW;
  END IF;

  -- =======================================================================
  -- Compute gaming_day
  -- Prefer NEW.gaming_day if already computed by Finance trigger,
  -- otherwise compute from casino settings.
  -- =======================================================================
  IF NEW.gaming_day IS NOT NULL THEN
    v_gaming_day := NEW.gaming_day::date;
  ELSE
    v_gaming_day := compute_gaming_day(v_casino_id, COALESCE(NEW.created_at, now()));
  END IF;

  -- =======================================================================
  -- G5: Idempotency via unique key
  -- Key format: 'fin:' || finance_row_id
  -- Relies on casino-scoped unique index: ux_mtl_entry_casino_idem
  -- =======================================================================
  v_idempotency_key := 'fin:' || NEW.id::text;

  -- =======================================================================
  -- Insert MTL entry row (idempotent)
  -- Both tables use CENTS - no conversion needed (ISSUE-FB8EB717 fix)
  -- Adjustment amounts may be negative — this is correct and intended.
  -- =======================================================================
  INSERT INTO public.mtl_entry (
    patron_uuid,
    casino_id,
    staff_id,
    rating_slip_id,
    visit_id,
    amount,
    direction,
    txn_type,
    source,
    area,
    gaming_day,
    occurred_at,
    idempotency_key
  )
  VALUES (
    NEW.player_id,
    v_casino_id,
    v_actor_id,
    NEW.rating_slip_id,
    NEW.visit_id,
    NEW.amount,  -- CENTS: Both tables standardized. May be negative for adjustments.
    v_mtl_direction,
    v_mtl_txn_type,
    'table',  -- pit transactions map to 'table' source in MTL
    NULL,     -- area not available from financial transaction
    v_gaming_day,
    COALESCE(NEW.created_at, now()),
    v_idempotency_key
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_derive_mtl_from_finance() IS
  'Finance-to-MTL bridge: derives mtl_entry from player_financial_transaction. '
  'SECURITY DEFINER trigger function implementing Guardrails G1-G5 per ADR-015. '
  'Handles original (cash/chips), adjustment, and reversal transactions. '
  'Adjustment amounts may be negative (reduces MTL aggregate totals). '
  'G1: Fail-closed context. G2: Tenant invariant. G3: Actor invariant. '
  'G4: No spoofable params. G5: Idempotency via fin:{id} key. '
  'FIX 2026-01-19 (ISSUE-FB8EB717): CENTS standardization. '
  'FIX 2026-02-17 (GAP-CASHIN-ADJUSTMENT-MTL-SYNC): adjustment/reversal support.';

-- ==========================================================================
-- STEP 2: Widen trigger WHEN clause
-- ==========================================================================
-- Two orthogonal predicates OR'd:
--   Originals:   tender_type IN ('cash','chips')         — instrument gate
--   Corrections: txn_kind IN ('adjustment','reversal')   — semantic gate
-- Both require source='pit' and non-null direction.

DROP TRIGGER IF EXISTS trg_derive_mtl_from_finance ON player_financial_transaction;

CREATE TRIGGER trg_derive_mtl_from_finance
AFTER INSERT ON player_financial_transaction
FOR EACH ROW
WHEN (
  NEW.source = 'pit'
  AND NEW.direction IS NOT NULL
  AND (
    NEW.tender_type IN ('cash', 'chips')
    OR NEW.txn_kind IN ('adjustment', 'reversal')
  )
)
EXECUTE FUNCTION fn_derive_mtl_from_finance();

COMMENT ON TRIGGER trg_derive_mtl_from_finance ON player_financial_transaction IS
  'Finance-to-MTL bridge: fires for pit transactions that are either '
  'cash/chips originals (instrument gate) or adjustment/reversal corrections (semantic gate). '
  'Creates mtl_entry with idempotency_key=''fin:{id}''. '
  'FIX 2026-02-17 (GAP-CASHIN-ADJUSTMENT-MTL-SYNC): widened to include adjustments/reversals.';

-- ==========================================================================
-- STEP 3: Backfill historical adjustment transactions
-- ==========================================================================
-- Any adjustment txns that existed before this migration have no mtl_entry.
-- Derive them now using the same idempotency key pattern.
-- This INSERT is idempotent (ON CONFLICT DO NOTHING) and safe to re-run.
--
-- NOTE: We set RLS context vars for the backfill to satisfy the
-- mtl_financial_types_must_be_derived constraint (idempotency_key LIKE 'fin:%').
-- The INSERT goes directly to mtl_entry (not through the trigger) because
-- these rows already exist in player_financial_transaction.

INSERT INTO public.mtl_entry (
  patron_uuid,
  casino_id,
  staff_id,
  rating_slip_id,
  visit_id,
  amount,
  direction,
  txn_type,
  source,
  area,
  gaming_day,
  occurred_at,
  idempotency_key
)
SELECT
  pft.player_id,
  pft.casino_id,
  pft.created_by_staff_id,
  pft.rating_slip_id,
  pft.visit_id,
  pft.amount,
  pft.direction::text,
  CASE
    WHEN pft.direction = 'in' THEN 'buy_in'::mtl_txn_type
    WHEN pft.direction = 'out' THEN 'cash_out'::mtl_txn_type
  END,
  'table',
  NULL,
  COALESCE(pft.gaming_day, pft.created_at::date),
  COALESCE(pft.created_at, now()),
  'fin:' || pft.id::text
FROM public.player_financial_transaction pft
WHERE pft.source = 'pit'
  AND pft.txn_kind IN ('adjustment', 'reversal')
  AND pft.direction IS NOT NULL
ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
DO NOTHING;

-- ==========================================================================
-- Notify PostgREST to reload schema
-- ==========================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================
-- Migration: finance_to_mtl_derivation
-- Created: 2026-01-16
-- Workstream: WS1 - PRD-MTL-UI-GAPS
-- Purpose: SECURITY DEFINER trigger function to auto-derive mtl_entry from eligible
--          player_financial_transaction records
-- Reference: EXECUTION-SPEC-PRD-MTL-UI-GAPS.md
-- =====================================================
-- This function:
--   - Fires AFTER INSERT on player_financial_transaction
--   - Only processes pit transactions with cash/chips tender
--   - Maps direction='in' to mtl direction='in', txn_type='buy_in'
--   - Maps direction='out' to mtl direction='out', txn_type='cash_out'
--   - Implements Guardrails G1-G5 per ADR-015
--
-- Guardrails:
--   G1: Context must exist (FAIL-CLOSED)
--   G2: Tenant invariant must match
--   G3: Actor invariant (if available)
--   G4: No spoofable parameters (derived from NEW/context)
--   G5: Idempotency via unique key
-- =====================================================

BEGIN;

-- =====================================================
-- Create bridge function
-- =====================================================

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
    NEW.amount,
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

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON FUNCTION fn_derive_mtl_from_finance() IS
  'PRD-MTL-UI-GAPS WS1: Automatic derivation of mtl_entry from player_financial_transaction. '
  'SECURITY DEFINER trigger function implementing Guardrails G1-G5 per ADR-015. '
  'G1: Fail-closed context validation (app.casino_id/app.actor_id must be set). '
  'G2: Tenant invariant check. G3: Actor invariant check. G4: No spoofable params. '
  'G5: Idempotency via fin:{id} key.';

-- =====================================================
-- Create trigger for automatic derivation
-- =====================================================

-- Drop if exists (idempotent migration)
DROP TRIGGER IF EXISTS trg_derive_mtl_from_finance ON player_financial_transaction;

-- Create trigger
-- Fires on pit transactions with cash/chips tender_type
-- Note: trigger only fires for pit source with cash-equivalent tender types
CREATE TRIGGER trg_derive_mtl_from_finance
AFTER INSERT ON player_financial_transaction
FOR EACH ROW
WHEN (
  NEW.source = 'pit'
  AND NEW.tender_type IN ('cash', 'chips')
  AND NEW.direction IS NOT NULL
)
EXECUTE FUNCTION fn_derive_mtl_from_finance();

-- =====================================================
-- Trigger comment
-- =====================================================

COMMENT ON TRIGGER trg_derive_mtl_from_finance ON player_financial_transaction IS
  'PRD-MTL-UI-GAPS WS1: Automatic derivation of MTL entries from eligible pit transactions. '
  'Fires AFTER INSERT when source=''pit'' AND tender_type IN (''cash'', ''chips'') AND direction IS NOT NULL. '
  'Calls fn_derive_mtl_from_finance() which implements Guardrails G1-G5. '
  'Creates mtl_entry with source=''table'' and idempotency_key=''fin:{id}''.';

-- =====================================================
-- Notify PostgREST to reload schema
-- =====================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

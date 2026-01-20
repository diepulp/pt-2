-- =====================================================
-- Migration: reverse_mtl_to_finance_bridge
-- Created: 2026-01-19
-- Purpose: Create bidirectional bridge from mtl_entry to player_financial_transaction
--          When MTL entries are created manually in the Compliance Dashboard,
--          a corresponding financial transaction is created so rating slip
--          totals (session_total_buy_in) are updated.
-- Reference: Bidirectional MTL-Financial Bridge Plan
-- =====================================================
-- This function:
--   - Fires AFTER INSERT on mtl_entry
--   - Skips if idempotency_key starts with 'fin:' (already from financial side)
--   - Skips if visit_id is NULL (compliance-only entries, no financial impact)
--   - Creates corresponding player_financial_transaction with source='pit'
--   - Implements Guardrails G1-G5 per ADR-015
--
-- Circularity Prevention:
--   - Forward bridge (fin->mtl): Creates MTL with key 'fin:{finance_id}'
--   - Reverse bridge (mtl->fin): Creates financial with key 'mtl:{mtl_entry_id}'
--   - Each trigger checks the prefix and skips if from the other direction
-- =====================================================

BEGIN;

-- =====================================================
-- Create reverse bridge function (MTL -> Financial)
-- =====================================================

CREATE OR REPLACE FUNCTION fn_derive_finance_from_mtl()
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
  v_amount_cents bigint;
  v_idempotency_key text;
  v_tender_type text;
BEGIN
  -- =======================================================================
  -- G0: Skip if this MTL entry was bridged FROM financial transaction
  -- Prevents circular triggering: fin->mtl->fin loop
  -- =======================================================================
  IF NEW.idempotency_key IS NOT NULL AND NEW.idempotency_key LIKE 'fin:%' THEN
    -- This MTL entry was created by fn_derive_mtl_from_finance
    -- Do not create a financial transaction (would be duplicate)
    RETURN NEW;
  END IF;

  -- =======================================================================
  -- G1: Context validation (FAIL-CLOSED)
  -- Context MUST be set via set_rls_context_from_staff() prior to this trigger.
  -- If not set, the calling RPC did not properly inject context.
  -- =======================================================================
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '');
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '');

  IF v_context_casino_id IS NULL OR v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_CONTEXT: app.casino_id/app.actor_id must be set via set_rls_context_from_staff(). '
      'MTL-to-Finance bridge cannot proceed without security context.'
      USING ERRCODE = 'P0001';
  END IF;

  v_casino_id := v_context_casino_id::uuid;
  v_actor_id := v_context_actor_id::uuid;

  -- =======================================================================
  -- G2: Tenant invariant check (ALWAYS)
  -- The MTL row's casino_id must match the security context.
  -- =======================================================================
  IF NEW.casino_id <> v_casino_id THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Tenant mismatch in MTL-to-finance bridge. Context casino_id: %, Row casino_id: %',
      v_casino_id, NEW.casino_id
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- G3: Actor invariant check (when staff_id is available)
  -- If the MTL row has a staff actor, it must match context.
  -- =======================================================================
  IF NEW.staff_id IS NOT NULL AND NEW.staff_id <> v_actor_id THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Actor mismatch in MTL-to-finance bridge. Context actor_id: %, Row staff_id: %',
      v_actor_id, NEW.staff_id
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- G4: No spoofable parameters
  -- All values are derived from NEW (the inserted row) or security context.
  -- The function takes no parameters.
  -- =======================================================================

  -- =======================================================================
  -- Currency conversion: MTL stores DOLLARS, Financial stores CENTS
  -- MTL amount 3000 (dollars) -> Financial amount 300000 (cents)
  -- =======================================================================
  v_amount_cents := ROUND(NEW.amount * 100)::bigint;

  -- =======================================================================
  -- Map MTL txn_type to tender_type
  -- Default to 'cash' for buy_in, 'chips' for cash_out
  -- =======================================================================
  v_tender_type := CASE
    WHEN NEW.txn_type IN ('buy_in', 'chip_purchase', 'front_money_deposit') THEN 'cash'
    WHEN NEW.txn_type IN ('cash_out', 'chip_redemption', 'front_money_withdrawal') THEN 'chips'
    WHEN NEW.txn_type IN ('marker_issuance', 'marker_repayment') THEN 'marker'
    ELSE 'cash'
  END;

  -- =======================================================================
  -- G5: Idempotency via unique key
  -- Key format: 'mtl:' || mtl_entry_id
  -- Relies on unique index on (casino_id, idempotency_key)
  -- =======================================================================
  v_idempotency_key := 'mtl:' || NEW.id::text;

  -- =======================================================================
  -- Insert financial transaction row (idempotent)
  -- =======================================================================
  INSERT INTO public.player_financial_transaction (
    id,
    casino_id,
    player_id,
    visit_id,
    rating_slip_id,
    amount,
    direction,
    source,
    tender_type,
    created_by_staff_id,
    gaming_day,
    created_at,
    idempotency_key
  )
  VALUES (
    gen_random_uuid(),
    v_casino_id,
    NEW.patron_uuid,
    NEW.visit_id,
    NEW.rating_slip_id,
    v_amount_cents,
    NEW.direction::public.financial_direction,
    'pit'::public.financial_source,
    v_tender_type,
    v_actor_id,
    NEW.gaming_day,
    COALESCE(NEW.occurred_at, now()),
    v_idempotency_key
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;

-- =====================================================
-- Create trigger on mtl_entry
-- Only fires when visit_id and patron_uuid are present
-- (Compliance-only entries without visit don't need financial records)
-- =====================================================

DROP TRIGGER IF EXISTS trg_derive_finance_from_mtl ON public.mtl_entry;

CREATE TRIGGER trg_derive_finance_from_mtl
  AFTER INSERT ON public.mtl_entry
  FOR EACH ROW
  WHEN (NEW.visit_id IS NOT NULL AND NEW.patron_uuid IS NOT NULL)
  EXECUTE FUNCTION fn_derive_finance_from_mtl();

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON FUNCTION fn_derive_finance_from_mtl() IS
  'Bidirectional Bridge: Automatic derivation of player_financial_transaction from mtl_entry. '
  'SECURITY DEFINER trigger function implementing Guardrails G1-G5 per ADR-015. '
  'G0: Skip if idempotency_key starts with fin: (already from financial side). '
  'G1: Fail-closed context validation (app.casino_id/app.actor_id must be set). '
  'G2: Tenant invariant check. G3: Actor invariant check. G4: No spoofable params. '
  'G5: Idempotency via mtl:{id} key. '
  'Converts dollars to cents (NEW.amount * 100) since MTL stores dollars but financial stores cents.';

COMMENT ON TRIGGER trg_derive_finance_from_mtl ON public.mtl_entry IS
  'Bidirectional Bridge: Fires on mtl_entry INSERT to create corresponding player_financial_transaction. '
  'Only fires when visit_id and patron_uuid are present (compliance-only entries skip). '
  'Enables rating slip total_buy_in to reflect MTL entries created via Compliance Dashboard.';

-- =====================================================
-- Notify PostgREST to reload schema
-- =====================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

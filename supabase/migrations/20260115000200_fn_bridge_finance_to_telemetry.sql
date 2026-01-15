-- =====================================================
-- Migration: fn_bridge_finance_to_telemetry
-- Created: 2026-01-15
-- Workstream: WS2 - GAP-TBL-RUNDOWN
-- Purpose: SECURITY DEFINER trigger function implementing Guardrails G1-G5
-- Reference: GAP_ANALYSIS_TABLE_RUNDOWN_INTEGRATION_REWRITE_v0.4.0.md
-- =====================================================
-- This function:
--   - Fires AFTER INSERT on player_financial_transaction
--   - Only processes rated buy-ins (direction='in' AND rating_slip_id IS NOT NULL)
--   - Creates corresponding table_buyin_telemetry row with source='finance_bridge'
--   - Implements Guardrails G1-G5 per GAP v0.4.0
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

CREATE OR REPLACE FUNCTION fn_bridge_finance_to_telemetry()
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
  v_table_id uuid;
  v_gaming_day date;
  v_amount_cents bigint;
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
      'Finance bridge cannot proceed without security context.'
      USING ERRCODE = 'P0001';
  END IF;

  v_casino_id := v_context_casino_id::uuid;
  v_actor_id := v_context_actor_id::uuid;

  -- =======================================================================
  -- G2: Tenant invariant check (ALWAYS)
  -- The Finance row's casino_id must match the security context.
  -- =======================================================================
  IF NEW.casino_id <> v_casino_id THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Tenant mismatch in finance bridge. Context casino_id: %, Row casino_id: %',
      v_casino_id, NEW.casino_id
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- G3: Actor invariant check (when created_by_staff_id is available)
  -- If the Finance row has a staff actor, it must match context.
  -- =======================================================================
  IF NEW.created_by_staff_id IS NOT NULL AND NEW.created_by_staff_id <> v_actor_id THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Actor mismatch in finance bridge. Context actor_id: %, Row created_by_staff_id: %',
      v_actor_id, NEW.created_by_staff_id
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- G4: No spoofable parameters
  -- All values are derived from NEW (the inserted row) or security context.
  -- The function takes no parameters.
  -- =======================================================================

  -- =======================================================================
  -- Resolve table_id from rating_slip
  -- =======================================================================
  SELECT rs.table_id INTO v_table_id
  FROM public.rating_slip rs
  WHERE rs.id = NEW.rating_slip_id;

  IF v_table_id IS NULL THEN
    -- Rating slip not found or has no table_id
    -- This should not happen per SRM (table_id is NOT NULL on rating_slip)
    RAISE WARNING 'Bridge skipped: rating_slip % not found or has no table_id', NEW.rating_slip_id;
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
  -- Amount conversion
  -- Finance stores amount as NUMERIC (dollars),
  -- Telemetry stores amount_cents as BIGINT (cents).
  -- =======================================================================
  v_amount_cents := ROUND(NEW.amount * 100)::bigint;

  -- =======================================================================
  -- G5: Idempotency via unique key
  -- Key format: 'pft:' || finance_row_id
  -- Relies on partial unique index: idx_tbt_idempotency ON (casino_id, idempotency_key)
  -- =======================================================================
  v_idempotency_key := 'pft:' || NEW.id::text;

  -- =======================================================================
  -- Insert telemetry row (idempotent)
  -- =======================================================================
  INSERT INTO public.table_buyin_telemetry (
    casino_id,
    gaming_day,
    table_id,
    visit_id,
    rating_slip_id,
    amount_cents,
    telemetry_kind,
    tender_type,
    occurred_at,
    actor_id,
    source,
    idempotency_key
  )
  VALUES (
    v_casino_id,
    v_gaming_day,
    v_table_id,
    NEW.visit_id,
    NEW.rating_slip_id,
    v_amount_cents,
    'RATED_BUYIN',
    NEW.tender_type,
    COALESCE(NEW.created_at, now()),
    v_actor_id,
    'finance_bridge',
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

COMMENT ON FUNCTION fn_bridge_finance_to_telemetry() IS
  'GAP-TBL-RUNDOWN WS2: Automatic bridge from player_financial_transaction to table_buyin_telemetry. '
  'SECURITY DEFINER trigger function implementing Guardrails G1-G5 per GAP_ANALYSIS v0.4.0. '
  'G1: Fail-closed context validation (app.casino_id/app.actor_id must be set). '
  'G2: Tenant invariant check. G3: Actor invariant check. G4: No spoofable params. '
  'G5: Idempotency via pft:{id} key.';

-- =====================================================
-- Notify PostgREST to reload schema
-- =====================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

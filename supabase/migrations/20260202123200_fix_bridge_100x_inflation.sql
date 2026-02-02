-- ============================================================================
-- Migration: Fix 100x inflation in telemetry bridge trigger
-- Created: 2026-02-02
-- Issue: ISSUE-SHIFT-DASH-STALE-ADJ (P0)
-- Root Cause: bridge_rated_buyin_to_telemetry() multiplied amount by 100,
--             but player_financial_transaction.amount already stores cents
--             per ADR-031. All telemetry amounts are 100x inflated.
-- Fix: (WS1-A) Remove * 100, cast to bigint directly
--      (WS1-B) Repair existing corrupted rows (divide by 100)
--      (WS1-C) Update function comment with ADR-031 convention
-- ============================================================================

BEGIN;

-- ==========================================================================
-- WS1-A: Fix bridge function — remove erroneous * 100 multiplication
-- ==========================================================================
-- ADR-031: All financial amounts stored in CENTS.
-- player_financial_transaction.amount is already cents.
-- The original code assumed dollars and converted, inflating values 100x.

CREATE OR REPLACE FUNCTION bridge_rated_buyin_to_telemetry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id uuid;
  v_idempotency_key text;
  v_gaming_day date;
BEGIN
  -- G1: Only process BUY-IN transactions (direction = 'in')
  IF NEW.direction IS NULL OR NEW.direction != 'in' THEN
    RETURN NEW;
  END IF;

  -- G2: Must have rating_slip_id to be a "rated" buy-in
  IF NEW.rating_slip_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get table_id from rating_slip, gaming_day from visit
  SELECT rs.table_id, v.gaming_day INTO v_table_id, v_gaming_day
  FROM rating_slip rs
  JOIN visit v ON v.id = rs.visit_id
  WHERE rs.id = NEW.rating_slip_id;

  IF v_table_id IS NULL THEN
    -- If no table_id found, skip silently (rating slip may be incomplete)
    RETURN NEW;
  END IF;

  -- G3: Idempotency key prevents duplicates
  v_idempotency_key := 'pft:' || NEW.id::text;

  -- G4: Insert into telemetry (idempotent)
  -- ON CONFLICT matches partial unique index idx_tbt_idempotency
  -- on (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  INSERT INTO table_buyin_telemetry (
    casino_id,
    table_id,
    telemetry_kind,
    amount_cents,
    source,
    rating_slip_id,
    visit_id,
    actor_id,
    idempotency_key,
    gaming_day,
    created_at
  ) VALUES (
    NEW.casino_id,
    v_table_id,
    'RATED_BUYIN',
    COALESCE(NEW.amount, 0)::bigint, -- ADR-031: amount already in cents, no conversion needed
    'finance_bridge',
    NEW.rating_slip_id,
    NEW.visit_id,
    NEW.created_by_staff_id,
    v_idempotency_key,
    COALESCE(v_gaming_day, NEW.gaming_day),
    COALESCE(NEW.created_at, now())
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

-- ==========================================================================
-- WS1-B: Repair existing corrupted telemetry data
-- ==========================================================================
-- All bridge-created rows have amount_cents inflated by 100x.
-- Integer division is exact (original values were whole cents * 100).
-- Scoped to bridge-created rows only via source + idempotency_key prefix.

UPDATE table_buyin_telemetry
SET amount_cents = amount_cents / 100
WHERE source = 'finance_bridge'
  AND idempotency_key LIKE 'pft:%';

-- ==========================================================================
-- WS1-C: Update function comment with ADR-031 convention
-- ==========================================================================

COMMENT ON FUNCTION bridge_rated_buyin_to_telemetry() IS
  'Bridges rated buy-ins from player_financial_transaction to table_buyin_telemetry. '
  'ADR-031: amount passes through as-is (already cents, no conversion). '
  'Gets gaming_day from visit table (joined via rating_slip.visit_id). '
  'Uses idempotency key pattern (pft:{transaction_id}) with ON CONFLICT '
  'matching idx_tbt_idempotency (casino_id, idempotency_key).';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- Migration: Fix gaming_day reference in telemetry bridge trigger
-- Created: 2026-01-17
-- Issue: column rs.gaming_day does not exist
-- Purpose: Get gaming_day from visit table instead of rating_slip
-- ============================================================================

-- Fix the bridge function to join to visit for gaming_day
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

  -- Get table_id from rating_slip, gaming_day from visit (FIX: rs doesn't have gaming_day)
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

  -- G4: Insert into telemetry (idempotent - ON CONFLICT DO NOTHING)
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
    COALESCE(NEW.amount, 0) * 100, -- Convert dollars to cents
    'finance_bridge',
    NEW.rating_slip_id,
    NEW.visit_id,
    NEW.created_by_staff_id,
    v_idempotency_key,
    COALESCE(v_gaming_day, NEW.gaming_day),
    COALESCE(NEW.created_at, now())
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION bridge_rated_buyin_to_telemetry() IS
  'Bridges rated buy-ins from player_financial_transaction to table_buyin_telemetry. Gets gaming_day from visit table (joined via rating_slip.visit_id). Uses idempotency key pattern (pft:{transaction_id}) to prevent duplicates.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

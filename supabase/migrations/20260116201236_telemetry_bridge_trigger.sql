-- Migration: telemetry_bridge_trigger
-- Purpose: Bridge rated buy-ins from player_financial_transaction to table_buyin_telemetry
--
-- This trigger ensures that rated buy-ins (player transactions with rating_slip_id)
-- are automatically reflected in the table_buyin_telemetry for shift dashboard accuracy.
--
-- Guardrails (from GAP_ANALYSIS_TABLE_RUNDOWN_INTEGRATION_REWRITE_v0.4.0.md):
-- G1: Only process BUY-IN transactions (direction = 'in')
-- G2: Must have rating_slip_id to be a "rated" buy-in
-- G3: Idempotency key prevents duplicates
-- G4: Insert with ON CONFLICT DO NOTHING for safe replay
-- G5: AFTER INSERT trigger to not block financial transaction
--
-- @see GAP-TABLE-ROLLOVER-UI WS7
-- @see docs/00-vision/table-context-read-model/GAP_ANALYSIS_TABLE_RUNDOWN_INTEGRATION_REWRITE_v0.4.0.md

-- Create the bridge function
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

  -- Get table_id and gaming_day from rating slip
  SELECT rs.table_id, rs.gaming_day INTO v_table_id, v_gaming_day
  FROM rating_slip rs
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

-- Add comment explaining the function
COMMENT ON FUNCTION bridge_rated_buyin_to_telemetry() IS
  'Bridges rated buy-ins from player_financial_transaction to table_buyin_telemetry for shift dashboard accuracy. Uses idempotency key pattern (pft:{transaction_id}) to prevent duplicates. See GAP-TABLE-ROLLOVER-UI WS7.';

-- G5: Trigger fires AFTER INSERT to not block financial transaction
-- Drop first if it exists to allow idempotent migrations
DROP TRIGGER IF EXISTS trg_bridge_rated_buyin_telemetry ON player_financial_transaction;

CREATE TRIGGER trg_bridge_rated_buyin_telemetry
  AFTER INSERT ON player_financial_transaction
  FOR EACH ROW
  EXECUTE FUNCTION bridge_rated_buyin_to_telemetry();

-- Add comment explaining the trigger
COMMENT ON TRIGGER trg_bridge_rated_buyin_telemetry ON player_financial_transaction IS
  'AFTER INSERT trigger that bridges rated buy-ins to table_buyin_telemetry. Only fires for direction=in transactions with rating_slip_id. See GAP-TABLE-ROLLOVER-UI WS7.';

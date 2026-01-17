-- ============================================================================
-- Migration: Guard against stale gaming day financial writes
-- Created: 2026-01-17
-- GAP Reference: GAP-ADR-026-UI-SHIPPABLE Patch B (WS3)
-- Purpose: Reject buy-in recording against stale gaming day contexts
-- ============================================================================

CREATE OR REPLACE FUNCTION guard_stale_gaming_day_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_slip_gaming_day date;
  v_visit_gaming_day date;
  v_current_gaming_day date;
  v_casino_id uuid;
BEGIN
  v_casino_id := NEW.casino_id;

  -- Compute current gaming day once
  v_current_gaming_day := compute_gaming_day(v_casino_id, now());

  -- Check 1: Validate via rating_slip_id if provided
  IF NEW.rating_slip_id IS NOT NULL THEN
    -- Scope lookup by casino_id (cross-tenant safety)
    SELECT v.gaming_day INTO v_slip_gaming_day
    FROM rating_slip rs
    JOIN visit v ON v.id = rs.visit_id
    WHERE rs.id = NEW.rating_slip_id
      AND rs.casino_id = v_casino_id;

    -- If slip not found for this casino, raise integrity error
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND: slip % not found for casino %',
        NEW.rating_slip_id, v_casino_id
        USING ERRCODE = 'P0002';
    END IF;

    -- Reject if slip's gaming day is stale
    IF v_slip_gaming_day <> v_current_gaming_day THEN
      RAISE EXCEPTION 'STALE_GAMING_DAY_CONTEXT: Cannot record transaction for gaming day % (current: %)',
        v_slip_gaming_day, v_current_gaming_day
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Check 2: Also validate via visit_id if provided (future-proofing)
  IF NEW.visit_id IS NOT NULL THEN
    SELECT gaming_day INTO v_visit_gaming_day
    FROM visit
    WHERE id = NEW.visit_id
      AND casino_id = v_casino_id;

    IF FOUND AND v_visit_gaming_day <> v_current_gaming_day THEN
      RAISE EXCEPTION 'STALE_GAMING_DAY_CONTEXT: Cannot record transaction for visit gaming day % (current: %)',
        v_visit_gaming_day, v_current_gaming_day
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on player_financial_transaction
DROP TRIGGER IF EXISTS trg_guard_stale_gaming_day ON player_financial_transaction;
CREATE TRIGGER trg_guard_stale_gaming_day
  BEFORE INSERT ON player_financial_transaction
  FOR EACH ROW
  EXECUTE FUNCTION guard_stale_gaming_day_write();

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

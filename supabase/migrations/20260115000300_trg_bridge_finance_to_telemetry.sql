-- =====================================================
-- Migration: trg_bridge_finance_to_telemetry
-- Created: 2026-01-15
-- Workstream: WS3 - GAP-TBL-RUNDOWN
-- Purpose: AFTER INSERT trigger on player_financial_transaction for rated buy-ins
-- Reference: GAP_ANALYSIS_TABLE_RUNDOWN_INTEGRATION_REWRITE_v0.4.0.md
-- =====================================================
-- This migration:
--   - Attaches fn_bridge_finance_to_telemetry() to player_financial_transaction
--   - Trigger fires AFTER INSERT for rated buy-ins only
--   - Condition: direction = 'in' AND rating_slip_id IS NOT NULL
--
-- Note: The bridge function (WS2) implements Guardrails G1-G5:
--   - G1: Context must exist (FAIL-CLOSED)
--   - G2: Tenant invariant check
--   - G3: Actor invariant check
--   - G4: No spoofable parameters
--   - G5: Idempotency via unique key
-- =====================================================

BEGIN;

-- =====================================================
-- Create trigger for automatic bridging
-- =====================================================

-- Drop if exists (idempotent migration)
DROP TRIGGER IF EXISTS trg_bridge_finance_to_telemetry ON player_financial_transaction;

-- Create trigger
CREATE TRIGGER trg_bridge_finance_to_telemetry
AFTER INSERT ON player_financial_transaction
FOR EACH ROW
WHEN (NEW.direction = 'in' AND NEW.rating_slip_id IS NOT NULL)
EXECUTE FUNCTION fn_bridge_finance_to_telemetry();

-- =====================================================
-- Trigger comment
-- =====================================================

COMMENT ON TRIGGER trg_bridge_finance_to_telemetry ON player_financial_transaction IS
  'GAP-TBL-RUNDOWN WS3: Automatic bridge from Finance to table_buyin_telemetry for rated buy-ins. '
  'Fires AFTER INSERT when direction=''in'' AND rating_slip_id IS NOT NULL. '
  'Calls fn_bridge_finance_to_telemetry() which implements Guardrails G1-G5 per GAP_ANALYSIS v0.4.0. '
  'Creates telemetry row with source=''finance_bridge'' and idempotency_key=''pft:{id}''.';

-- =====================================================
-- Notify PostgREST to reload schema
-- =====================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

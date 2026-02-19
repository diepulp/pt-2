-- ============================================================================
-- Migration: Fix dual telemetry bridge trigger (100x inflation)
-- Created: 2026-02-18 23:36:52
-- Issue: Shift dashboard displays buy-in amounts 100x inflated
--
-- Root Cause:
--   Two AFTER INSERT triggers on player_financial_transaction both bridge
--   to table_buyin_telemetry with the same idempotency key format (pft:{id}).
--   Postgres fires triggers alphabetically — the OLD trigger
--   (trg_bridge_finance_to_telemetry → fn_bridge_finance_to_telemetry)
--   fires FIRST, writes amount * 100, and wins the ON CONFLICT race.
--   The FIXED trigger (trg_bridge_rated_buyin_telemetry →
--   bridge_rated_buyin_to_telemetry) fires second, hits DO NOTHING.
--
-- History:
--   20260115000200: fn_bridge_finance_to_telemetry() — amount * 100 (assumed dollars)
--   20260115000300: trg_bridge_finance_to_telemetry — trigger for above
--   20260116201236: bridge_rated_buyin_to_telemetry() — SECOND trigger, also * 100
--   20260202123200: (DELETED — naming violation, superseded) attempted * 100 fix
--                   but did NOT drop the old trigger. Fix was ineffective.
--   20260202123300: (DELETED — naming violation, WS2 deltas carried forward to
--                   20260219002247_enable_adjustment_telemetry.sql)
--                   Still did not drop the old trigger.
--
-- Fix:
--   (A) Drop the old trigger trg_bridge_finance_to_telemetry
--   (B) Drop the old function fn_bridge_finance_to_telemetry()
--   (C) Repair corrupted telemetry rows — join with source pft to set correct value
-- ============================================================================

BEGIN;

-- ==========================================================================
-- (A) Drop the old trigger that fires first and inflates amounts 100x
-- ==========================================================================

DROP TRIGGER IF EXISTS trg_bridge_finance_to_telemetry
  ON player_financial_transaction;

-- ==========================================================================
-- (B) Drop the old function (no longer referenced by any trigger)
-- ==========================================================================

DROP FUNCTION IF EXISTS fn_bridge_finance_to_telemetry();

-- ==========================================================================
-- (C) Repair corrupted telemetry data
-- ==========================================================================
-- Join with player_financial_transaction to set the authoritative amount.
-- pft.amount is stored in cents (ADR-031). tbt.amount_cents should equal it.
-- This is idempotent: only updates rows where the value is wrong.

UPDATE table_buyin_telemetry tbt
SET amount_cents = COALESCE(pft.amount, 0)::bigint
FROM player_financial_transaction pft
WHERE tbt.idempotency_key = 'pft:' || pft.id::text
  AND tbt.source = 'finance_bridge'
  AND tbt.amount_cents <> COALESCE(pft.amount, 0)::bigint;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

COMMIT;

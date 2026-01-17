-- ============================================================================
-- Migration: Fix Gaming Day Timezone Inconsistency (ISSUE-5D694C70)
-- ============================================================================
-- Purpose: Update triggers to use canonical timezone-aware compute_gaming_day RPC
--
-- Problem: Two triggers use the old immutable function that ignores casino timezone:
--   1. set_fin_txn_gaming_day() - player_financial_transaction
--   2. set_table_session_gaming_day() - table_session
--
-- Fix: Update both to use compute_gaming_day(p_casino_id, p_timestamp) RPC
--      which properly converts timestamps to casino local timezone before
--      computing gaming day boundary.
--
-- Reference: trg_pit_cash_observation_set_gaming_day() in migration 20260106021105
-- Related: ADR-026, ISSUE-5D694C70, TEMP-001
-- ============================================================================

-- ============================================================================
-- SECTION 1: FIX player_financial_transaction TRIGGER
-- ============================================================================
-- Old pattern (BROKEN - ignores timezone):
--   SELECT gaming_day_start_time INTO v_gstart FROM casino_settings...
--   NEW.gaming_day := compute_gaming_day(NEW.created_at, v_gstart);
--
-- New pattern (CORRECT - timezone-aware):
--   NEW.gaming_day := compute_gaming_day(NEW.casino_id, NEW.created_at);

CREATE OR REPLACE FUNCTION public.set_fin_txn_gaming_day()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Use the canonical compute_gaming_day RPC from PRD-000
  -- This RPC:
  --   1. Fetches gaming_day_start_time AND timezone from casino_settings
  --   2. Converts timestamp to casino's local timezone
  --   3. Computes gaming day boundary correctly
  NEW.gaming_day := compute_gaming_day(NEW.casino_id, COALESCE(NEW.created_at, now()));
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_fin_txn_gaming_day() IS
  'Derives gaming_day from created_at using canonical timezone-aware compute_gaming_day RPC. Fixed in ISSUE-5D694C70.';

-- Recreate trigger (no change to trigger definition, just function body)
DROP TRIGGER IF EXISTS trg_fin_gaming_day ON public.player_financial_transaction;
CREATE TRIGGER trg_fin_gaming_day
  BEFORE INSERT OR UPDATE ON public.player_financial_transaction
  FOR EACH ROW EXECUTE FUNCTION public.set_fin_txn_gaming_day();

-- ============================================================================
-- SECTION 2: FIX table_session TRIGGER
-- ============================================================================
-- Old pattern (BROKEN - uses interval cast, ignores timezone):
--   SELECT gaming_day_start_time::interval INTO gstart FROM casino_settings...
--   NEW.gaming_day := compute_gaming_day(NEW.opened_at, gstart);
--
-- New pattern (CORRECT - timezone-aware):
--   NEW.gaming_day := compute_gaming_day(NEW.casino_id, NEW.opened_at);

CREATE OR REPLACE FUNCTION set_table_session_gaming_day()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Use the canonical compute_gaming_day RPC from PRD-000
  -- This RPC handles timezone conversion properly
  NEW.gaming_day := compute_gaming_day(NEW.casino_id, COALESCE(NEW.opened_at, now()));
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_table_session_gaming_day() IS
  'Derives gaming_day from opened_at using canonical timezone-aware compute_gaming_day RPC. Fixed in ISSUE-5D694C70.';

-- Recreate trigger (no change to trigger definition, just function body)
DROP TRIGGER IF EXISTS trg_table_session_gaming_day ON table_session;
CREATE TRIGGER trg_table_session_gaming_day
  BEFORE INSERT ON table_session
  FOR EACH ROW EXECUTE FUNCTION set_table_session_gaming_day();

-- ============================================================================
-- SECTION 3: BACKFILL EXISTING DATA
-- ============================================================================
-- Recalculate gaming_day for all existing rows using the correct RPC
-- This fixes any rows that were computed with incorrect timezone handling

-- 3a. Backfill player_financial_transaction
-- Only update rows where gaming_day differs from correct calculation
UPDATE player_financial_transaction pft
SET gaming_day = compute_gaming_day(pft.casino_id, pft.created_at)
WHERE pft.gaming_day IS DISTINCT FROM compute_gaming_day(pft.casino_id, pft.created_at);

-- 3b. Backfill table_session
-- Only update rows where gaming_day differs from correct calculation
UPDATE table_session ts
SET gaming_day = compute_gaming_day(ts.casino_id, ts.opened_at)
WHERE ts.gaming_day IS DISTINCT FROM compute_gaming_day(ts.casino_id, ts.opened_at);

-- ============================================================================
-- SECTION 4: VERIFICATION QUERIES (for manual validation)
-- ============================================================================
-- Run these after migration to verify consistency:
--
-- Check player_financial_transaction:
--   SELECT id, casino_id, created_at, gaming_day,
--          compute_gaming_day(casino_id, created_at) AS expected_gaming_day
--   FROM player_financial_transaction
--   WHERE gaming_day IS DISTINCT FROM compute_gaming_day(casino_id, created_at);
--
-- Check table_session:
--   SELECT id, casino_id, opened_at, gaming_day,
--          compute_gaming_day(casino_id, opened_at) AS expected_gaming_day
--   FROM table_session
--   WHERE gaming_day IS DISTINCT FROM compute_gaming_day(casino_id, opened_at);
--
-- Both queries should return 0 rows after successful migration.
-- ============================================================================

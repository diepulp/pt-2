-- =====================================================
-- Migration: PRD-005 MTL Service - occurred_at and Guards
-- Created: 2026-01-03 00:43:20
-- Purpose: Add occurred_at for paper-form UX, direction/txn_type
--          consistency guard, and cashier SELECT access
-- References: PRD-005, ADR-025, ADR-015
-- RLS_REVIEW_COMPLETE: Policies use ADR-015 hybrid pattern with auth.uid() guards
-- =====================================================

BEGIN;

-- =====================================================
-- SECTION 1: ADD occurred_at COLUMN
-- =====================================================
-- Paper form UX: staff can log transactions with timestamps that
-- differ from insert time (late entry, correction, delayed write-up).
-- - occurred_at: when the transaction actually happened (user input)
-- - created_at: when the row was inserted (server time, audit trail)
-- Gaming day and summary views key off occurred_at, not created_at.

ALTER TABLE mtl_entry
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now();

-- Backfill existing rows: set occurred_at = created_at for historical data
-- Temporarily disable immutability trigger for data fix
ALTER TABLE mtl_entry DISABLE TRIGGER trg_mtl_entry_no_update;

UPDATE mtl_entry SET occurred_at = created_at WHERE occurred_at IS NULL;

-- Re-enable immutability trigger
ALTER TABLE mtl_entry ENABLE TRIGGER trg_mtl_entry_no_update;

-- =====================================================
-- SECTION 2: UPDATE GAMING DAY TRIGGER
-- =====================================================
-- Compute gaming_day from occurred_at (not created_at)
-- This allows late entries to be assigned to the correct gaming day

CREATE OR REPLACE FUNCTION trg_mtl_entry_set_gaming_day()
RETURNS TRIGGER AS $$
DECLARE
  v_gaming_day_start time;
  v_timezone text;
  v_local_ts timestamptz;
  v_computed_day date;
BEGIN
  -- Get casino's gaming day start time and timezone
  SELECT
    COALESCE(gaming_day_start_time, '06:00:00'::time),
    COALESCE(timezone, 'America/Los_Angeles')
  INTO v_gaming_day_start, v_timezone
  FROM casino_settings
  WHERE casino_id = NEW.casino_id;

  -- Default to standard gaming day (6am) if casino not configured
  IF v_gaming_day_start IS NULL THEN
    v_gaming_day_start := '06:00:00'::time;
    v_timezone := 'America/Los_Angeles';
  END IF;

  -- Convert occurred_at to casino's local timezone
  -- (changed from created_at to occurred_at for paper-form UX)
  v_local_ts := NEW.occurred_at AT TIME ZONE v_timezone;

  -- Compute gaming day: if before gaming_day_start, use previous calendar day
  -- e.g., 3am transaction on Jan 3 belongs to Jan 2's gaming day if start is 6am
  IF v_local_ts::time < v_gaming_day_start THEN
    v_computed_day := (v_local_ts - INTERVAL '1 day')::date;
  ELSE
    v_computed_day := v_local_ts::date;
  END IF;

  NEW.gaming_day := v_computed_day;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SECTION 3: UPDATE GAMING DAY SUMMARY VIEW
-- =====================================================
-- Use occurred_at for first/last timestamps (not created_at)
-- This reflects when transactions actually happened, not when logged

CREATE OR REPLACE VIEW mtl_gaming_day_summary AS
SELECT
  casino_id,
  patron_uuid,
  gaming_day,
  -- Cash-in aggregates
  COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END), 0) AS total_in,
  COUNT(CASE WHEN direction = 'in' THEN 1 END) AS count_in,
  MAX(CASE WHEN direction = 'in' THEN amount END) AS max_single_in,
  MIN(CASE WHEN direction = 'in' THEN occurred_at END) AS first_in_at,
  MAX(CASE WHEN direction = 'in' THEN occurred_at END) AS last_in_at,
  -- Cash-out aggregates
  COALESCE(SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END), 0) AS total_out,
  COUNT(CASE WHEN direction = 'out' THEN 1 END) AS count_out,
  MAX(CASE WHEN direction = 'out' THEN amount END) AS max_single_out,
  MIN(CASE WHEN direction = 'out' THEN occurred_at END) AS first_out_at,
  MAX(CASE WHEN direction = 'out' THEN occurred_at END) AS last_out_at,
  -- Overall
  COALESCE(SUM(amount), 0) AS total_volume,
  COUNT(*) AS entry_count
FROM mtl_entry
WHERE gaming_day IS NOT NULL
GROUP BY casino_id, patron_uuid, gaming_day;

COMMENT ON VIEW mtl_gaming_day_summary IS
  'Aggregates MTL entries per patron per gaming day. Uses occurred_at for timestamps. Authoritative surface for Tier 2 compliance badges (CTR/AML).';

-- =====================================================
-- SECTION 4: ADD CHECK CONSTRAINT FOR direction/txn_type
-- =====================================================
-- Prevent garbage data like txn_type='buy_in' with direction='out'
--
-- Taxonomy:
--   buy_in      → direction MUST be 'in'  (cash to chips at table)
--   cash_out    → direction MUST be 'out' (chips to cash at cage)
--   marker      → either (take credit = 'in', pay back = 'out')
--   front_money → either (deposit = 'in', withdrawal = 'out')
--   chip_fill   → either (operational/table inventory, not player-facing)

-- First, fix legacy data: rows defaulted to txn_type='buy_in' but may have
-- direction='out'. Set appropriate txn_type based on actual direction.
-- (Previous migration defaulted txn_type to 'buy_in' for all existing rows)

-- Temporarily disable immutability trigger for data fix
-- (This is a schema migration, not application code - safe to bypass)
ALTER TABLE mtl_entry DISABLE TRIGGER trg_mtl_entry_no_update;

UPDATE mtl_entry
SET txn_type = 'cash_out'
WHERE txn_type = 'buy_in' AND direction = 'out';

-- Re-enable immutability trigger
ALTER TABLE mtl_entry ENABLE TRIGGER trg_mtl_entry_no_update;

-- Now add the constraint
ALTER TABLE mtl_entry
  ADD CONSTRAINT chk_mtl_direction_txn_type_alignment
  CHECK (
    CASE txn_type
      WHEN 'buy_in' THEN direction = 'in'
      WHEN 'cash_out' THEN direction = 'out'
      ELSE true  -- marker, front_money, chip_fill can be either
    END
  );

-- =====================================================
-- SECTION 5: UPDATE RLS FOR CASHIER SELECT ACCESS
-- =====================================================
-- Paper form UX: the person entering data needs to see the running list.
-- Cashiers create entries at the cage, they need to see what they're adding.
-- Compliance dashboard (summary views) can still be UI-gated to pit_boss/admin.

DROP POLICY IF EXISTS mtl_entry_select ON mtl_entry;

-- mtl_entry SELECT: pit_boss, cashier, admin (updated per UX feedback)
-- Cashiers can see entries for their casino (needed for form UX)
-- Uses ADR-015 hybrid pattern with auth.uid() guard
CREATE POLICY mtl_entry_select ON mtl_entry
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'cashier', 'admin')
  );

-- Note: Gaming Day Summary is a VIEW on mtl_entry, so it inherits RLS.
-- The compliance dashboard UI can still restrict summary access to pit_boss/admin
-- via route-level authorization (withServerAction role check).

-- =====================================================
-- SECTION 6: ADD INDEX FOR occurred_at QUERIES
-- =====================================================
-- Support queries that filter/sort by occurred_at

CREATE INDEX IF NOT EXISTS ix_mtl_occurred_at
  ON mtl_entry (casino_id, occurred_at DESC);

-- =====================================================
-- NOTIFY POSTGREST
-- =====================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================
-- VERIFICATION NOTES
-- =====================================================
--
-- Changes:
-- 1. Added occurred_at column (user-entered transaction time)
-- 2. Gaming day trigger now uses occurred_at (not created_at)
-- 3. Summary view now uses occurred_at for first/last timestamps
-- 4. CHECK constraint ensures direction matches txn_type:
--    - buy_in → 'in', cash_out → 'out', others → either
-- 5. Cashier can now SELECT mtl_entry (needed for form UX)
-- 6. Added index on occurred_at for query performance
--
-- UI mapping:
-- - Paper form timestamp column → occurred_at
-- - Audit trail insert time → created_at (unchanged)
-- - Gaming day computation → based on occurred_at
--
-- ADR-025 amendment note:
-- Cashier SELECT access added for operational UX. The compliance
-- dashboard (Gaming Day Summary) can still be UI-gated to pit_boss/admin
-- via route-level authorization, keeping the spirit of ADR-025.
--

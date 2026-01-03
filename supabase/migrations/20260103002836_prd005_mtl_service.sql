-- =====================================================
-- Migration: PRD-005 MTL Service Schema Enhancement
-- Created: 2026-01-03 00:28:36
-- Purpose: Complete MTL schema for AML/CTR compliance tracking
--          with two-tier threshold detection and append-only enforcement
-- References: PRD-005, ADR-025, ADR-024, ADR-015, SEC-001, SEC-003
-- RLS_REVIEW_COMPLETE: Policies use ADR-015 hybrid pattern with auth.uid() guards
-- =====================================================

BEGIN;

-- =====================================================
-- SECTION 1: CREATE ENUMS
-- =====================================================

-- Transaction type classification
-- Values per PRD-005 Appendix A
CREATE TYPE mtl_txn_type AS ENUM (
  'buy_in',       -- Cash to chips at table
  'cash_out',     -- Chips to cash at cage
  'marker',       -- Credit instrument
  'front_money',  -- Deposit/withdrawal
  'chip_fill'     -- Table chip inventory
);

-- Transaction source channel
-- Enables route anomaly detection (post-MVP telemetry)
CREATE TYPE mtl_source AS ENUM (
  'table',  -- Gaming table transaction
  'cage',   -- Cashier cage
  'kiosk',  -- Self-service kiosk
  'other'   -- Other source
);

-- =====================================================
-- SECTION 2: ALTER mtl_entry TABLE
-- =====================================================
-- Current schema from baseline:
--   id, patron_uuid, casino_id, staff_id, rating_slip_id, visit_id,
--   amount, direction, area, created_at, idempotency_key
--
-- Need to add: txn_type, source, gaming_day

-- Add txn_type column (NOT NULL with default for existing rows)
ALTER TABLE mtl_entry
  ADD COLUMN IF NOT EXISTS txn_type mtl_txn_type NOT NULL DEFAULT 'buy_in';

-- Add source column (NOT NULL with default)
ALTER TABLE mtl_entry
  ADD COLUMN IF NOT EXISTS source mtl_source NOT NULL DEFAULT 'table';

-- Add gaming_day column (will be computed via trigger)
ALTER TABLE mtl_entry
  ADD COLUMN IF NOT EXISTS gaming_day date;

-- =====================================================
-- SECTION 3: IDEMPOTENCY INDEX (Casino-Scoped)
-- =====================================================
-- PRD-005 requires casino-scoped idempotency to prevent cross-casino collisions
-- Drop old player-scoped index and create casino-scoped one

-- Drop old index if exists
DROP INDEX IF EXISTS ux_mtl_entry_idem;

-- Create casino-scoped unique index for idempotency
-- Partial index: only applies where idempotency_key is not null
CREATE UNIQUE INDEX ux_mtl_entry_casino_idem
  ON mtl_entry (casino_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- =====================================================
-- SECTION 4: QUERY OPTIMIZATION INDEXES
-- =====================================================

-- Index for patron + gaming_day queries (aggregate views)
CREATE INDEX IF NOT EXISTS ix_mtl_patron_day
  ON mtl_entry (patron_uuid, gaming_day);

-- Index for gaming_day + direction queries (compliance summaries)
CREATE INDEX IF NOT EXISTS ix_mtl_gaming_day_direction
  ON mtl_entry (casino_id, gaming_day, direction);

-- Index for txn_type filtering
CREATE INDEX IF NOT EXISTS ix_mtl_txn_type
  ON mtl_entry (casino_id, txn_type, created_at DESC);

-- =====================================================
-- SECTION 5: GAMING DAY TRIGGER
-- =====================================================
-- Auto-compute gaming_day from casino_settings.gaming_day_start_time

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

  -- Convert created_at to casino's local timezone
  v_local_ts := NEW.created_at AT TIME ZONE v_timezone;

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

-- Create trigger for gaming day computation on INSERT
DROP TRIGGER IF EXISTS trg_mtl_entry_gaming_day ON mtl_entry;
CREATE TRIGGER trg_mtl_entry_gaming_day
  BEFORE INSERT ON mtl_entry
  FOR EACH ROW
  EXECUTE FUNCTION trg_mtl_entry_set_gaming_day();

-- =====================================================
-- SECTION 6: GAMING DAY SUMMARY VIEW
-- =====================================================
-- Aggregates per patron + gaming_day with separate in/out totals
-- Used for compliance monitoring (Tier 2 aggregate badges)

CREATE OR REPLACE VIEW mtl_gaming_day_summary AS
SELECT
  casino_id,
  patron_uuid,
  gaming_day,
  -- Cash-in aggregates
  COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END), 0) AS total_in,
  COUNT(CASE WHEN direction = 'in' THEN 1 END) AS count_in,
  MAX(CASE WHEN direction = 'in' THEN amount END) AS max_single_in,
  MIN(CASE WHEN direction = 'in' THEN created_at END) AS first_in_at,
  MAX(CASE WHEN direction = 'in' THEN created_at END) AS last_in_at,
  -- Cash-out aggregates
  COALESCE(SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END), 0) AS total_out,
  COUNT(CASE WHEN direction = 'out' THEN 1 END) AS count_out,
  MAX(CASE WHEN direction = 'out' THEN amount END) AS max_single_out,
  MIN(CASE WHEN direction = 'out' THEN created_at END) AS first_out_at,
  MAX(CASE WHEN direction = 'out' THEN created_at END) AS last_out_at,
  -- Overall
  COALESCE(SUM(amount), 0) AS total_volume,
  COUNT(*) AS entry_count
FROM mtl_entry
WHERE gaming_day IS NOT NULL
GROUP BY casino_id, patron_uuid, gaming_day;

COMMENT ON VIEW mtl_gaming_day_summary IS
  'Aggregates MTL entries per patron per gaming day. Authoritative surface for Tier 2 compliance badges (CTR/AML).';

-- =====================================================
-- SECTION 7: RLS POLICIES (ADR-025 + ADR-024)
-- =====================================================
-- Authorization matrix per ADR-025:
--   mtl_entry SELECT: pit_boss, admin (cashier excluded)
--   mtl_entry INSERT: pit_boss, cashier, admin
--   mtl_audit_note SELECT: pit_boss, admin
--   mtl_audit_note INSERT: pit_boss, admin
--
-- RLS already enabled in 20251211153228_adr015_rls_compliance_patch.sql
-- Need to update policies to match ADR-025 authorization model

-- Drop existing policies to recreate with ADR-025 matrix
DROP POLICY IF EXISTS mtl_entry_select ON mtl_entry;
DROP POLICY IF EXISTS mtl_entry_insert ON mtl_entry;

-- mtl_entry SELECT: pit_boss, admin only (cashier excluded per ADR-025)
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
    ) IN ('pit_boss', 'admin')
  );

-- mtl_entry INSERT: pit_boss, cashier, admin (cashiers create entries at cage)
-- Uses ADR-015 hybrid pattern with auth.uid() guard
CREATE POLICY mtl_entry_insert ON mtl_entry
  FOR INSERT TO authenticated
  WITH CHECK (
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

-- Drop existing audit_note policies to recreate with ADR-025 matrix
DROP POLICY IF EXISTS mtl_audit_note_select ON mtl_audit_note;
DROP POLICY IF EXISTS mtl_audit_note_insert ON mtl_audit_note;

-- mtl_audit_note SELECT: pit_boss, admin (via parent entry casino scope)
-- Uses ADR-015 hybrid pattern with auth.uid() guard
CREATE POLICY mtl_audit_note_select ON mtl_audit_note
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM mtl_entry e
      WHERE e.id = mtl_audit_note.mtl_entry_id
      AND e.casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- mtl_audit_note INSERT: pit_boss, admin (operational annotations, not SoD)
-- Uses ADR-015 hybrid pattern with auth.uid() guard
CREATE POLICY mtl_audit_note_insert ON mtl_audit_note
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM mtl_entry e
      WHERE e.id = mtl_audit_note.mtl_entry_id
      AND e.casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- =====================================================
-- SECTION 8: APPEND-ONLY ENFORCEMENT (Belt + Suspenders)
-- =====================================================
-- Three layers of protection:
-- 1. RLS: No UPDATE/DELETE policies (absence = deny for authenticated)
-- 2. REVOKE: Remove UPDATE/DELETE privileges from app roles
-- 3. TRIGGERS: BEFORE triggers as final defense (catches service_role bypass)

-- Layer 2: REVOKE UPDATE/DELETE privileges
REVOKE UPDATE, DELETE ON mtl_entry FROM authenticated;
REVOKE UPDATE, DELETE ON mtl_entry FROM anon;
REVOKE UPDATE, DELETE ON mtl_audit_note FROM authenticated;
REVOKE UPDATE, DELETE ON mtl_audit_note FROM anon;

-- Layer 3: BEFORE triggers (immutability enforcement)
-- Create shared immutability function
CREATE OR REPLACE FUNCTION trg_mtl_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'MTL tables are immutable: UPDATE/DELETE not allowed on %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- mtl_entry triggers
DROP TRIGGER IF EXISTS trg_mtl_entry_no_update ON mtl_entry;
CREATE TRIGGER trg_mtl_entry_no_update
  BEFORE UPDATE ON mtl_entry
  FOR EACH ROW
  EXECUTE FUNCTION trg_mtl_immutable();

DROP TRIGGER IF EXISTS trg_mtl_entry_no_delete ON mtl_entry;
CREATE TRIGGER trg_mtl_entry_no_delete
  BEFORE DELETE ON mtl_entry
  FOR EACH ROW
  EXECUTE FUNCTION trg_mtl_immutable();

-- mtl_audit_note triggers
DROP TRIGGER IF EXISTS trg_mtl_audit_note_no_update ON mtl_audit_note;
CREATE TRIGGER trg_mtl_audit_note_no_update
  BEFORE UPDATE ON mtl_audit_note
  FOR EACH ROW
  EXECUTE FUNCTION trg_mtl_immutable();

DROP TRIGGER IF EXISTS trg_mtl_audit_note_no_delete ON mtl_audit_note;
CREATE TRIGGER trg_mtl_audit_note_no_delete
  BEFORE DELETE ON mtl_audit_note
  FOR EACH ROW
  EXECUTE FUNCTION trg_mtl_immutable();

-- =====================================================
-- SECTION 9: DROP OLD DENIAL POLICIES
-- =====================================================
-- The denial policies from 20251216074008 are no longer needed
-- since we now use privilege revocation + triggers

DROP POLICY IF EXISTS mtl_audit_note_no_updates ON mtl_audit_note;
DROP POLICY IF EXISTS mtl_audit_note_no_deletes ON mtl_audit_note;

-- =====================================================
-- SECTION 10: ADDITIONAL INDEX FOR AUDIT NOTE QUERIES
-- =====================================================

CREATE INDEX IF NOT EXISTS ix_mtl_audit_note_entry
  ON mtl_audit_note (mtl_entry_id, created_at DESC);

-- =====================================================
-- NOTIFY POSTGREST
-- =====================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================
-- VERIFICATION NOTES
-- =====================================================
--
-- Schema Changes:
-- - mtl_txn_type ENUM: buy_in, cash_out, marker, front_money, chip_fill
-- - mtl_source ENUM: table, cage, kiosk, other
-- - mtl_entry.txn_type: NOT NULL DEFAULT 'buy_in'
-- - mtl_entry.source: NOT NULL DEFAULT 'table'
-- - mtl_entry.gaming_day: date (auto-computed via trigger)
-- - ux_mtl_entry_casino_idem: Casino-scoped idempotency index
-- - mtl_gaming_day_summary: Aggregate view for compliance
--
-- RLS Policies (ADR-025):
-- - mtl_entry SELECT: pit_boss, admin (cashier excluded)
-- - mtl_entry INSERT: pit_boss, cashier, admin
-- - mtl_audit_note SELECT: pit_boss, admin
-- - mtl_audit_note INSERT: pit_boss, admin
--
-- Append-Only Enforcement:
-- - No UPDATE/DELETE RLS policies
-- - REVOKE UPDATE, DELETE from authenticated/anon
-- - BEFORE triggers raise exception on UPDATE/DELETE
--
-- Run after migration:
--   npm run db:types
--
-- Verify with:
--   SELECT * FROM pg_type WHERE typname IN ('mtl_txn_type', 'mtl_source');
--   SELECT * FROM mtl_gaming_day_summary LIMIT 1;
--   \d mtl_entry
--

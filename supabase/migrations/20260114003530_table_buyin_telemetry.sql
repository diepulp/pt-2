-- =====================================================
-- Migration: table_buyin_telemetry
-- Created: 2026-01-14
-- Workstream: WS1 - ADDENDUM-TBL-RUNDOWN
-- Purpose: Unified telemetry table for rated + grind buy-in tracking
-- ADR Reference: ADR-015 (Pattern C RLS), ADR-024 (context injection)
-- =====================================================
--
-- This table captures buy-in telemetry at the table level for shift metrics.
-- It supports both:
--   - RATED_BUYIN: Buy-ins for rated players (linked to visit/rating_slip)
--   - GRIND_BUYIN: Anonymous/unrated buy-ins observed at the table
--
-- Key design decisions:
--   - Direct table_id FK (no JOIN required for shift metrics)
--   - Optional visit_id/rating_slip_id (NULL for grind)
--   - Telemetry-only (not accounting data)
--   - INSERT via RPC only (SECURITY DEFINER with context injection)
-- =====================================================

BEGIN;

-- =====================================================
-- Create table_buyin_telemetry table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.table_buyin_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Casino scope (required for RLS)
  casino_id uuid NOT NULL REFERENCES casino(id) ON DELETE CASCADE,

  -- Gaming day for partitioning/filtering
  gaming_day date NOT NULL,

  -- Table reference (direct FK, no JOIN needed)
  table_id uuid NOT NULL REFERENCES gaming_table(id) ON DELETE CASCADE,

  -- Optional linkage (NULL for anonymous grind)
  visit_id uuid NULL REFERENCES visit(id) ON DELETE SET NULL,
  rating_slip_id uuid NULL REFERENCES rating_slip(id) ON DELETE SET NULL,

  -- Core telemetry data
  amount_cents bigint NOT NULL,
  telemetry_kind text NOT NULL,
  tender_type text NULL,  -- 'cash', 'ticket', 'marker', etc.

  -- Audit fields
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL REFERENCES staff(id),
  note text NULL,

  -- Idempotency support
  idempotency_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT chk_telemetry_kind CHECK (telemetry_kind IN ('RATED_BUYIN', 'GRIND_BUYIN')),
  CONSTRAINT chk_rated_requires_linkage CHECK (
    telemetry_kind != 'RATED_BUYIN' OR (visit_id IS NOT NULL AND rating_slip_id IS NOT NULL)
  ),
  CONSTRAINT chk_grind_no_linkage CHECK (
    telemetry_kind != 'GRIND_BUYIN' OR (visit_id IS NULL AND rating_slip_id IS NULL)
  )
);

-- Partial unique constraint for idempotency
CREATE UNIQUE INDEX idx_tbt_idempotency
  ON table_buyin_telemetry (casino_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- =====================================================
-- Indexes for shift metrics queries
-- =====================================================

-- Primary query pattern: table metrics within time window
CREATE INDEX idx_tbt_table_window
  ON table_buyin_telemetry (casino_id, table_id, occurred_at);

-- Gaming day queries (for daily aggregations)
CREATE INDEX idx_tbt_gaming_day
  ON table_buyin_telemetry (casino_id, gaming_day, table_id);

-- Visit linkage queries (partial - only when visit_id exists)
CREATE INDEX idx_tbt_visit
  ON table_buyin_telemetry (casino_id, visit_id, occurred_at)
  WHERE visit_id IS NOT NULL;

-- Telemetry kind filtering (for rated vs grind breakdown)
CREATE INDEX idx_tbt_kind
  ON table_buyin_telemetry (casino_id, table_id, telemetry_kind, occurred_at);

-- =====================================================
-- Row Level Security (ADR-015 Pattern C)
-- =====================================================

ALTER TABLE table_buyin_telemetry ENABLE ROW LEVEL SECURITY;

-- SELECT: Casino staff can view telemetry for their casino
CREATE POLICY "table_buyin_telemetry_select_same_casino"
  ON table_buyin_telemetry
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- INSERT: Via RPC only (SECURITY DEFINER)
-- No direct INSERT policy - enforces use of rpc_log_table_buyin_telemetry
-- The RPC uses SECURITY DEFINER and bypasses RLS for INSERT

-- UPDATE: Not allowed (telemetry is immutable)
-- DELETE: Not allowed (telemetry is immutable)

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE table_buyin_telemetry IS
  'Unified telemetry for table-level buy-in observations. Supports rated (linked to visit/slip) and grind (anonymous) buy-ins. Used by shift metrics RPCs.';

COMMENT ON COLUMN table_buyin_telemetry.telemetry_kind IS
  'RATED_BUYIN: Buy-in for rated player (requires visit_id + rating_slip_id). GRIND_BUYIN: Anonymous buy-in observed at table (no linkage).';

COMMENT ON COLUMN table_buyin_telemetry.amount_cents IS
  'Buy-in amount in cents (positive integer). Represents chips purchased at table.';

COMMENT ON COLUMN table_buyin_telemetry.gaming_day IS
  'Gaming day for the telemetry event. Derived from casino settings at event time.';

COMMENT ON COLUMN table_buyin_telemetry.tender_type IS
  'Optional tender type: cash, ticket, marker, etc. NULL if not specified.';

-- =====================================================
-- Grant permissions
-- =====================================================

GRANT SELECT ON table_buyin_telemetry TO authenticated;
GRANT SELECT ON table_buyin_telemetry TO service_role;
GRANT INSERT ON table_buyin_telemetry TO service_role;

-- =====================================================
-- Notify PostgREST to reload schema
-- =====================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

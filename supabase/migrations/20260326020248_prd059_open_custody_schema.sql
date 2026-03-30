-- ============================================================================
-- Migration: PRD-059 OPEN Table Custody Gate — Schema + RLS
-- Created: 2026-03-26
-- ADR Reference: docs/80-adrs/ADR-048-open-table-custody-gate.md
-- PRD Reference: docs/10-prd/PRD-059-open-table-custody-gate-pilot-lite-v0.md
-- Purpose: Create table_opening_attestation, add predecessor/consumption
--          columns, amend close_reason_type enum, apply RLS policies
-- Affected Tables: table_opening_attestation (NEW), table_session, table_inventory_snapshot
-- ============================================================================

-- ============================================================================
-- 1. Enum Amendment: Add 'cancelled' to close_reason_type
-- ============================================================================
-- IF NOT EXISTS is required because ALTER TYPE ADD VALUE cannot be inside a
-- transaction block in all PostgreSQL versions. Supabase runs each migration
-- as a single transaction, but ADD VALUE IF NOT EXISTS is safe.
ALTER TYPE close_reason_type ADD VALUE IF NOT EXISTS 'cancelled';

-- ============================================================================
-- 2. New Table: table_opening_attestation
-- ADR-048 D1: Opening attestation as a separate table within TableContextService.
-- FIB §F: "Opening attestation is a separate record from the closing snapshot."
-- FK direction: attestation → session (UNIQUE on session_id), not reverse.
-- ============================================================================
CREATE TABLE IF NOT EXISTS table_opening_attestation (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id                     uuid        NOT NULL REFERENCES casino(id),
  session_id                    uuid        NOT NULL REFERENCES table_session(id),
  opening_total_cents           integer     NOT NULL,
  attested_by                   uuid        NOT NULL REFERENCES staff(id),
  attested_at                   timestamptz NOT NULL DEFAULT now(),
  dealer_confirmed              boolean     NOT NULL CONSTRAINT chk_dealer_confirmed CHECK (dealer_confirmed = true),
  note                          text,
  predecessor_snapshot_id       uuid        REFERENCES table_inventory_snapshot(id),
  predecessor_close_total_cents integer,
  provenance_source             text        NOT NULL CONSTRAINT chk_provenance_source CHECK (provenance_source IN ('predecessor', 'par_bootstrap')),
  created_at                    timestamptz NOT NULL DEFAULT now(),

  -- One attestation per session (ADR-048 D1 invariant)
  CONSTRAINT uq_attestation_session UNIQUE (session_id)
);

-- ============================================================================
-- 3. New Column: table_session.predecessor_session_id
-- Links OPEN session to the most recent CLOSED session for the same table.
-- Set by rpc_open_table_session during predecessor lookup.
-- ============================================================================
ALTER TABLE table_session
  ADD COLUMN IF NOT EXISTS predecessor_session_id uuid REFERENCES table_session(id);

-- ============================================================================
-- 4. New Columns: table_inventory_snapshot consumption tracking
-- Tracks which opening session consumed each closing snapshot.
-- Guarded single-write: consumed_by_session_id set once, never overwritten (SEC Note C5).
-- ============================================================================
ALTER TABLE table_inventory_snapshot
  ADD COLUMN IF NOT EXISTS consumed_by_session_id uuid REFERENCES table_session(id),
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

-- ============================================================================
-- 5. RLS Policies on table_opening_attestation
-- Pattern C hybrid per ADR-015: COALESCE(session var, JWT fallback)
-- RPC-only writes: authenticated role DENIED insert/update/delete
-- ============================================================================
ALTER TABLE table_opening_attestation ENABLE ROW LEVEL SECURITY;

-- SELECT: Authenticated users can read attestations for their own casino
CREATE POLICY "attestation_select_own_casino"
  ON table_opening_attestation
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- INSERT: DENIED to authenticated (writes via SECURITY DEFINER RPC only)
CREATE POLICY "attestation_insert_deny"
  ON table_opening_attestation
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- UPDATE: DENIED to authenticated
CREATE POLICY "attestation_update_deny"
  ON table_opening_attestation
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- DELETE: DENIED to authenticated
CREATE POLICY "attestation_delete_deny"
  ON table_opening_attestation
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================================
-- 6. REVOKE + GRANT: Belt-and-suspenders with RLS denial (SEC Note C4)
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE ON table_opening_attestation FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON table_opening_attestation FROM anon;
REVOKE ALL ON table_opening_attestation FROM PUBLIC;
GRANT SELECT ON table_opening_attestation TO authenticated;

-- ============================================================================
-- 7. FK Indexes (DA P1-4: JOIN performance for predecessor chain traversal)
-- Partial indexes — only index non-NULL values since most rows will be NULL
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_table_session_predecessor
  ON table_session(predecessor_session_id)
  WHERE predecessor_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tis_consumed_by
  ON table_inventory_snapshot(consumed_by_session_id)
  WHERE consumed_by_session_id IS NOT NULL;

-- Casino-scoped index on attestation table for RLS performance
CREATE INDEX IF NOT EXISTS idx_toa_casino_id
  ON table_opening_attestation(casino_id);

-- ============================================================================
-- 8. Schema reload
-- ============================================================================
NOTIFY pgrst, 'reload schema';

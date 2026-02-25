-- ============================================================================
-- Migration: PRD-038A Schema Additions
-- Created: 2026-02-25
-- PRD Reference: docs/10-prd/PRD-038A-table-lifecycle-audit-patch.md
-- Purpose: Add close_reason enum, close guardrail columns, attribution columns,
--          and gaming day alignment flag to table_session.
-- Backward Compatibility: All new columns are nullable or have defaults.
-- Bounded Context: TableContextService
-- ============================================================================

-- === 1. Create close_reason_type enum ===

CREATE TYPE close_reason_type AS ENUM (
  'end_of_shift',
  'maintenance',
  'game_change',
  'dealer_unavailable',
  'low_demand',
  'security_hold',
  'emergency',
  'other'
);

COMMENT ON TYPE close_reason_type IS 'PRD-038A: Reason for closing a table session. Required on all close operations (Phase A: nullable at DB, enforced at service layer).';

-- === 2. Add columns to table_session ===

-- Close reason and note (Gap B)
ALTER TABLE table_session
  ADD COLUMN close_reason close_reason_type,
  ADD COLUMN close_note text;

-- Close guardrail columns (Gap A)
ALTER TABLE table_session
  ADD COLUMN has_unresolved_items boolean NOT NULL DEFAULT false,
  ADD COLUMN requires_reconciliation boolean NOT NULL DEFAULT false;

-- Attribution columns (Gap C) — forward-compatible, populated when RPCs exist
ALTER TABLE table_session
  ADD COLUMN activated_by_staff_id uuid REFERENCES staff(id),
  ADD COLUMN paused_by_staff_id uuid REFERENCES staff(id),
  ADD COLUMN resumed_by_staff_id uuid REFERENCES staff(id),
  ADD COLUMN rolled_over_by_staff_id uuid REFERENCES staff(id);

-- Gaming day alignment flag (Gap E) — forward-compatible for rollover
ALTER TABLE table_session
  ADD COLUMN crossed_gaming_day boolean NOT NULL DEFAULT false;

-- === 3. Check constraint: close_reason='other' requires trimmed non-empty close_note ===

ALTER TABLE table_session
  ADD CONSTRAINT chk_close_reason_other_requires_note
  CHECK (close_reason IS DISTINCT FROM 'other' OR length(trim(close_note)) > 0);

-- === 4. Comments ===

COMMENT ON COLUMN table_session.close_reason IS 'PRD-038A Gap B: Why was this table closed?';
COMMENT ON COLUMN table_session.close_note IS 'PRD-038A Gap B: Free-text note (required when close_reason=other)';
COMMENT ON COLUMN table_session.has_unresolved_items IS 'PRD-038A Gap A: Placeholder for Finance/MTL integration. Write ownership: Finance/MTL RPCs or service_role only. TableContextService reads only.';
COMMENT ON COLUMN table_session.requires_reconciliation IS 'PRD-038A Gap A: Set to true by rpc_force_close_table_session only. Signals post-close reconciliation needed.';
COMMENT ON COLUMN table_session.activated_by_staff_id IS 'PRD-038A Gap C: Staff who activated the session (deferred — no activate RPC yet).';
COMMENT ON COLUMN table_session.paused_by_staff_id IS 'PRD-038A Gap C: Staff who last paused (forward-compatible, no pause RPC yet).';
COMMENT ON COLUMN table_session.resumed_by_staff_id IS 'PRD-038A Gap C: Staff who last resumed (forward-compatible, no resume RPC yet).';
COMMENT ON COLUMN table_session.rolled_over_by_staff_id IS 'PRD-038A Gap C: Staff who rolled over (forward-compatible, no rollover RPC yet).';
COMMENT ON COLUMN table_session.crossed_gaming_day IS 'PRD-038A Gap E: True when rollover crosses gaming day boundary.';

-- === 5. Notify PostgREST ===

NOTIFY pgrst, 'reload schema';

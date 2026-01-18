-- ============================================================================
-- ADR-027: Table Bank Mode Schema (Visibility Slice, MVP)
-- ============================================================================
-- Implements operational visibility for table bank lifecycle in PT-2 dashboards.
-- This ADR adds informational labeling for casino bank modes (Inventory Count vs
-- Imprest-to-Par) and columns for computing table win/loss.
--
-- MVP Scope: Pure visibility slice. No enforcement, no blocking, no tolerance.
--
-- Bounded Context: TableContextService (SRM v4.10.0)
-- ADR References: ADR-027, ADR-028 (status standardization)
-- ============================================================================

-- 1. Create table_bank_mode enum
CREATE TYPE table_bank_mode AS ENUM ('INVENTORY_COUNT', 'IMPREST_TO_PAR');

COMMENT ON TYPE table_bank_mode IS
  'Casino bank close model: INVENTORY_COUNT (count as-is) or IMPREST_TO_PAR (restore to par). Informational in MVP.';

-- 2. Add table_bank_mode to casino_settings (casino-wide policy)
ALTER TABLE casino_settings
ADD COLUMN table_bank_mode table_bank_mode NOT NULL DEFAULT 'INVENTORY_COUNT';

COMMENT ON COLUMN casino_settings.table_bank_mode IS
  'Default table bank close model for this casino. Informational in MVP.';

-- 3. Add par columns to gaming_table (advisory only)
ALTER TABLE gaming_table
ADD COLUMN par_total_cents INTEGER,
ADD COLUMN par_updated_at TIMESTAMPTZ,
ADD COLUMN par_updated_by UUID REFERENCES staff(id);

COMMENT ON COLUMN gaming_table.par_total_cents IS
  'Target bankroll (need/par) in cents. Advisory only in MVP.';
COMMENT ON COLUMN gaming_table.par_updated_at IS
  'Timestamp of last par update. Advisory only in MVP.';
COMMENT ON COLUMN gaming_table.par_updated_by IS
  'Staff who last updated par. Advisory only in MVP.';

-- 4. Add mode binding + operational totals to table_session
-- NOTE: drop_posted_at already added by ADR-028 migration
ALTER TABLE table_session
ADD COLUMN table_bank_mode table_bank_mode,
ADD COLUMN need_total_cents INTEGER,
ADD COLUMN fills_total_cents INTEGER NOT NULL DEFAULT 0,
ADD COLUMN credits_total_cents INTEGER NOT NULL DEFAULT 0,
ADD COLUMN drop_total_cents INTEGER;

COMMENT ON COLUMN table_session.table_bank_mode IS
  'Snapshot of casino bank mode at session open. Informational in MVP.';
COMMENT ON COLUMN table_session.need_total_cents IS
  'Snapshot of table par at session open (nullable). Informational in MVP.';
COMMENT ON COLUMN table_session.fills_total_cents IS
  'Operational total fills for the session (entered or bridged). Informational in MVP.';
COMMENT ON COLUMN table_session.credits_total_cents IS
  'Operational total credits for the session (entered or bridged). Informational in MVP.';
COMMENT ON COLUMN table_session.drop_total_cents IS
  'Drop total for the session (posted by accounting/soft-count entry/import).';

-- 5. Add total_cents to table_inventory_snapshot (avoid fragile JSON math)
-- Also add session_id for proper linking
ALTER TABLE table_inventory_snapshot
ADD COLUMN total_cents INTEGER,
ADD COLUMN session_id UUID REFERENCES table_session(id);

COMMENT ON COLUMN table_inventory_snapshot.total_cents IS
  'Total tray value in cents. Stored to avoid denom casting pitfalls.';
COMMENT ON COLUMN table_inventory_snapshot.session_id IS
  'Link to table_session for rundown computation.';

-- 6. Add index for session lookups on inventory snapshots
CREATE INDEX idx_table_inventory_snapshot_session
ON table_inventory_snapshot (session_id)
WHERE session_id IS NOT NULL;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

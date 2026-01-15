-- ============================================================================
-- PRD-TABLE-SESSION-LIFECYCLE-MVP: WS1 - Database Foundation + RLS
-- ============================================================================
-- Table session lifecycle state machine for gaming tables.
-- Enables telemetry attribution and shift dashboard rollups.
--
-- Bounded Context: TableContextService (SRM v4.0.0)
-- ADR References: ADR-024 (context injection), ADR-015 (RLS Pattern C)
-- ============================================================================

-- 1. Enum type for session status
CREATE TYPE table_session_status AS ENUM ('OPEN', 'ACTIVE', 'RUNDOWN', 'CLOSED');

COMMENT ON TYPE table_session_status IS 'Table session lifecycle states: OPEN (just created), ACTIVE (in operation), RUNDOWN (closing procedures), CLOSED (finalized)';

-- 2. Table: table_session
CREATE TABLE table_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES casino(id),
  gaming_table_id uuid NOT NULL REFERENCES gaming_table(id),
  gaming_day date NOT NULL,
  shift_id uuid NULL,
  status table_session_status NOT NULL DEFAULT 'OPEN',
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_by_staff_id uuid NOT NULL REFERENCES staff(id),
  rundown_started_at timestamptz NULL,
  rundown_started_by_staff_id uuid NULL REFERENCES staff(id),
  closed_at timestamptz NULL,
  closed_by_staff_id uuid NULL REFERENCES staff(id),
  -- FK references deferred: canonical inventory/drop tables may evolve
  opening_inventory_snapshot_id uuid NULL,
  closing_inventory_snapshot_id uuid NULL,
  drop_event_id uuid NULL,
  notes text NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE table_session IS 'Table session lifecycle for operational boundaries. Exactly one active session per table per casino.';
COMMENT ON COLUMN table_session.gaming_day IS 'Gaming day computed via trigger from casino_settings.gaming_day_start_time';
COMMENT ON COLUMN table_session.opening_inventory_snapshot_id IS 'Optional link to opening inventory snapshot (FK deferred)';
COMMENT ON COLUMN table_session.closing_inventory_snapshot_id IS 'Required for close: link to closing inventory snapshot (FK deferred)';
COMMENT ON COLUMN table_session.drop_event_id IS 'Required for close: link to drop event (FK deferred)';

-- 3. Unique active session constraint (partial unique index)
-- Ensures exactly one OPEN/ACTIVE/RUNDOWN session per table per casino
CREATE UNIQUE INDEX unique_active_session_per_table
ON table_session (casino_id, gaming_table_id)
WHERE status IN ('OPEN', 'ACTIVE', 'RUNDOWN');

COMMENT ON INDEX unique_active_session_per_table IS 'PRD invariant: exactly one non-closed session per (casino_id, gaming_table_id)';

-- 4. Rollup query index for shift dashboards
CREATE INDEX idx_table_session_rollup
ON table_session (casino_id, gaming_day, gaming_table_id, status);

-- 5. Gaming day trigger (follows existing pattern from baseline_srm)
CREATE OR REPLACE FUNCTION set_table_session_gaming_day()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  gstart interval;
BEGIN
  SELECT COALESCE(gaming_day_start_time::interval, interval '06:00:00') INTO gstart
    FROM casino_settings
   WHERE casino_id = NEW.casino_id;

  NEW.gaming_day := compute_gaming_day(COALESCE(NEW.opened_at, now()), gstart);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_table_session_gaming_day() IS 'Derives gaming_day from opened_at using casino gaming day boundary';

CREATE TRIGGER trg_table_session_gaming_day
  BEFORE INSERT ON table_session
  FOR EACH ROW EXECUTE FUNCTION set_table_session_gaming_day();

-- 6. Updated_at trigger function and trigger
CREATE OR REPLACE FUNCTION update_table_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_table_session_updated_at
  BEFORE UPDATE ON table_session
  FOR EACH ROW EXECUTE FUNCTION update_table_session_updated_at();

-- ============================================================================
-- RLS Policies (Pattern C Hybrid - ADR-015/ADR-020)
-- RLS_REVIEW_COMPLETE: Verified ADR-015 hybrid pattern compliance
-- ============================================================================
-- Mutations blocked at RLS level; all writes via SECURITY DEFINER RPCs
-- that call set_rls_context_from_staff() per ADR-024
-- ============================================================================

ALTER TABLE table_session ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated staff can read (casino-scoped)
CREATE POLICY "table_session_select_policy" ON table_session
FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND casino_id = COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  )
);

-- INSERT: Blocked for direct access (RPC-only via SECURITY DEFINER)
CREATE POLICY "table_session_insert_deny" ON table_session
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND false);

-- UPDATE: Blocked for direct access (RPC-only via SECURITY DEFINER)
CREATE POLICY "table_session_update_deny" ON table_session
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL AND false)
WITH CHECK (auth.uid() IS NOT NULL AND false);

-- DELETE: Always denied (sessions are immutable after creation)
CREATE POLICY "table_session_delete_deny" ON table_session
FOR DELETE TO authenticated
USING (auth.uid() IS NOT NULL AND false);

-- ============================================================================
-- Grants
-- ============================================================================

-- Anon/authenticated can SELECT via RLS
GRANT SELECT ON table_session TO authenticated;

-- No direct INSERT/UPDATE/DELETE - all via RPCs

-- ============================================================================
-- ADR-028: Table Status Standardization
-- ============================================================================
-- Standardizes the two table status systems in PT-2:
-- 1. `table_status` (gaming_table.status) - Physical table availability
-- 2. `table_session_status` (table_session.status) - Session lifecycle phase
--
-- Implements:
-- - D3: Availability gate in rpc_open_table_session
-- - D7: drop_posted_at column for count status tracking
-- - Enum comments documenting canonical meanings
--
-- Bounded Context: TableContextService (SRM v4.0.0)
-- ADR References: ADR-028 (this), ADR-027 (depends on this)
-- ============================================================================

-- 1. Add count status field (D7)
ALTER TABLE table_session
ADD COLUMN IF NOT EXISTS drop_posted_at TIMESTAMPTZ;

COMMENT ON COLUMN table_session.drop_posted_at IS
  'Timestamp when soft count was posted. NULL = count pending, NOT NULL = count posted.';

-- 2. Document enum semantics (D2)
COMMENT ON TYPE table_status IS
  'Table availability: inactive (offline, not available for sessions), active (available for operation), closed (permanently decommissioned).';

COMMENT ON TYPE table_session_status IS
  'Session lifecycle phases: OPEN (reserved, MVP unused - awaiting opening snapshot), ACTIVE (in play), RUNDOWN (closing procedures), CLOSED (finalized historical record).';

-- 3. Update rpc_open_table_session with availability gate (D3)
CREATE OR REPLACE FUNCTION rpc_open_table_session(p_gaming_table_id uuid)
RETURNS table_session
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result table_session;
  v_casino_id uuid;
  v_actor_id uuid;
  v_role text;
  v_table_status table_status;
BEGIN
  -- ADR-024: Derive context from authoritative sources
  PERFORM set_rls_context_from_staff();

  v_casino_id := current_setting('app.casino_id')::uuid;
  v_actor_id := current_setting('app.actor_id')::uuid;

  -- Authorization (MVP): only pit_boss/admin may mutate sessions
  v_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  IF v_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = 'P0001',
            HINT = 'Only pit_boss or admin roles can open sessions';
  END IF;

  -- ADR-028 D3: Availability gate - require table to be active
  SELECT status INTO v_table_status
  FROM gaming_table
  WHERE id = p_gaming_table_id AND casino_id = v_casino_id;

  IF v_table_status IS NULL THEN
    RAISE EXCEPTION 'TBLSESS_TABLE_NOT_FOUND: Table % not found', p_gaming_table_id
      USING ERRCODE = 'P0002',
            HINT = 'Verify table exists and belongs to the current casino';
  ELSIF v_table_status <> 'active' THEN
    RAISE EXCEPTION 'TBLSESS_TABLE_NOT_AVAILABLE: Cannot open session, table status is % (expected active)', v_table_status
      USING ERRCODE = 'P0003',
            HINT = 'Table must be in active status to open a session';
  END IF;

  -- Validate no active session exists (lock row if found)
  IF EXISTS (
    SELECT 1 FROM table_session
    WHERE gaming_table_id = p_gaming_table_id
    AND casino_id = v_casino_id
    AND status IN ('OPEN', 'ACTIVE', 'RUNDOWN')
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'active_session_exists'
      USING ERRCODE = '23505',
            HINT = 'Close existing session before opening new one';
  END IF;

  -- Create new session with ACTIVE status (implicit OPEN → ACTIVE)
  INSERT INTO table_session (
    casino_id,
    gaming_table_id,
    status,
    opened_by_staff_id
  ) VALUES (
    v_casino_id,
    p_gaming_table_id,
    'ACTIVE',
    v_actor_id
  )
  RETURNING * INTO v_result;

  RETURN v_result;
EXCEPTION
  WHEN unique_violation THEN
    -- Race condition: another session was created between check and insert
    RAISE EXCEPTION 'active_session_exists'
      USING ERRCODE = '23505',
            HINT = 'Another session was opened concurrently';
END;
$$;

COMMENT ON FUNCTION rpc_open_table_session(uuid) IS 'Opens a new table session. Requires pit_boss/admin role. Enforces ADR-028 D3 availability gate (table must be active). ADR-024 compliant.';

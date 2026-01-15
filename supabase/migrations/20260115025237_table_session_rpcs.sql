-- ============================================================================
-- PRD-TABLE-SESSION-LIFECYCLE-MVP: WS2 - ADR-024 Compliant RPCs
-- ============================================================================
-- 4 SECURITY DEFINER RPCs for table session lifecycle operations.
-- All use set_rls_context_from_staff() per ADR-024 for authoritative context.
--
-- Bounded Context: TableContextService (SRM v4.0.0)
-- ADR References: ADR-024 (context injection), ADR-018 (SECURITY DEFINER governance)
-- ============================================================================

-- ============================================================================
-- 1. rpc_open_table_session
-- ============================================================================
-- Opens a new session for a gaming table.
-- Fails if an active session already exists for the table.
-- ============================================================================

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

COMMENT ON FUNCTION rpc_open_table_session(uuid) IS 'Opens a new table session. Requires pit_boss/admin role. ADR-024 compliant.';

-- ============================================================================
-- 2. rpc_start_table_rundown
-- ============================================================================
-- Transitions session from OPEN/ACTIVE to RUNDOWN state.
-- Marks the beginning of closing procedures.
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_start_table_rundown(p_table_session_id uuid)
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
  v_current_status table_session_status;
BEGIN
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
            HINT = 'Only pit_boss or admin roles can start rundown';
  END IF;

  -- Get current status with lock
  SELECT status INTO v_current_status
  FROM table_session
  WHERE id = p_table_session_id
  AND casino_id = v_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found'
      USING ERRCODE = 'P0002',
            HINT = 'Session does not exist or belongs to different casino';
  END IF;

  IF v_current_status NOT IN ('OPEN', 'ACTIVE') THEN
    RAISE EXCEPTION 'invalid_state_transition'
      USING ERRCODE = 'P0003',
            HINT = format('Cannot start rundown from %s state', v_current_status);
  END IF;

  UPDATE table_session SET
    status = 'RUNDOWN',
    rundown_started_at = now(),
    rundown_started_by_staff_id = v_actor_id
  WHERE id = p_table_session_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_start_table_rundown(uuid) IS 'Starts rundown procedures for a session. Requires pit_boss/admin role. ADR-024 compliant.';

-- ============================================================================
-- 3. rpc_close_table_session
-- ============================================================================
-- Closes a session from RUNDOWN (or ACTIVE) state.
-- Requires at least one closing artifact (drop_event_id or closing_inventory_snapshot_id).
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_close_table_session(
  p_table_session_id uuid,
  p_drop_event_id uuid DEFAULT NULL,
  p_closing_inventory_snapshot_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
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
  v_current_status table_session_status;
BEGIN
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
            HINT = 'Only pit_boss or admin roles can close sessions';
  END IF;

  -- Get current status with lock
  SELECT status INTO v_current_status
  FROM table_session
  WHERE id = p_table_session_id
  AND casino_id = v_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found'
      USING ERRCODE = 'P0002',
            HINT = 'Session does not exist or belongs to different casino';
  END IF;

  -- Require RUNDOWN state (or ACTIVE if shortcut allowed)
  IF v_current_status NOT IN ('RUNDOWN', 'ACTIVE') THEN
    RAISE EXCEPTION 'invalid_state_transition'
      USING ERRCODE = 'P0003',
            HINT = format('Cannot close from %s state', v_current_status);
  END IF;

  -- Require at least one closing artifact
  IF p_drop_event_id IS NULL AND p_closing_inventory_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'missing_closing_artifact'
      USING ERRCODE = 'P0004',
            HINT = 'Provide drop_event_id or closing_inventory_snapshot_id';
  END IF;

  UPDATE table_session SET
    status = 'CLOSED',
    closed_at = now(),
    closed_by_staff_id = v_actor_id,
    drop_event_id = COALESCE(p_drop_event_id, drop_event_id),
    closing_inventory_snapshot_id = COALESCE(p_closing_inventory_snapshot_id, closing_inventory_snapshot_id),
    notes = COALESCE(p_notes, notes)
  WHERE id = p_table_session_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_close_table_session(uuid, uuid, uuid, text) IS 'Closes a table session. Requires at least one closing artifact. Requires pit_boss/admin role. ADR-024 compliant.';

-- ============================================================================
-- 4. rpc_get_current_table_session
-- ============================================================================
-- Gets the current active (non-closed) session for a gaming table.
-- Returns NULL if no active session exists.
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_get_current_table_session(p_gaming_table_id uuid)
RETURNS table_session
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result table_session;
  v_casino_id uuid;
BEGIN
  PERFORM set_rls_context_from_staff();

  v_casino_id := current_setting('app.casino_id')::uuid;

  -- Get the most recent non-closed session (should be at most one due to unique index)
  SELECT * INTO v_result
  FROM table_session
  WHERE gaming_table_id = p_gaming_table_id
  AND casino_id = v_casino_id
  AND status IN ('OPEN', 'ACTIVE', 'RUNDOWN')
  ORDER BY opened_at DESC
  LIMIT 1;

  RETURN v_result; -- Returns NULL if not found
END;
$$;

COMMENT ON FUNCTION rpc_get_current_table_session(uuid) IS 'Gets the current active session for a table. Returns NULL if none. ADR-024 compliant.';

-- ============================================================================
-- Grants
-- ============================================================================

GRANT EXECUTE ON FUNCTION rpc_open_table_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_start_table_rundown(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_close_table_session(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_get_current_table_session(uuid) TO authenticated;

-- ============================================================================
-- ADR-027 WS2: RPC - Open Session Mode Binding
-- ============================================================================
-- Modifies rpc_open_table_session to bind bank mode + par at session creation.
-- This captures the casino's bank policy at the moment the session opens.
--
-- Bounded Context: TableContextService (SRM v4.10.0)
-- ADR References: ADR-027 (table bank mode), ADR-028 (availability gate)
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
  v_table_status table_status;
  v_bank_mode table_bank_mode;
  v_par_total integer;
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
  -- ADR-027: Also fetch par_total_cents for mode binding
  SELECT status, par_total_cents INTO v_table_status, v_par_total
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

  -- ADR-027: Resolve bank mode from casino settings
  SELECT table_bank_mode INTO v_bank_mode
  FROM casino_settings
  WHERE casino_id = v_casino_id;

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

  -- Create new session with ACTIVE status + ADR-027 mode binding
  INSERT INTO table_session (
    casino_id,
    gaming_table_id,
    status,
    opened_by_staff_id,
    table_bank_mode,
    need_total_cents
  ) VALUES (
    v_casino_id,
    p_gaming_table_id,
    'ACTIVE',
    v_actor_id,
    COALESCE(v_bank_mode, 'INVENTORY_COUNT'),
    v_par_total
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

COMMENT ON FUNCTION rpc_open_table_session(uuid) IS
  'Opens a new table session. Binds table_bank_mode + need_total_cents from casino settings/table (ADR-027). Enforces ADR-028 D3 availability gate. ADR-024 compliant.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

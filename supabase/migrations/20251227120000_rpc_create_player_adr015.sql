-- Migration: RPC for Player Creation (ADR-015 Compliant)
-- Purpose: SECURITY DEFINER RPC that bypasses transaction isolation issues
-- Issue: ISSUE-EC10252F - Player Create RLS Policy Violation
-- Reference: ADR-015 Pattern A (SECURITY DEFINER RPCs for write operations)

-- ============================================================================
-- rpc_create_player - Self-injecting RPC for player creation
-- ============================================================================
-- This function resolves the transaction isolation issue where SET LOCAL
-- context doesn't persist across connection pool transactions. By using
-- SECURITY DEFINER and performing the INSERT within the same function,
-- we guarantee consistent context throughout the operation.
--
-- The function:
-- 1. Validates caller's staff role (pit_boss or admin required)
-- 2. Validates actor exists and belongs to the casino
-- 3. Creates the player record
-- 4. Returns the created player with formatted DTO fields
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_create_player(
  p_casino_id uuid,
  p_actor_id uuid,
  p_first_name text,
  p_last_name text,
  p_birth_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_role text;
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_player_id uuid;
  v_player_record jsonb;
BEGIN
  -- 1. Extract context using hybrid fallback (ADR-015 Pattern C)
  v_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')
  );

  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  v_context_actor_id := COALESCE(
    NULLIF(current_setting('app.actor_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
  );

  -- 2. Validate staff role
  IF v_staff_role IS NULL OR v_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: staff_role must be pit_boss or admin, got: %', COALESCE(v_staff_role, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validate casino_id mismatch (ADR-018 security requirement)
  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %', p_casino_id, v_context_casino_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Self-inject RLS context (ADR-015 Phase 1A requirement)
  PERFORM set_rls_context(v_context_actor_id, p_casino_id, v_staff_role);

  -- 5. Validate actor exists and belongs to casino
  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE id = p_actor_id
      AND casino_id = p_casino_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Actor not found or not active in casino'
      USING ERRCODE = 'P0002';
  END IF;

  -- 6. Validate input
  IF p_first_name IS NULL OR trim(p_first_name) = '' THEN
    RAISE EXCEPTION 'first_name is required'
      USING ERRCODE = '23502'; -- not_null_violation
  END IF;

  IF p_last_name IS NULL OR trim(p_last_name) = '' THEN
    RAISE EXCEPTION 'last_name is required'
      USING ERRCODE = '23502'; -- not_null_violation
  END IF;

  -- 7. Create player record
  -- Note: player table doesn't have casino_id, just first/last name and birth_date
  INSERT INTO player (first_name, last_name, birth_date)
  VALUES (trim(p_first_name), trim(p_last_name), p_birth_date)
  RETURNING id INTO v_player_id;

  -- 8. Build and return player DTO
  -- Note: player table has created_at but not updated_at
  SELECT jsonb_build_object(
    'id', p.id,
    'firstName', p.first_name,
    'lastName', p.last_name,
    'birthDate', p.birth_date,
    'createdAt', p.created_at
  )
  INTO v_player_record
  FROM player p
  WHERE p.id = v_player_id;

  RETURN v_player_record;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION rpc_create_player(uuid, uuid, text, text, date) TO authenticated;

-- Document ADR-015 compliance
COMMENT ON FUNCTION rpc_create_player IS
  'ADR-015 Pattern A: SECURITY DEFINER RPC for player creation. Bypasses transaction isolation by validating context and performing INSERT in same transaction. ISSUE-EC10252F fix.';

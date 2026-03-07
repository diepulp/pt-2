-- ============================================================================
-- Migration: PRD-041 Phase C — Player Validate-to-Derive
-- Created: 2026-03-03
-- PRD Reference: docs/10-prd/PRD-041-adr024-p2-validate-to-derive-remediation-v0.md
-- ADR Reference: ADR-024 (authoritative context derivation)
-- Purpose: Remove p_casino_id from rpc_create_player. Casino scope derived
--          from set_rls_context_from_staff() session vars (v_casino_id).
-- Bounded Context: PlayerService
-- ============================================================================

-- DROP old signature (exact param types for phantom overload prevention)
DROP FUNCTION IF EXISTS public.rpc_create_player(uuid, text, text, date);

CREATE OR REPLACE FUNCTION public.rpc_create_player(
  p_first_name text,
  p_last_name text,
  p_birth_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_staff_role text;
  v_casino_id uuid;
  v_context_actor_id uuid;
  v_player_id uuid;
  v_player_record jsonb;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Defense-in-depth: casino context must be available
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
    USING ERRCODE = 'P0001';
  END IF;

  -- Validate staff role (pit_boss or admin required)
  IF v_staff_role IS NULL OR v_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: staff_role must be pit_boss or admin, got: %', COALESCE(v_staff_role, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate actor exists and belongs to casino
  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE id = v_context_actor_id
      AND casino_id = v_casino_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Actor not found or not active in casino'
      USING ERRCODE = 'P0002';
  END IF;

  -- Validate input
  IF p_first_name IS NULL OR trim(p_first_name) = '' THEN
    RAISE EXCEPTION 'first_name is required'
      USING ERRCODE = '23502';
  END IF;

  IF p_last_name IS NULL OR trim(p_last_name) = '' THEN
    RAISE EXCEPTION 'last_name is required'
      USING ERRCODE = '23502';
  END IF;

  -- Create player record
  INSERT INTO player (first_name, last_name, birth_date)
  VALUES (trim(p_first_name), trim(p_last_name), p_birth_date)
  RETURNING id INTO v_player_id;

  -- Create player_casino enrollment (ATOMIC with player creation)
  INSERT INTO player_casino (player_id, casino_id, status, enrolled_by)
  VALUES (v_player_id, v_casino_id, 'active', v_context_actor_id)
  ON CONFLICT (player_id, casino_id) DO NOTHING;

  -- Create player_loyalty record (ISSUE-B5894ED8 FIX)
  INSERT INTO player_loyalty (
    player_id,
    casino_id,
    current_balance,
    tier,
    preferences,
    updated_at
  ) VALUES (
    v_player_id,
    v_casino_id,
    0,
    NULL,
    '{}',
    now()
  )
  ON CONFLICT (player_id, casino_id) DO NOTHING;

  -- Build and return player DTO
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

REVOKE ALL ON FUNCTION public.rpc_create_player(text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_player(text, text, date) TO authenticated, service_role;

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Migration: PRD-034 WS2 — rpc_enroll_player (SECURITY DEFINER)
-- Created: 2026-02-11 18:01:00
-- PRD Reference: docs/10-prd/PRD-034-rls-write-path-remediation-v0.md
-- EXEC-SPEC: docs/20-architecture/specs/PRD-034/EXECUTION-SPEC-PRD-034.md
-- ADR References: ADR-024 (INV-7, INV-8), ADR-018 (SECURITY DEFINER),
--                 ADR-030 (D4 write-path session-var enforcement)
-- Markers: ADR-024, ADR-030, ADR-018
--
-- Purpose:
--   Replace broken PostgREST upsert in enrollPlayer() on Category A table
--   `player_casino`. Handles re-enrollment (existing player, new/existing
--   casino) via UPSERT with explicit column semantics.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_enroll_player(
  p_player_id uuid
)
RETURNS TABLE (player_id uuid, casino_id uuid, status text, enrolled_at timestamptz, enrolled_by uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id  uuid;
  v_actor_id   uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CONTEXT INJECTION (INV-7: all client-callable RPCs must call this)
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM public.set_rls_context_from_staff();

  -- Derive context (authoritative, not from parameters — INV-8)
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INPUT VALIDATION
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'player_id is required'
      USING ERRCODE = '22023'; -- invalid_parameter_value
  END IF;

  -- Validate player exists
  IF NOT EXISTS (SELECT 1 FROM public.player p WHERE p.id = p_player_id) THEN
    RAISE EXCEPTION 'Player not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- UPSERT player_casino — explicit column semantics per EXEC-SPEC
  -- On conflict: update status, enrolled_by, enrolled_at
  -- Never update: player_id, casino_id (PK), created_at
  -- ═══════════════════════════════════════════════════════════════════════
  RETURN QUERY
  INSERT INTO public.player_casino (
    player_id, casino_id, enrolled_by, status
  ) VALUES (
    p_player_id,
    v_casino_id,
    v_actor_id,
    'active'
  )
  ON CONFLICT (player_id, casino_id)
  DO UPDATE SET
    status = 'active',
    enrolled_by = v_actor_id,
    enrolled_at = now()
  RETURNING
    player_casino.player_id,
    player_casino.casino_id,
    player_casino.status::text,
    player_casino.enrolled_at,
    player_casino.enrolled_by;
END;
$$;

COMMENT ON FUNCTION public.rpc_enroll_player(uuid) IS
  'PRD-034: Enroll/re-enroll player in casino via SECURITY DEFINER RPC. '
  'Derives casino_id from context (INV-8). UPSERT with explicit column semantics: '
  'status, enrolled_by, enrolled_at update; PK and created_at preserved.';

-- Explicit owner (ADR-018)
ALTER FUNCTION public.rpc_enroll_player(uuid) OWNER TO postgres;

-- Grants: only authenticated (not anon, not PUBLIC)
REVOKE ALL ON FUNCTION public.rpc_enroll_player(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_enroll_player(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_enroll_player(uuid) TO authenticated;

-- PostgREST schema reload
NOTIFY pgrst, 'reload schema';

-- =============================================================
-- PRD-017: Player Last Session Context RPC
-- Purpose: Retrieve last closed session context for prefilling "Start from previous" form
-- =============================================================

-- Drop existing function if exists (for idempotency)
DROP FUNCTION IF EXISTS rpc_get_player_last_session_context(uuid, uuid);

-- Create the last session context RPC
-- SECURITY INVOKER: RLS enforced via caller's context
-- Returns context from most recently closed visit for the player
CREATE OR REPLACE FUNCTION rpc_get_player_last_session_context(
  p_casino_id uuid,
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_last_visit RECORD;
  v_last_segment jsonb;
  v_context_staff_role text;
  v_context_casino_id uuid;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling compatibility
  -- =======================================================================
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')
  );

  PERFORM set_rls_context(
    COALESCE(
      NULLIF(current_setting('app.actor_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
    ),
    p_casino_id,
    v_context_staff_role
  );

  -- Validate casino_id parameter matches caller's context
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id mismatch';
  END IF;
  -- =======================================================================

  -- 1. Find the most recently closed visit for this player
  -- Order by ended_at DESC to get most recent, with id as tiebreaker
  SELECT
    id,
    visit_group_id,
    ended_at
  INTO v_last_visit
  FROM visit
  WHERE casino_id = p_casino_id
    AND player_id = p_player_id
    AND ended_at IS NOT NULL  -- Only closed sessions
  ORDER BY ended_at DESC, id DESC
  LIMIT 1;

  -- 2. Return null if player has no closed sessions
  IF v_last_visit IS NULL THEN
    RETURN NULL;
  END IF;

  -- 3. Get last segment context from RatingSlipService published contract
  -- Uses rpc_get_visit_last_segment (created in WS4)
  SELECT rpc_get_visit_last_segment(v_last_visit.id)
  INTO v_last_segment;

  -- 4. Return null if visit has no segments
  IF v_last_segment IS NULL THEN
    RETURN NULL;
  END IF;

  -- 5. Build response by composing visit + segment context
  RETURN jsonb_build_object(
    'visit_id', v_last_visit.id,
    'visit_group_id', v_last_visit.visit_group_id,
    'last_table_id', v_last_segment->>'table_id',
    'last_table_name', v_last_segment->>'table_name',
    'last_seat_number', (v_last_segment->>'seat_number')::int,
    'last_game_settings', v_last_segment->'game_settings',
    'last_average_bet',
      CASE
        WHEN v_last_segment->>'average_bet' IS NULL THEN NULL
        ELSE (v_last_segment->>'average_bet')::numeric
      END,
    'ended_at', v_last_visit.ended_at
  );
END;
$$;

-- Add function comment for documentation
COMMENT ON FUNCTION rpc_get_player_last_session_context(uuid, uuid) IS
  'PRD-017 WS6: Returns last closed session context for prefilling continuation form. Composes visit data with rpc_get_visit_last_segment (RatingSlipService). Returns {visit_id, visit_group_id, last_table_id, last_table_name, last_seat_number, last_game_settings, last_average_bet, ended_at} or null if no closed sessions. SECURITY INVOKER - RLS enforced.';

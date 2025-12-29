-- ============================================================================
-- Migration: Fix Loyalty Ledger Instantiation Gap (ISSUE-B5894ED8)
-- ============================================================================
-- Problem: enrollPlayer() and rpc_create_player create player_casino but NOT
--          player_loyalty. The seed.sql masks this by explicitly creating both
--          records. In production, newly enrolled players have no loyalty
--          account until their first rating slip close triggers lazy upsert.
--
-- Fix: Add player_loyalty creation to rpc_create_player atomically.
--
-- ADR References:
--   - ADR-019: Loyalty points policy (ledger-based credit/debit model)
--   - ADR-022: Player identity enrollment architecture
--   - ADR-015: RLS connection pooling (Pattern C hybrid)
--
-- Related Issues:
--   - ISSUE-2875ACCF: Enrollment RLS visibility gap (already fixed)
--   - ISSUE-AE49B5DD: Column collision (fix uncommitted)
--   - ISSUE-752833A6: Policy snapshot (fix uncommitted)
-- ============================================================================

BEGIN;

-- ============================================================================
-- Update rpc_create_player to atomically create player_loyalty
-- ============================================================================
-- Now creates: player -> player_casino -> player_loyalty (all atomic)
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
  -- ═══════════════════════════════════════════════════════════════════════
  -- 1. Extract context using hybrid fallback (ADR-015 Pattern C)
  -- ═══════════════════════════════════════════════════════════════════════
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

  -- ═══════════════════════════════════════════════════════════════════════
  -- 2. Validate staff role (pit_boss or admin required)
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_staff_role IS NULL OR v_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: staff_role must be pit_boss or admin, got: %', COALESCE(v_staff_role, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 3. Validate casino_id mismatch (ADR-018 security requirement)
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %', p_casino_id, v_context_casino_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 4. Self-inject RLS context (ADR-015 Phase 1A requirement)
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM set_rls_context(v_context_actor_id, p_casino_id, v_staff_role);

  -- ═══════════════════════════════════════════════════════════════════════
  -- 5. Validate actor exists and belongs to casino
  -- ═══════════════════════════════════════════════════════════════════════
  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE id = p_actor_id
      AND casino_id = p_casino_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Actor not found or not active in casino'
      USING ERRCODE = 'P0002';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 6. Validate input
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_first_name IS NULL OR trim(p_first_name) = '' THEN
    RAISE EXCEPTION 'first_name is required'
      USING ERRCODE = '23502'; -- not_null_violation
  END IF;

  IF p_last_name IS NULL OR trim(p_last_name) = '' THEN
    RAISE EXCEPTION 'last_name is required'
      USING ERRCODE = '23502'; -- not_null_violation
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 7. Create player record
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO player (first_name, last_name, birth_date)
  VALUES (trim(p_first_name), trim(p_last_name), p_birth_date)
  RETURNING id INTO v_player_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 8. Create player_casino enrollment (ATOMIC with player creation)
  -- ISSUE-2875ACCF FIX: Players must be enrolled immediately so they're
  -- visible to RLS-protected queries (player_select_enrolled policy).
  --
  -- Idempotent: ON CONFLICT DO NOTHING handles:
  -- - Retries (same player_id, casino_id pair)
  -- - Edge cases where enrollment exists from another path
  --
  -- Unique constraint: uq_player_casino_casino_player (casino_id, player_id)
  -- Primary key: (player_id, casino_id)
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO player_casino (player_id, casino_id, status, enrolled_by)
  VALUES (v_player_id, p_casino_id, 'active', p_actor_id)
  ON CONFLICT (player_id, casino_id) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 9. Create player_loyalty record (ISSUE-B5894ED8 FIX)
  -- Players must have a loyalty account immediately on enrollment.
  -- This prevents:
  --   a) RLS policy failures when cashier tries lazy upsert
  --   b) Null loyalty balances in UI on first visit
  --   c) Race conditions during first rating slip close
  --
  -- Idempotent: ON CONFLICT DO NOTHING handles retries.
  -- ADR-019: Initial balance is 0, no tier assigned yet.
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO player_loyalty (
    player_id,
    casino_id,
    current_balance,
    tier,
    preferences,
    updated_at
  ) VALUES (
    v_player_id,
    p_casino_id,
    0,           -- Initial balance (ADR-019: ledger-based, starts at 0)
    NULL,        -- No tier yet (assigned after earning thresholds)
    '{}',        -- Empty preferences JSONB
    now()
  )
  ON CONFLICT (player_id, casino_id) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 10. Build and return player DTO
  -- ═══════════════════════════════════════════════════════════════════════
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

-- Grant execute to authenticated users (idempotent)
GRANT EXECUTE ON FUNCTION rpc_create_player(uuid, uuid, text, text, date) TO authenticated;

-- Update documentation
COMMENT ON FUNCTION rpc_create_player IS
  'ADR-015 Pattern A: SECURITY DEFINER RPC for player creation with atomic enrollment. '
  'Creates player + player_casino + player_loyalty records in same transaction. '
  'ISSUE-2875ACCF fix: Players immediately visible to RLS after creation. '
  'ISSUE-B5894ED8 fix: Players have loyalty account immediately on enrollment. '
  'Enrollment and loyalty creation idempotent via ON CONFLICT DO NOTHING.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

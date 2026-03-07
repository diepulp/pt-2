-- ============================================================================
-- ADR-040 WS1: Category A RPC Identity Derivation
--
-- Remove spoofable identity parameters from loyalty RPCs:
--   - rpc_redeem: remove p_issued_by_staff_id (8 -> 7 params)
--   - rpc_manual_credit: remove p_awarded_by_staff_id (5 -> 4 params)
--
-- Identity now derived from context via:
--   v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid
--
-- Per ADR-040 Category A: actor identity MUST be derived, never client-supplied.
-- ============================================================================

--------------------------------------------------------------------------------
-- RPC 1: rpc_redeem
-- OLD: (p_player_id, p_points, p_issued_by_staff_id, p_note, p_idempotency_key,
--        p_allow_overdraw, p_reward_id, p_reference) [8 params]
-- NEW: (p_player_id, p_points, p_note, p_idempotency_key,
--        p_allow_overdraw, p_reward_id, p_reference) [7 params]
--------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_redeem(uuid, integer, uuid, text, uuid, boolean, uuid, text);

CREATE OR REPLACE FUNCTION public.rpc_redeem(
  p_player_id uuid,
  p_points integer,
  p_note text,
  p_idempotency_key uuid,
  p_allow_overdraw boolean DEFAULT false,
  p_reward_id uuid DEFAULT NULL::uuid,
  p_reference text DEFAULT NULL::text
)
RETURNS TABLE(ledger_id uuid, points_delta integer, balance_before integer, balance_after integer, overdraw_applied boolean, is_existing boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_caller_role text;
  v_balance_before int;
  v_balance_after int;
  v_overdraw_applied boolean := false;
  v_max_overdraw int := 5000;
  v_existing_entry record;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();
  -- =======================================================================

  -- =======================================================================
  -- ADR-040: Derive actor identity from context (Category A)
  -- =======================================================================
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context';
  END IF;
  -- =======================================================================

  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Casino scope + role validation
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt()->'app_metadata'->>'casino_id')::uuid
  );

  -- SEC-007: Fail-closed casino context guard
  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'SEC-007: casino context missing';
  END IF;

  v_caller_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt()->'app_metadata'->>'staff_role')
  );

  IF v_caller_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % cannot issue comp redemptions', v_caller_role;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- VALIDATION: Input constraints
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_points <= 0 THEN
    RAISE EXCEPTION 'LOYALTY_POINTS_INVALID: Points must be positive (got %)', p_points;
  END IF;

  IF p_note IS NULL OR trim(p_note) = '' THEN
    RAISE EXCEPTION 'LOYALTY_NOTE_REQUIRED: Note is required for redemptions';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- IDEMPOTENCY: Check for existing entry
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO v_existing_entry
  FROM loyalty_ledger
  WHERE casino_id = v_context_casino_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    -- Return existing entry (idempotent hit)
    SELECT current_balance INTO v_balance_after
    FROM player_loyalty
    WHERE player_id = p_player_id AND casino_id = v_context_casino_id;

    RETURN QUERY SELECT
      v_existing_entry.id,
      v_existing_entry.points_delta,
      (v_existing_entry.metadata->>'balance_before')::int,
      COALESCE(v_balance_after, 0),
      (v_existing_entry.metadata->'overdraw'->>'allowed')::boolean IS TRUE,
      true;
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- CONCURRENCY: Row-level lock on player_loyalty (ADR-019 P6)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT current_balance INTO v_balance_before
  FROM player_loyalty
  WHERE player_id = p_player_id AND casino_id = v_context_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_PLAYER_NOT_FOUND: Player % has no loyalty record', p_player_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- OVERDRAW AUTHORIZATION (ADR-019 P4)
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_balance_before < p_points THEN
    -- Insufficient balance
    IF NOT p_allow_overdraw THEN
      RAISE EXCEPTION 'LOYALTY_INSUFFICIENT_BALANCE: Balance % < redemption %',
        v_balance_before, p_points;
    END IF;

    -- Overdraw requested; validate caller authority
    IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
      RAISE EXCEPTION 'LOYALTY_OVERDRAW_NOT_AUTHORIZED: Role % cannot approve overdraw', v_caller_role;
    END IF;

    -- Check overdraw cap
    IF (v_balance_before - p_points) < (-1 * v_max_overdraw) THEN
      RAISE EXCEPTION 'LOYALTY_OVERDRAW_EXCEEDS_CAP: Overdraw would exceed cap %', v_max_overdraw;
    END IF;

    v_overdraw_applied := true;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INSERT LEDGER ENTRY (RLS enforced)
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO loyalty_ledger (
    casino_id,
    player_id,
    points_delta,
    reason,
    staff_id,
    idempotency_key,
    source_kind,
    source_id,
    note,
    metadata
  ) VALUES (
    v_context_casino_id,
    p_player_id,
    -1 * p_points,
    'redeem',
    v_context_actor_id,
    p_idempotency_key,
    CASE WHEN p_reward_id IS NOT NULL THEN 'reward' ELSE 'manual' END,
    p_reward_id,
    p_note,
    jsonb_build_object(
      'redemption', jsonb_build_object(
        'reward_id', p_reward_id,
        'reference', p_reference,
        'note', p_note
      ),
      'balance_before', v_balance_before,
      'overdraw', CASE WHEN v_overdraw_applied THEN
        jsonb_build_object(
          'allowed', true,
          'approved_by_staff_id', v_context_actor_id,
          'approved_by_role', v_caller_role,
          'note', p_note
        )
      ELSE NULL END
    )
  )
  RETURNING id INTO ledger_id;

  -- Update balance
  v_balance_after := v_balance_before - p_points;

  UPDATE player_loyalty
  SET current_balance = v_balance_after,
      updated_at = now()
  WHERE player_id = p_player_id AND casino_id = v_context_casino_id;

  RETURN QUERY SELECT ledger_id, -1 * p_points, v_balance_before, v_balance_after, v_overdraw_applied, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_redeem(uuid, integer, text, uuid, boolean, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_redeem(uuid, integer, text, uuid, boolean, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_redeem(uuid, integer, text, uuid, boolean, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_redeem(uuid, integer, text, uuid, boolean, uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_redeem(uuid, integer, text, uuid, boolean, uuid, text)
  IS 'ADR-040/ADR-024: Redeem loyalty points. staff_id derived from RLS context (Category A). REVOKE anon/PUBLIC.';

--------------------------------------------------------------------------------
-- RPC 2: rpc_manual_credit
-- OLD: (p_player_id, p_points, p_awarded_by_staff_id, p_note, p_idempotency_key) [5 params]
-- NEW: (p_player_id, p_points, p_note, p_idempotency_key) [4 params]
--------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_manual_credit(uuid, integer, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.rpc_manual_credit(
  p_player_id uuid,
  p_points integer,
  p_note text,
  p_idempotency_key uuid
)
RETURNS TABLE(ledger_id uuid, points_delta integer, balance_after integer, is_existing boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_caller_role text;
  v_balance_after int;
  v_existing_entry record;
  v_player_loyalty_exists boolean;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();
  -- =======================================================================

  -- =======================================================================
  -- ADR-040: Derive actor identity from context (Category A)
  -- =======================================================================
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context';
  END IF;
  -- =======================================================================

  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Casino scope + role validation
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt()->'app_metadata'->>'casino_id')::uuid
  );

  -- SEC-007: Fail-closed casino context guard
  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'SEC-007: casino context missing';
  END IF;

  v_caller_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt()->'app_metadata'->>'staff_role')
  );

  IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % cannot issue manual credits (pit_boss or admin required)', v_caller_role;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- VALIDATION: Input constraints
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_points <= 0 THEN
    RAISE EXCEPTION 'LOYALTY_POINTS_INVALID: Points must be positive (got %)', p_points;
  END IF;

  IF p_note IS NULL OR trim(p_note) = '' THEN
    RAISE EXCEPTION 'LOYALTY_NOTE_REQUIRED: Note is required for manual credits';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- IDEMPOTENCY: Check for existing entry
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO v_existing_entry
  FROM loyalty_ledger
  WHERE casino_id = v_context_casino_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    -- Return existing entry (idempotent hit)
    SELECT current_balance INTO v_balance_after
    FROM player_loyalty
    WHERE player_id = p_player_id AND casino_id = v_context_casino_id;

    RETURN QUERY SELECT
      v_existing_entry.id,
      v_existing_entry.points_delta,
      COALESCE(v_balance_after, 0),
      true;
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INSERT LEDGER ENTRY
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO loyalty_ledger (
    casino_id,
    player_id,
    points_delta,
    reason,
    staff_id,
    idempotency_key,
    source_kind,
    source_id,
    note,
    metadata
  ) VALUES (
    v_context_casino_id,
    p_player_id,
    p_points,
    'manual_reward',
    v_context_actor_id,
    p_idempotency_key,
    'manual',
    NULL,
    p_note,
    jsonb_build_object(
      'manual_credit', jsonb_build_object(
        'awarded_by_staff_id', v_context_actor_id,
        'awarded_by_role', v_caller_role,
        'note', p_note
      )
    )
  )
  RETURNING id INTO ledger_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- UPDATE PLAYER BALANCE (upsert pattern)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT EXISTS(
    SELECT 1 FROM player_loyalty
    WHERE player_id = p_player_id AND casino_id = v_context_casino_id
  ) INTO v_player_loyalty_exists;

  IF v_player_loyalty_exists THEN
    UPDATE player_loyalty
    SET current_balance = current_balance + p_points,
        updated_at = now()
    WHERE player_id = p_player_id
      AND casino_id = v_context_casino_id
    RETURNING current_balance INTO v_balance_after;
  ELSE
    INSERT INTO player_loyalty (
      player_id,
      casino_id,
      current_balance,
      tier,
      preferences,
      updated_at
    ) VALUES (
      p_player_id,
      v_context_casino_id,
      p_points,
      NULL,
      '{}',
      now()
    )
    RETURNING current_balance INTO v_balance_after;
  END IF;

  RETURN QUERY SELECT ledger_id, p_points, v_balance_after, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_manual_credit(uuid, integer, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_manual_credit(uuid, integer, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_manual_credit(uuid, integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_manual_credit(uuid, integer, text, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_manual_credit(uuid, integer, text, uuid)
  IS 'ADR-040/ADR-024: Manual loyalty credit. staff_id derived from RLS context (Category A). REVOKE anon/PUBLIC.';

--------------------------------------------------------------------------------
-- Notify PostgREST to reload schema cache
--------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

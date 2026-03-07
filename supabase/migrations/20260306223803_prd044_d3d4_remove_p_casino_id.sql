-- PRD-044 Delivery 3+4: Remove p_casino_id from final 4 RPCs
-- RPCs: rpc_create_financial_txn, rpc_create_financial_adjustment, rpc_redeem, rpc_manual_credit
-- Pattern: derive casino_id from RLS context (set_rls_context_from_staff), fail-closed NULL check
-- Ref: ADR-024 authoritative context derivation, EXEC-044

BEGIN;

--------------------------------------------------------------------------------
-- RPC 1: rpc_create_financial_txn
-- OLD: (p_casino_id uuid, p_player_id uuid, p_visit_id uuid, p_amount numeric,
--       p_direction financial_direction, p_source financial_source,
--       p_created_by_staff_id uuid, p_tender_type text, p_rating_slip_id uuid,
--       p_related_transaction_id uuid, p_idempotency_key text,
--       p_created_at timestamptz, p_external_ref text)          [13 params]
-- NEW: (p_player_id uuid, p_visit_id uuid, p_amount numeric, ...)  [12 params]
--------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_create_financial_txn(uuid, uuid, uuid, numeric, financial_direction, financial_source, uuid, text, uuid, uuid, text, timestamptz, text);

CREATE OR REPLACE FUNCTION public.rpc_create_financial_txn(
  p_player_id uuid,
  p_visit_id uuid,
  p_amount numeric,
  p_direction financial_direction,
  p_source financial_source,
  p_created_by_staff_id uuid,
  p_tender_type text DEFAULT NULL::text,
  p_rating_slip_id uuid DEFAULT NULL::uuid,
  p_related_transaction_id uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text,
  p_created_at timestamp with time zone DEFAULT now(),
  p_external_ref text DEFAULT NULL::text
)
RETURNS player_financial_transaction
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_row player_financial_transaction%ROWTYPE;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- =======================================================================
  -- Authentication and Authorization Checks
  -- =======================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- SEC-007: Fail-closed casino context guard
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'SEC-007: casino context missing';
  END IF;

  IF v_actor_id IS NULL OR v_actor_id <> p_created_by_staff_id THEN
    RAISE EXCEPTION 'actor_id mismatch: context is % but caller provided %', v_actor_id, p_created_by_staff_id;
  END IF;

  IF v_staff_role IS NULL OR v_staff_role NOT IN ('cashier', 'pit_boss', 'admin') THEN
    RAISE EXCEPTION 'unauthorized: staff_role=% is not permitted to create financial transactions', v_staff_role;
  END IF;

  -- =======================================================================
  -- Role-specific validation (SEC-005 v1.2.0)
  -- =======================================================================
  IF v_staff_role = 'pit_boss' THEN
    IF p_direction != 'in' THEN
      RAISE EXCEPTION 'pit_boss can only create buy-in transactions (direction=in)';
    END IF;
    IF p_tender_type NOT IN ('cash', 'chips') THEN
      RAISE EXCEPTION 'pit_boss can only use cash or chips for buy-ins';
    END IF;
  END IF;

  -- =======================================================================
  -- Transaction Creation
  -- =======================================================================
  INSERT INTO public.player_financial_transaction AS t (
    id,
    player_id,
    casino_id,
    visit_id,
    rating_slip_id,
    amount,
    direction,
    source,
    tender_type,
    created_by_staff_id,
    related_transaction_id,
    created_at,
    idempotency_key,
    external_ref
  )
  VALUES (
    gen_random_uuid(),
    p_player_id,
    v_casino_id,
    p_visit_id,
    p_rating_slip_id,
    p_amount,
    p_direction,
    p_source,
    p_tender_type,
    p_created_by_staff_id,
    p_related_transaction_id,
    COALESCE(p_created_at, now()),
    p_idempotency_key,
    p_external_ref
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING t.* INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, uuid, text, uuid, uuid, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, uuid, text, uuid, uuid, text, timestamptz, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, uuid, text, uuid, uuid, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, uuid, text, uuid, uuid, text, timestamptz, text) TO service_role;

COMMENT ON FUNCTION public.rpc_create_financial_txn(uuid, uuid, numeric, financial_direction, financial_source, uuid, text, uuid, uuid, text, timestamptz, text)
  IS 'PRD-044/ADR-024: Create financial transaction. casino_id derived from RLS context (no spoofable param).';

--------------------------------------------------------------------------------
-- RPC 2: rpc_create_financial_adjustment
-- OLD: (p_casino_id uuid, p_player_id uuid, p_visit_id uuid, p_delta_amount numeric,
--       p_reason_code adjustment_reason_code, p_note text,
--       p_original_txn_id uuid, p_idempotency_key text)        [8 params]
-- NEW: same params minus p_casino_id, but p_casino_id uuid DEFAULT NULL
--      appended as LAST param for browser-bundle compat         [8 params, last DEFAULT NULL]
-- Compat invariant: p_casino_id exists only to absorb stale client payloads.
-- It must NOT be read, validated, compared, or written anywhere in the body.
--------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_create_financial_adjustment(uuid, uuid, uuid, numeric, adjustment_reason_code, text, uuid, text);

CREATE OR REPLACE FUNCTION public.rpc_create_financial_adjustment(
  p_player_id uuid,
  p_visit_id uuid,
  p_delta_amount numeric,
  p_reason_code adjustment_reason_code,
  p_note text,
  p_original_txn_id uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text,
  p_casino_id uuid DEFAULT NULL::uuid
)
RETURNS player_financial_transaction
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_original_txn player_financial_transaction%ROWTYPE;
  v_row player_financial_transaction%ROWTYPE;
  v_direction financial_direction;
  v_rating_slip_id uuid;  -- Inherited from original transaction
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- =======================================================================
  -- Authentication and Authorization Checks
  -- =======================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- SEC-007: Fail-closed casino context guard
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'SEC-007: casino context missing';
  END IF;

  IF v_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % not authorized for adjustments', v_staff_role;
  END IF;

  -- =======================================================================
  -- Input Validation
  -- =======================================================================
  IF p_delta_amount = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Delta amount cannot be zero';
  END IF;

  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Note is required for adjustments';
  END IF;

  IF length(trim(p_note)) < 10 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Note must be at least 10 characters';
  END IF;

  -- =======================================================================
  -- If linking to original transaction, validate and inherit scope
  -- =======================================================================
  IF p_original_txn_id IS NOT NULL THEN
    SELECT * INTO v_original_txn
      FROM player_financial_transaction
     WHERE id = p_original_txn_id
       AND casino_id = v_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND: Original transaction not found or access denied';
    END IF;

    IF v_original_txn.player_id <> p_player_id THEN
      RAISE EXCEPTION 'INVALID_INPUT: Cannot adjust transaction for different player';
    END IF;

    IF v_original_txn.visit_id <> p_visit_id THEN
      RAISE EXCEPTION 'INVALID_INPUT: Cannot adjust transaction for different visit';
    END IF;

    -- Inherit rating_slip_id so bridge trigger can fire for rated adjustments
    v_rating_slip_id := v_original_txn.rating_slip_id;
  END IF;

  -- =======================================================================
  -- Determine direction
  -- =======================================================================
  v_direction := 'in';

  -- =======================================================================
  -- Create the adjustment transaction (now includes rating_slip_id)
  -- =======================================================================
  INSERT INTO public.player_financial_transaction AS t (
    id,
    player_id,
    casino_id,
    visit_id,
    amount,
    direction,
    source,
    tender_type,
    created_by_staff_id,
    related_transaction_id,
    rating_slip_id,
    created_at,
    idempotency_key,
    txn_kind,
    reason_code,
    note
  )
  VALUES (
    gen_random_uuid(),
    p_player_id,
    v_casino_id,
    p_visit_id,
    p_delta_amount,
    v_direction,
    'pit',
    'adjustment',
    v_actor_id,
    p_original_txn_id,
    v_rating_slip_id,      -- Inherited from original (NULL if no original)
    now(),
    p_idempotency_key,
    'adjustment',
    p_reason_code,
    p_note
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING t.* INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_create_financial_adjustment(uuid, uuid, numeric, adjustment_reason_code, text, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_create_financial_adjustment(uuid, uuid, numeric, adjustment_reason_code, text, uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_financial_adjustment(uuid, uuid, numeric, adjustment_reason_code, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_financial_adjustment(uuid, uuid, numeric, adjustment_reason_code, text, uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_create_financial_adjustment(uuid, uuid, numeric, adjustment_reason_code, text, uuid, text, uuid)
  IS 'PRD-044/ADR-024: Create financial adjustment. casino_id derived from RLS context. Trailing p_casino_id DEFAULT NULL is browser-compat shim (not read).';

--------------------------------------------------------------------------------
-- RPC 3: rpc_redeem
-- OLD: (p_casino_id uuid, p_player_id uuid, p_points integer,
--       p_issued_by_staff_id uuid, p_note text, p_idempotency_key uuid,
--       p_allow_overdraw boolean, p_reward_id uuid, p_reference text)  [9 params]
-- NEW: (p_player_id uuid, p_points integer, ...)                       [8 params]
--------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_redeem(uuid, uuid, integer, uuid, text, uuid, boolean, uuid, text);

CREATE OR REPLACE FUNCTION public.rpc_redeem(
  p_player_id uuid,
  p_points integer,
  p_issued_by_staff_id uuid,
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
    p_issued_by_staff_id,
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
          'approved_by_staff_id', p_issued_by_staff_id,
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

REVOKE ALL ON FUNCTION public.rpc_redeem(uuid, integer, uuid, text, uuid, boolean, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_redeem(uuid, integer, uuid, text, uuid, boolean, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_redeem(uuid, integer, uuid, text, uuid, boolean, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_redeem(uuid, integer, uuid, text, uuid, boolean, uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_redeem(uuid, integer, uuid, text, uuid, boolean, uuid, text)
  IS 'PRD-044/ADR-024: Redeem loyalty points. casino_id derived from RLS context (no spoofable param). REVOKE anon/PUBLIC.';

--------------------------------------------------------------------------------
-- RPC 4: rpc_manual_credit
-- OLD: (p_casino_id uuid, p_player_id uuid, p_points integer,
--       p_awarded_by_staff_id uuid, p_note text, p_idempotency_key uuid)  [6 params]
-- NEW: (p_player_id uuid, p_points integer, ...)                          [5 params]
--------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_manual_credit(uuid, uuid, integer, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.rpc_manual_credit(
  p_player_id uuid,
  p_points integer,
  p_awarded_by_staff_id uuid,
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
    p_awarded_by_staff_id,
    p_idempotency_key,
    'manual',
    NULL,
    p_note,
    jsonb_build_object(
      'manual_credit', jsonb_build_object(
        'awarded_by_staff_id', p_awarded_by_staff_id,
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

REVOKE ALL ON FUNCTION public.rpc_manual_credit(uuid, integer, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_manual_credit(uuid, integer, uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_manual_credit(uuid, integer, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_manual_credit(uuid, integer, uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_manual_credit(uuid, integer, uuid, text, uuid)
  IS 'PRD-044/ADR-024: Manual loyalty credit. casino_id derived from RLS context (no spoofable param). REVOKE anon/PUBLIC.';

COMMIT;

--------------------------------------------------------------------------------
-- Notify PostgREST to reload schema cache (after COMMIT)
--------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

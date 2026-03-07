-- PRD-044 Phase 3: Cleanup rpc_create_financial_adjustment compat param + SEC-003 enforcement flip
-- Removes the trailing p_casino_id DEFAULT NULL compat shim now that browser bundles are updated.
-- Empties SEC-003 allowlist and flips enforcement to hard-fail.
-- Ref: EXEC-044 WS3

BEGIN;

--------------------------------------------------------------------------------
-- Step 1: DROP compat signature + CREATE final clean version
-- OLD: (p_player_id uuid, p_visit_id uuid, p_delta_amount numeric,
--       p_reason_code adjustment_reason_code, p_note text,
--       p_original_txn_id uuid, p_idempotency_key text,
--       p_casino_id uuid DEFAULT NULL)                          [8 params, compat]
-- NEW: (p_player_id uuid, p_visit_id uuid, p_delta_amount numeric,
--       p_reason_code adjustment_reason_code, p_note text,
--       p_original_txn_id uuid, p_idempotency_key text)        [7 params, final]
--------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_create_financial_adjustment(uuid, uuid, numeric, adjustment_reason_code, text, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.rpc_create_financial_adjustment(
  p_player_id uuid,
  p_visit_id uuid,
  p_delta_amount numeric,
  p_reason_code adjustment_reason_code,
  p_note text,
  p_original_txn_id uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text
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

REVOKE ALL ON FUNCTION public.rpc_create_financial_adjustment(uuid, uuid, numeric, adjustment_reason_code, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_create_financial_adjustment(uuid, uuid, numeric, adjustment_reason_code, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_financial_adjustment(uuid, uuid, numeric, adjustment_reason_code, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_financial_adjustment(uuid, uuid, numeric, adjustment_reason_code, text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_create_financial_adjustment(uuid, uuid, numeric, adjustment_reason_code, text, uuid, text)
  IS 'PRD-044/ADR-024: Create financial adjustment. casino_id derived from RLS context (no spoofable param). Final clean signature.';

COMMIT;

--------------------------------------------------------------------------------
-- Notify PostgREST to reload schema cache (after COMMIT)
--------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

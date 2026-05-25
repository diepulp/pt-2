-- PRD-083 Phase 2.1 — WS3: RPC Signature Remediation
-- Restores the canonical ADR-040/PRD-044 no-p_casino_id signature for
-- rpc_create_financial_adjustment. Migration 20260512021632 (Bug-3 fix) applied
-- CREATE OR REPLACE with p_casino_id as the first parameter, reintroducing the
-- stale 8-argument shape that PRD-044 (20260306224345) had removed.
--
-- Changes:
--   1. DROP stale 8-param overload (p_casino_id, p_player_id, p_visit_id, ...)
--   2. CREATE OR REPLACE canonical 7-param no-p_casino_id shape (ADR-040 SECURITY INVOKER)
--   3. Preserve Bug-3 DO NOTHING idempotency fix (no ON CONFLICT DO UPDATE)
--   4. Post-state assertion: no p_casino_id overload remains
--
-- Does NOT add outbox emission — that is WS4 (20260517234015).

BEGIN;

-- ===========================================================================
-- Pre-state assertion: PRD-082 teardown must be applied
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name   = 'outbox_integration_proof_state'
  ) THEN
    RAISE EXCEPTION
      'PRE-STATE FAIL: outbox_integration_proof_state still exists. '
      'Apply 20260517141021_remove_prd082_harness_receipt_proof_state.sql first.';
  END IF;
END;
$$;

-- ===========================================================================
-- Drop stale 8-param overload (p_casino_id first param, reintroduced by 20260512021632)
-- ===========================================================================
DROP FUNCTION IF EXISTS public.rpc_create_financial_adjustment(
  uuid, uuid, uuid, numeric, adjustment_reason_code, text, uuid, text
);

-- ===========================================================================
-- Canonical 7-param no-p_casino_id function (ADR-040 SECURITY INVOKER)
-- Casino scope derived exclusively from set_rls_context_from_staff() (ADR-024).
-- Bug-3 fix: ON CONFLICT DO NOTHING + SELECT replay (no DO UPDATE).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.rpc_create_financial_adjustment(
  p_player_id       uuid,
  p_visit_id        uuid,
  p_delta_amount    numeric,
  p_reason_code     adjustment_reason_code,
  p_note            text,
  p_original_txn_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS player_financial_transaction
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id      uuid;
  v_actor_id       uuid;
  v_staff_role     text;
  v_original_txn   player_financial_transaction%ROWTYPE;
  v_row            player_financial_transaction%ROWTYPE;
  v_direction      financial_direction;
  v_rating_slip_id uuid;
BEGIN
  -- ADR-024 + ADR-040: authoritative context derivation; no caller-supplied identity
  PERFORM set_rls_context_from_staff();

  v_casino_id  := NULLIF(current_setting('app.casino_id',  true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id',   true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: No casino context';
  END IF;

  IF v_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % not authorized for adjustments', v_staff_role;
  END IF;

  IF p_delta_amount = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Delta amount cannot be zero';
  END IF;

  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Note is required for adjustments';
  END IF;

  IF length(trim(p_note)) < 10 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Note must be at least 10 characters';
  END IF;

  IF p_original_txn_id IS NOT NULL THEN
    SELECT * INTO v_original_txn
      FROM player_financial_transaction
     WHERE id        = p_original_txn_id
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

    v_rating_slip_id := v_original_txn.rating_slip_id;
  END IF;

  v_direction := 'in';

  -- Bug-3 fix: DO NOTHING (not DO UPDATE) — player_financial_transaction_no_updates
  -- has USING=false, so ON CONFLICT DO UPDATE triggers the denial policy even when no
  -- conflict occurs. On idempotency replay, SELECT fetches the existing row.
  INSERT INTO public.player_financial_transaction AS t (
    id, player_id, casino_id, visit_id, amount, direction, source, tender_type,
    created_by_staff_id, related_transaction_id, rating_slip_id, created_at,
    idempotency_key, txn_kind, reason_code, note
  )
  VALUES (
    gen_random_uuid(), p_player_id, v_casino_id, p_visit_id, p_delta_amount,
    v_direction, 'pit', 'adjustment', v_actor_id, p_original_txn_id, v_rating_slip_id,
    now(), p_idempotency_key, 'adjustment', p_reason_code, p_note
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING t.* INTO v_row;

  -- Idempotency replay: RETURNING is empty on DO NOTHING — fetch existing row
  IF v_row.id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_row
      FROM public.player_financial_transaction
     WHERE casino_id      = v_casino_id
       AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN v_row;
END;
$$;

-- ===========================================================================
-- Post-state assertion: prove no p_casino_id overload survives
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_proc   p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname  = 'public'
       AND p.proname  = 'rpc_create_financial_adjustment'
       AND p.proargnames @> ARRAY['p_casino_id']
  ) THEN
    RAISE EXCEPTION
      'POST-STATE FAIL: a rpc_create_financial_adjustment overload with p_casino_id '
      'still exists in pg_proc. Drop it before proceeding.';
  END IF;
END;
$$;

-- ===========================================================================
-- Grants on canonical 7-param signature
-- ===========================================================================
REVOKE EXECUTE ON FUNCTION public.rpc_create_financial_adjustment(
  uuid, uuid, numeric, adjustment_reason_code, text, uuid, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_create_financial_adjustment(
  uuid, uuid, numeric, adjustment_reason_code, text, uuid, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_create_financial_adjustment(
  uuid, uuid, numeric, adjustment_reason_code, text, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.rpc_create_financial_adjustment(
  uuid, uuid, numeric, adjustment_reason_code, text, uuid, text
) IS
  'PRD-083 WS3: canonical 7-param no-p_casino_id signature. '
  'ADR-040 SECURITY INVOKER. Casino scope from set_rls_context_from_staff() only (ADR-024). '
  'Bug-3 DO NOTHING idempotency fix preserved (no ON CONFLICT DO UPDATE). '
  'Outbox emission added by WS4 migration 20260517234015.';

COMMIT;

NOTIFY pgrst, 'reload schema';

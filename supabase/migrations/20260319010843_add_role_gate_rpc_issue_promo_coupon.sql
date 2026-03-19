-- ============================================================================
-- Migration: Add role gate to rpc_issue_promo_coupon
-- Created: 2026-03-19
-- PRD Reference: PRD-052 Loyalty Operator Issuance (WS1)
-- Security Reference: SEC-002, ADR-024
-- Purpose: Fix P0 security gap — any authenticated staff could issue entitlements.
--          Only pit_boss and admin may issue promo coupons.
--          Cashier excluded per SEC-002 ("No promo access").
--          Follows rpc_redeem role gate pattern (20260307114447, line 81).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_issue_promo_coupon(
  p_promo_program_id uuid,
  p_validation_number text,
  p_idempotency_key text,
  p_player_id uuid DEFAULT NULL,
  p_visit_id uuid DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_caller_role text;
  v_program promo_program%ROWTYPE;
  v_coupon promo_coupon%ROWTYPE;
  v_existing_coupon promo_coupon%ROWTYPE;
  v_allow_anonymous boolean;
BEGIN
  -- ADR-024: Authoritative context injection (first statement)
  PERFORM set_rls_context_from_staff(p_correlation_id::text);

  -- Extract validated context
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  IF v_casino_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: context not established'
      USING ERRCODE = 'P0001';
  END IF;

  -- PRD-052 WS1: Role gate — only pit_boss and admin may issue promo coupons.
  -- Cashier excluded per SEC-002 ("No promo access").
  -- Follows rpc_redeem role gate pattern.
  v_caller_role := NULLIF(current_setting('app.staff_role', true), '');
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % cannot issue promo coupons', COALESCE(v_caller_role, 'unknown')
      USING ERRCODE = 'P0001';
  END IF;

  -- Check idempotency first
  SELECT * INTO v_existing_coupon
  FROM promo_coupon
  WHERE casino_id = v_casino_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_existing', true,
      'coupon', jsonb_build_object(
        'id', v_existing_coupon.id,
        'validation_number', v_existing_coupon.validation_number,
        'status', v_existing_coupon.status,
        'face_value_amount', v_existing_coupon.face_value_amount,
        'issued_at', v_existing_coupon.issued_at
      )
    );
  END IF;

  -- Validate program exists and is active
  SELECT * INTO v_program
  FROM promo_program
  WHERE id = p_promo_program_id
    AND casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROMO_PROGRAM_NOT_FOUND: program does not exist or belongs to different casino'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_program.status != 'active' THEN
    RAISE EXCEPTION 'PROMO_PROGRAM_INACTIVE: program is not active (status=%)', v_program.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Check date range
  IF v_program.start_at IS NOT NULL AND now() < v_program.start_at THEN
    RAISE EXCEPTION 'PROMO_PROGRAM_NOT_STARTED: program starts at %', v_program.start_at
      USING ERRCODE = 'P0001';
  END IF;

  IF v_program.end_at IS NOT NULL AND now() > v_program.end_at THEN
    RAISE EXCEPTION 'PROMO_PROGRAM_ENDED: program ended at %', v_program.end_at
      USING ERRCODE = 'P0001';
  END IF;

  -- Check anonymous issuance policy if no player
  IF p_player_id IS NULL THEN
    SELECT COALESCE((cs.promo_allow_anonymous_issuance)::boolean, true) INTO v_allow_anonymous
    FROM casino_settings cs
    WHERE cs.casino_id = v_casino_id;

    IF NOT v_allow_anonymous THEN
      RAISE EXCEPTION 'ANONYMOUS_ISSUANCE_DISABLED: casino requires player for promo issuance'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Validate player belongs to casino if provided
  IF p_player_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM player_casino
      WHERE player_id = p_player_id
        AND casino_id = v_casino_id
    ) THEN
      RAISE EXCEPTION 'PLAYER_NOT_ENROLLED: player not enrolled at this casino'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Validate visit belongs to casino if provided
  IF p_visit_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM visit
      WHERE id = p_visit_id
        AND casino_id = v_casino_id
    ) THEN
      RAISE EXCEPTION 'VISIT_NOT_FOUND: visit does not exist at this casino'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Issue the coupon
  INSERT INTO promo_coupon (
    casino_id,
    promo_program_id,
    validation_number,
    status,
    face_value_amount,
    required_match_wager_amount,
    issued_at,
    expires_at,
    player_id,
    visit_id,
    issued_by_staff_id,
    idempotency_key,
    correlation_id
  ) VALUES (
    v_casino_id,
    p_promo_program_id,
    p_validation_number,
    'issued',
    v_program.face_value_amount,
    v_program.required_match_wager_amount,
    now(),
    p_expires_at,
    p_player_id,
    p_visit_id,
    v_actor_id,
    p_idempotency_key,
    p_correlation_id
  ) RETURNING * INTO v_coupon;

  -- Emit to loyalty_outbox
  INSERT INTO loyalty_outbox (
    casino_id,
    event_type,
    payload,
    created_at
  ) VALUES (
    v_casino_id,
    'promo_coupon_issued',
    jsonb_build_object(
      'coupon_id', v_coupon.id,
      'promo_program_id', v_coupon.promo_program_id,
      'validation_number', v_coupon.validation_number,
      'face_value_amount', v_coupon.face_value_amount,
      'player_id', v_coupon.player_id,
      'visit_id', v_coupon.visit_id,
      'issued_by', v_actor_id,
      'correlation_id', p_correlation_id
    ),
    now()
  );

  -- Audit log
  INSERT INTO audit_log (
    casino_id,
    actor_id,
    domain,
    action,
    dto_after,
    correlation_id
  ) VALUES (
    v_casino_id,
    v_actor_id,
    'loyalty',
    'promo_coupon_issued',
    jsonb_build_object(
      'coupon_id', v_coupon.id,
      'validation_number', v_coupon.validation_number,
      'program_id', v_coupon.promo_program_id,
      'face_value', v_coupon.face_value_amount
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'is_existing', false,
    'coupon', jsonb_build_object(
      'id', v_coupon.id,
      'validation_number', v_coupon.validation_number,
      'status', v_coupon.status,
      'face_value_amount', v_coupon.face_value_amount,
      'required_match_wager_amount', v_coupon.required_match_wager_amount,
      'issued_at', v_coupon.issued_at,
      'expires_at', v_coupon.expires_at,
      'player_id', v_coupon.player_id,
      'visit_id', v_coupon.visit_id
    )
  );
END;
$$;

-- Maintain existing grants
REVOKE ALL ON FUNCTION public.rpc_issue_promo_coupon FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_issue_promo_coupon TO authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

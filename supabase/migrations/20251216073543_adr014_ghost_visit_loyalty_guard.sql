-- ============================================================================
-- Migration: ADR-014 Ghost Visit Loyalty Guard
-- ============================================================================
-- Purpose: Add explicit ghost visit checks to loyalty RPCs per ADR-014
--
-- ADR-014 states:
-- - Ghost gaming visits CAN have rating slips for compliance/finance/MTL
-- - Ghost gaming visits are EXCLUDED from automated loyalty accrual
-- - LoyaltyService checks for ghost visits at accrual time
--
-- This migration adds explicit guards to loyalty RPCs to provide clear error
-- messages when ghost visit accrual is attempted, rather than failing with
-- a generic NOT NULL constraint violation.
-- ============================================================================

-- ============================================================================
-- UPDATE RPC 1: Base Accrual on Rating Slip Close
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_accrue_on_close(
  p_rating_slip_id uuid,
  p_casino_id uuid,
  p_idempotency_key uuid
)
RETURNS TABLE (
  ledger_id uuid,
  points_delta int,
  theo numeric,
  balance_after int,
  is_existing boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_context_casino_id uuid;
  v_caller_role text;
  v_slip record;
  v_loyalty_snapshot jsonb;
  v_theo numeric;
  v_base_points int;
  v_existing_entry record;
  v_balance_after int;
  v_player_loyalty_exists boolean;
  v_new_ledger_id uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Casino scope validation (SEC-001)
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_context_casino_id IS NULL THEN
    -- Fallback to JWT
    v_context_casino_id := (auth.jwt()->'app_metadata'->>'casino_id')::uuid;
  END IF;

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not set (app.casino_id is required)';
  END IF;

  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH: Caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Role validation (ADR-019)
  -- ═══════════════════════════════════════════════════════════════════════
  v_caller_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt()->'app_metadata'->>'staff_role')
  );

  IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % cannot mint base accrual', v_caller_role;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- IDEMPOTENCY: Check for existing entry (business uniqueness)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO v_existing_entry
  FROM loyalty_ledger
  WHERE casino_id = p_casino_id
    AND rating_slip_id = p_rating_slip_id
    AND reason = 'base_accrual';

  IF FOUND THEN
    -- Return existing entry (idempotent hit)
    SELECT current_balance INTO v_balance_after
    FROM player_loyalty
    WHERE player_id = v_existing_entry.player_id AND casino_id = p_casino_id;

    RETURN QUERY SELECT
      v_existing_entry.id,
      v_existing_entry.points_delta,
      (v_existing_entry.metadata->'calc'->>'theo')::numeric,
      COALESCE(v_balance_after, 0),
      true;
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- BUSINESS LOGIC: Fetch rating slip and validate
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO v_slip
  FROM rating_slip
  WHERE id = p_rating_slip_id AND casino_id = p_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  IF v_slip.status != 'closed' THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_CLOSED: Base accrual requires status=closed (current: %)', v_slip.status;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ADR-014 GHOST VISIT GUARD: Exclude ghost visits from loyalty accrual
  -- ═══════════════════════════════════════════════════════════════════════
  -- Per ADR-014 Section 5.2:
  -- "RatingSlipService may still capture telemetry [for ghost visits], but
  -- only for non-loyalty purposes. LoyaltyService does NOT accrue points
  -- from ghost visits."
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_slip.player_id IS NULL THEN
    RAISE EXCEPTION 'LOYALTY_GHOST_VISIT_EXCLUDED: Rating slip % is for a ghost visit (player_id is null). Per ADR-014, ghost gaming visits are excluded from automated loyalty accrual. Telemetry is recorded for compliance/finance only.', p_rating_slip_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- CANONICAL SOURCE: policy_snapshot.loyalty (ADR-019 D2)
  -- ═══════════════════════════════════════════════════════════════════════
  v_loyalty_snapshot := v_slip.policy_snapshot->'loyalty';

  IF v_loyalty_snapshot IS NULL THEN
    RAISE EXCEPTION 'LOYALTY_SNAPSHOT_MISSING: Rating slip lacks policy_snapshot.loyalty';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- DETERMINISTIC CALCULATION (ADR-019 D1)
  -- ═══════════════════════════════════════════════════════════════════════
  v_theo := calculate_theo_from_snapshot(v_slip, v_loyalty_snapshot);
  v_base_points := ROUND(v_theo * (v_loyalty_snapshot->>'points_conversion_rate')::numeric);

  -- Constraint: Never mint negative points
  IF v_base_points < 0 THEN
    v_base_points := 0;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INSERT LEDGER ENTRY (RLS enforced: casino_id + role check)
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO loyalty_ledger (
    casino_id,
    player_id,
    rating_slip_id,
    visit_id,
    points_delta,
    reason,
    idempotency_key,
    source_kind,
    source_id,
    metadata
  ) VALUES (
    p_casino_id,
    v_slip.player_id,
    p_rating_slip_id,
    v_slip.visit_id,
    v_base_points,
    'base_accrual',
    p_idempotency_key,
    'rating_slip',
    p_rating_slip_id,
    jsonb_build_object(
      'calc', jsonb_build_object(
        'theo', v_theo,
        'base_points', v_base_points,
        'snapshot', v_loyalty_snapshot
      )
    )
  )
  RETURNING id INTO v_new_ledger_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- UPDATE BALANCE CACHE (player_loyalty)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT EXISTS (
    SELECT 1 FROM player_loyalty
    WHERE player_id = v_slip.player_id AND casino_id = p_casino_id
  ) INTO v_player_loyalty_exists;

  IF v_player_loyalty_exists THEN
    UPDATE player_loyalty
    SET current_balance = current_balance + v_base_points,
        updated_at = now()
    WHERE player_id = v_slip.player_id AND casino_id = p_casino_id
    RETURNING current_balance INTO v_balance_after;
  ELSE
    -- Auto-create player_loyalty record with initial balance
    INSERT INTO player_loyalty (player_id, casino_id, current_balance)
    VALUES (v_slip.player_id, p_casino_id, v_base_points)
    RETURNING current_balance INTO v_balance_after;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- RETURN RESULT
  -- ═══════════════════════════════════════════════════════════════════════
  RETURN QUERY SELECT
    v_new_ledger_id,
    v_base_points,
    v_theo,
    v_balance_after,
    false;
END;
$$;

COMMENT ON FUNCTION rpc_accrue_on_close IS
  'Base accrual RPC: Mints loyalty points on rating slip close. ADR-014 compliant - explicitly rejects ghost visits with clear error message. Uses deterministic theo calculation from policy_snapshot.loyalty (ADR-019).';

-- ============================================================================
-- UPDATE RPC 2: Apply Promotion (also needs ghost visit guard)
-- ============================================================================

-- Drop existing function first (return type change requires DROP)
DROP FUNCTION IF EXISTS rpc_apply_promotion(uuid, uuid, text, numeric, int, uuid);

CREATE OR REPLACE FUNCTION rpc_apply_promotion(
  p_casino_id uuid,
  p_rating_slip_id uuid,
  p_campaign_id text,
  p_promo_multiplier numeric DEFAULT NULL,
  p_bonus_points int DEFAULT 0,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS TABLE (
  ledger_id uuid,
  points_delta int,
  balance_after int,
  is_existing boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_context_casino_id uuid;
  v_caller_role text;
  v_slip record;
  v_existing_entry record;
  v_base_entry record;
  v_final_points int;
  v_balance_after int;
  v_new_ledger_id uuid;
  v_player_loyalty_exists boolean;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Casino scope validation (SEC-001)
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_context_casino_id IS NULL THEN
    v_context_casino_id := (auth.jwt()->'app_metadata'->>'casino_id')::uuid;
  END IF;

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not set (app.casino_id is required)';
  END IF;

  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH: Caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Role validation
  -- ═══════════════════════════════════════════════════════════════════════
  v_caller_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt()->'app_metadata'->>'staff_role')
  );

  IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % cannot apply promotions', v_caller_role;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- BUSINESS UNIQUENESS: One promo per campaign per slip
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO v_existing_entry
  FROM loyalty_ledger
  WHERE casino_id = p_casino_id
    AND rating_slip_id = p_rating_slip_id
    AND campaign_id = p_campaign_id
    AND reason = 'promo';

  IF FOUND THEN
    SELECT current_balance INTO v_balance_after
    FROM player_loyalty
    WHERE player_id = v_existing_entry.player_id AND casino_id = p_casino_id;

    RETURN QUERY SELECT
      v_existing_entry.id,
      v_existing_entry.points_delta,
      COALESCE(v_balance_after, 0),
      true;
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- FETCH RATING SLIP
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO v_slip
  FROM rating_slip
  WHERE id = p_rating_slip_id AND casino_id = p_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ADR-014 GHOST VISIT GUARD: Exclude ghost visits from promotions
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_slip.player_id IS NULL THEN
    RAISE EXCEPTION 'LOYALTY_GHOST_VISIT_EXCLUDED: Rating slip % is for a ghost visit (player_id is null). Per ADR-014, ghost gaming visits are excluded from promotional rewards.', p_rating_slip_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- CALCULATE PROMO POINTS
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_promo_multiplier IS NOT NULL THEN
    SELECT * INTO v_base_entry
    FROM loyalty_ledger
    WHERE casino_id = p_casino_id
      AND rating_slip_id = p_rating_slip_id
      AND reason = 'base_accrual';

    IF FOUND THEN
      v_final_points := ROUND(v_base_entry.points_delta * (p_promo_multiplier - 1));
    ELSE
      v_final_points := p_bonus_points;
    END IF;
  ELSE
    v_final_points := p_bonus_points;
  END IF;

  IF v_final_points <= 0 THEN
    v_final_points := 0;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INSERT PROMO LEDGER ENTRY
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO loyalty_ledger (
    casino_id,
    player_id,
    rating_slip_id,
    visit_id,
    points_delta,
    reason,
    campaign_id,
    idempotency_key,
    source_kind,
    source_id,
    metadata
  ) VALUES (
    p_casino_id,
    v_slip.player_id,
    p_rating_slip_id,
    v_slip.visit_id,
    v_final_points,
    'promo',
    p_campaign_id,
    p_idempotency_key,
    'campaign',
    p_rating_slip_id,
    jsonb_build_object(
      'campaign_id', p_campaign_id,
      'promo_multiplier', p_promo_multiplier,
      'bonus_points', p_bonus_points
    )
  )
  RETURNING id INTO v_new_ledger_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- UPDATE BALANCE CACHE
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT EXISTS (
    SELECT 1 FROM player_loyalty
    WHERE player_id = v_slip.player_id AND casino_id = p_casino_id
  ) INTO v_player_loyalty_exists;

  IF v_player_loyalty_exists THEN
    UPDATE player_loyalty
    SET current_balance = current_balance + v_final_points,
        updated_at = now()
    WHERE player_id = v_slip.player_id AND casino_id = p_casino_id
    RETURNING current_balance INTO v_balance_after;
  ELSE
    INSERT INTO player_loyalty (player_id, casino_id, current_balance)
    VALUES (v_slip.player_id, p_casino_id, v_final_points)
    RETURNING current_balance INTO v_balance_after;
  END IF;

  RETURN QUERY SELECT
    v_new_ledger_id,
    v_final_points,
    v_balance_after,
    false;
END;
$$;

COMMENT ON FUNCTION rpc_apply_promotion IS
  'Promo overlay RPC: Applies promotional bonus points to a rating slip. ADR-014 compliant - explicitly rejects ghost visits. Enforces business uniqueness: one promotion per campaign per slip.';

-- ============================================================================
-- ADD ERROR CODE TO DOMAIN ERRORS DOCUMENTATION
-- ============================================================================
COMMENT ON SCHEMA public IS
  'LOYALTY_GHOST_VISIT_EXCLUDED error (ADR-014): Ghost gaming visits are excluded from automated loyalty accrual. Rating slips for ghost visits contain compliance-only telemetry for finance, MTL, and AML tracking.';

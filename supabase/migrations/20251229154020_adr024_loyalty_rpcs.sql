-- ============================================================================
-- Migration: ADR-024 Loyalty RPCs - Secure Context Injection
-- Created: 2025-12-29
-- ADR Reference: docs/80-adrs/ADR-024_DECISIONS.md
-- EXEC-SPEC: docs/20-architecture/specs/ADR-024/EXEC-SPEC-024.md
-- Workstream: WS2 - Update Loyalty RPCs
-- ============================================================================
-- Purpose: Replace vulnerable set_rls_context() calls with secure
--          set_rls_context_from_staff() in all 7 loyalty RPCs.
--
-- RPCs Updated:
--   1. rpc_accrue_on_close
--   2. rpc_redeem
--   3. rpc_manual_credit
--   4. rpc_apply_promotion
--   5. rpc_reconcile_loyalty_balance
--   6. rpc_get_player_ledger
--   7. rpc_issue_mid_session_reward
--
-- Security Improvement:
--   BEFORE: v_context_staff_role extraction + PERFORM set_rls_context(...)
--           with spoofable current_setting/JWT fallback parameters
--   AFTER:  PERFORM set_rls_context_from_staff(); (no spoofable params)
--
-- Invariants Enforced:
--   INV-3: Staff identity bound to auth.uid()
--   INV-5: Context set via SET LOCAL (pooler-safe)
--   INV-6: Deterministic staff lookup (unique user_id)
-- ============================================================================

BEGIN;

-- ============================================================================
-- RPC 1: rpc_accrue_on_close
-- ============================================================================
-- Source: 20251229024258_issue_b5894ed8_p0_blockers.sql
-- Change: Replace vulnerable self-injection with set_rls_context_from_staff()
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
SET search_path = public
AS $$
DECLARE
  v_claim_casino_id uuid;
  v_caller_role text;
  v_slip record;
  v_player_id uuid;
  v_loyalty_snapshot jsonb;
  v_theo numeric;
  v_base_points int;
  v_existing_entry record;
  v_balance_after int;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();
  -- =======================================================================

  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Casino scope validation (SEC-001)
  -- Validate claim BEFORE any operations to avoid self-injection tautology.
  -- ═══════════════════════════════════════════════════════════════════════
  v_claim_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_claim_casino_id IS NULL THEN
    v_claim_casino_id := (auth.jwt()->'app_metadata'->>'casino_id')::uuid;
  END IF;

  IF v_claim_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id missing from context/JWT'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_casino_id != v_claim_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH: param %, claim %', p_casino_id, v_claim_casino_id
      USING ERRCODE = 'P0001';
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
  -- BUSINESS LOGIC: Fetch rating slip and validate
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT rs.*, v.player_id
  INTO v_slip
  FROM public.rating_slip rs
  JOIN public.visit v ON v.id = rs.visit_id
  WHERE rs.id = p_rating_slip_id AND rs.casino_id = p_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  IF v_slip.status != 'closed' THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_CLOSED: Base accrual requires status=closed (current: %)', v_slip.status;
  END IF;

  -- Extract player_id from the joined result
  v_player_id := v_slip.player_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ADR-014: Skip accrual for compliance_only slips (ghost gaming)
  -- Return zero points instead of failing - this is the correct behavior
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_slip.accrual_kind = 'compliance_only' THEN
    SELECT current_balance INTO v_balance_after
    FROM public.player_loyalty
    WHERE player_id = v_player_id
      AND casino_id = p_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLAYER_LOYALTY_MISSING: player_id=%, casino_id=%. Enrollment did not provision loyalty account.',
        v_player_id, p_casino_id
        USING ERRCODE = 'P0001';
    END IF;

    -- No-op for compliance-only slips: return current balance without creating ledger entry
    RETURN QUERY SELECT
      NULL::uuid,     -- no ledger_id
      0::int,         -- zero points
      0::numeric,     -- zero theo
      v_balance_after, -- balance unchanged
      false;          -- not an existing entry, just skipped
    RETURN;
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
  -- Uses hardened calculate_theo_from_snapshot with NULLIF pattern
  -- ═══════════════════════════════════════════════════════════════════════
  v_theo := public.calculate_theo_from_snapshot(v_slip, v_loyalty_snapshot);

  -- HARDENED: Apply NULLIF pattern to points_conversion_rate extraction
  v_base_points := ROUND(v_theo * COALESCE(
    NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric,
    10.0
  ))::int;

  IF v_base_points < 0 THEN
    v_base_points := 0;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INSERT LEDGER ENTRY (RLS enforced: casino_id + role check)
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.loyalty_ledger (
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
    v_player_id,
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
        'conversion_rate', COALESCE(NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric, 10.0),
        'avg_bet', COALESCE(NULLIF(v_loyalty_snapshot->>'avg_bet', '')::numeric, v_slip.average_bet),
        'house_edge', COALESCE(NULLIF(v_loyalty_snapshot->>'house_edge', '')::numeric, 1.5),
        'duration_seconds', v_slip.duration_seconds,
        'decisions_per_hour', COALESCE(NULLIF(v_loyalty_snapshot->>'decisions_per_hour', '')::numeric, 70)
      ),
      'policy', jsonb_build_object(
        'snapshot_ref', 'rating_slip.policy_snapshot.loyalty',
        'version', v_loyalty_snapshot->>'policy_version'
      )
    )
  )
  ON CONFLICT (casino_id, rating_slip_id)
  WHERE reason = 'base_accrual'
  DO NOTHING
  RETURNING id INTO ledger_id;

  IF NOT FOUND THEN
    SELECT * INTO v_existing_entry
    FROM public.loyalty_ledger
    WHERE casino_id = p_casino_id
      AND rating_slip_id = p_rating_slip_id
      AND reason = 'base_accrual';

    SELECT current_balance INTO v_balance_after
    FROM public.player_loyalty
    WHERE player_id = v_existing_entry.player_id AND casino_id = p_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLAYER_LOYALTY_MISSING: player_id=%, casino_id=%. Enrollment did not provision loyalty account.',
        v_existing_entry.player_id, p_casino_id
        USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY SELECT
      v_existing_entry.id,
      v_existing_entry.points_delta,
      (v_existing_entry.metadata->'calc'->>'theo')::numeric,
      v_balance_after,
      true;
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- UPDATE PLAYER BALANCE (ISSUE-B5894ED8: NO LAZY-CREATE)
  -- ═══════════════════════════════════════════════════════════════════════
  -- Pattern: UPDATE first, then check FOUND (no TOCTOU race)
  -- If player_loyalty doesn't exist, enrollment invariant is broken -> hard fail
  -- ═══════════════════════════════════════════════════════════════════════
  UPDATE public.player_loyalty
  SET current_balance = current_balance + v_base_points,
      updated_at = now()
  WHERE player_id = v_player_id
    AND casino_id = p_casino_id
  RETURNING current_balance INTO v_balance_after;

  IF NOT FOUND THEN
    -- Enrollment invariant broken: player_loyalty should exist from rpc_create_player
    RAISE EXCEPTION 'PLAYER_LOYALTY_MISSING: player_id=%, casino_id=%. Enrollment did not provision loyalty account.',
      v_player_id, p_casino_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT ledger_id, v_base_points, v_theo, v_balance_after, false;
END;
$$;

COMMENT ON FUNCTION rpc_accrue_on_close IS
  'Base accrual RPC: Mints points on rating slip close using deterministic theo calculation from policy_snapshot.loyalty. '
  'SECURITY INVOKER with role gate (pit_boss, admin). Idempotent via business uniqueness (one per slip). '
  'ADR-014: Skips accrual for compliance_only slips (ghost gaming). '
  'ADR-024: Uses set_rls_context_from_staff() for secure context injection. '
  'ISSUE-B5894ED8: REMOVED lazy-create; hard-fails if player_loyalty missing (enrollment invariant).';

-- ============================================================================
-- RPC 2: rpc_redeem
-- ============================================================================
-- Source: 20251221173703_prd015_ws2_loyalty_rpcs_self_injection.sql
-- Change: Replace vulnerable self-injection with set_rls_context_from_staff()
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_redeem(
  p_casino_id uuid,
  p_player_id uuid,
  p_points int,
  p_issued_by_staff_id uuid,
  p_note text,
  p_idempotency_key uuid,
  p_allow_overdraw boolean DEFAULT false,
  p_reward_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL
)
RETURNS TABLE (
  ledger_id uuid,
  points_delta int,
  balance_before int,
  balance_after int,
  overdraw_applied boolean,
  is_existing boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
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

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not set';
  END IF;

  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH: Caller casino % != context %', p_casino_id, v_context_casino_id;
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
  WHERE casino_id = p_casino_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    -- Return existing entry (idempotent hit)
    SELECT current_balance INTO v_balance_after
    FROM player_loyalty
    WHERE player_id = p_player_id AND casino_id = p_casino_id;

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
  WHERE player_id = p_player_id AND casino_id = p_casino_id
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
    p_casino_id,
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
  WHERE player_id = p_player_id AND casino_id = p_casino_id;

  RETURN QUERY SELECT ledger_id, -1 * p_points, v_balance_before, v_balance_after, v_overdraw_applied, false;
END;
$$;

COMMENT ON FUNCTION rpc_redeem IS
  'Redemption RPC: Comp issuance with overdraw support. SECURITY INVOKER with role gate (pit_boss, cashier, admin). '
  'Overdraw requires pit_boss/admin. Row-locking prevents race conditions. '
  'ADR-024: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- RPC 3: rpc_manual_credit
-- ============================================================================
-- Source: 20251221173703_prd015_ws2_loyalty_rpcs_self_injection.sql
-- Change: Replace vulnerable self-injection with set_rls_context_from_staff()
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_manual_credit(
  p_casino_id uuid,
  p_player_id uuid,
  p_points int,
  p_awarded_by_staff_id uuid,
  p_note text,
  p_idempotency_key uuid
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

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not set';
  END IF;

  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH: Caller casino % != context %', p_casino_id, v_context_casino_id;
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
  WHERE casino_id = p_casino_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    -- Return existing entry (idempotent hit)
    SELECT current_balance INTO v_balance_after
    FROM player_loyalty
    WHERE player_id = p_player_id AND casino_id = p_casino_id;

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
    p_casino_id,
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
    WHERE player_id = p_player_id AND casino_id = p_casino_id
  ) INTO v_player_loyalty_exists;

  IF v_player_loyalty_exists THEN
    UPDATE player_loyalty
    SET current_balance = current_balance + p_points,
        updated_at = now()
    WHERE player_id = p_player_id
      AND casino_id = p_casino_id
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
      p_casino_id,
      p_points,
      NULL,
      '{}',
      now()
    )
    RETURNING current_balance INTO v_balance_after;
  END IF;

  RETURN QUERY SELECT ledger_id, p_points, v_balance_after, false;
END;
$$;

COMMENT ON FUNCTION rpc_manual_credit IS
  'Manual credit RPC: Service recovery credits. SECURITY INVOKER with role gate (pit_boss, admin only - cashier excluded). '
  'Requires mandatory note for audit trail. '
  'ADR-024: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- RPC 4: rpc_apply_promotion
-- ============================================================================
-- Source: 20251221173703_prd015_ws2_loyalty_rpcs_self_injection.sql
-- Change: Replace vulnerable self-injection with set_rls_context_from_staff()
-- ============================================================================

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
  v_player_loyalty_exists boolean;
  v_balance_after int;
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

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not set';
  END IF;

  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH: Caller casino % != context %', p_casino_id, v_context_casino_id;
  END IF;

  v_caller_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt()->'app_metadata'->>'staff_role')
  );

  IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % cannot apply promotions', v_caller_role;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- VALIDATION: Rating slip exists
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
  -- IDEMPOTENCY: Check for existing entry (business uniqueness by campaign)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO v_existing_entry
  FROM loyalty_ledger
  WHERE casino_id = p_casino_id
    AND rating_slip_id = p_rating_slip_id
    AND campaign_id = p_campaign_id
    AND reason = 'promotion';

  IF FOUND THEN
    -- Return existing entry (one promotion per campaign per slip)
    SELECT current_balance INTO v_balance_after
    FROM player_loyalty
    WHERE player_id = v_slip.player_id AND casino_id = p_casino_id;

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
    rating_slip_id,
    visit_id,
    points_delta,
    reason,
    idempotency_key,
    campaign_id,
    source_kind,
    source_id,
    metadata
  ) VALUES (
    p_casino_id,
    v_slip.player_id,
    p_rating_slip_id,
    v_slip.visit_id,
    p_bonus_points,
    'promotion',
    p_idempotency_key,
    p_campaign_id,
    'campaign',
    NULL,
    jsonb_build_object(
      'promotion', jsonb_build_object(
        'campaign_id', p_campaign_id,
        'multiplier', p_promo_multiplier,
        'bonus_points', p_bonus_points
      )
    )
  )
  RETURNING id INTO ledger_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- UPDATE PLAYER BALANCE (upsert pattern)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT EXISTS(
    SELECT 1 FROM player_loyalty
    WHERE player_id = v_slip.player_id AND casino_id = p_casino_id
  ) INTO v_player_loyalty_exists;

  IF v_player_loyalty_exists THEN
    UPDATE player_loyalty
    SET current_balance = current_balance + p_bonus_points,
        updated_at = now()
    WHERE player_id = v_slip.player_id
      AND casino_id = p_casino_id
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
      v_slip.player_id,
      p_casino_id,
      p_bonus_points,
      NULL,
      '{}',
      now()
    )
    RETURNING current_balance INTO v_balance_after;
  END IF;

  RETURN QUERY SELECT ledger_id, p_bonus_points, v_balance_after, false;
END;
$$;

COMMENT ON FUNCTION rpc_apply_promotion IS
  'Promotion RPC: Apply campaign-based bonus points. SECURITY INVOKER with role gate (pit_boss, admin). '
  'Business uniqueness: one campaign per slip. ADR-014 compliant - rejects ghost visits. '
  'ADR-024: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- RPC 5: rpc_reconcile_loyalty_balance
-- ============================================================================
-- Source: 20251221173703_prd015_ws2_loyalty_rpcs_self_injection.sql
-- Change: Replace vulnerable self-injection with set_rls_context_from_staff()
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_reconcile_loyalty_balance(
  p_player_id uuid,
  p_casino_id uuid
)
RETURNS TABLE (
  old_balance int,
  new_balance int,
  drift_detected boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_context_casino_id uuid;
  v_caller_role text;
  v_old_balance int;
  v_new_balance int;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();
  -- =======================================================================

  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Casino scope + role validation (admin-only)
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt()->'app_metadata'->>'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not set';
  END IF;

  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH: Caller casino % != context %', p_casino_id, v_context_casino_id;
  END IF;

  v_caller_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt()->'app_metadata'->>'staff_role')
  );

  IF v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: Only admin can reconcile balances (current role: %)', v_caller_role;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- LOCK PLAYER LOYALTY ROW
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT current_balance INTO v_old_balance
  FROM player_loyalty
  WHERE player_id = p_player_id
    AND casino_id = p_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_PLAYER_NOT_FOUND: Player % has no loyalty record', p_player_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- COMPUTE CORRECT BALANCE FROM LEDGER
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT COALESCE(SUM(points_delta), 0) INTO v_new_balance
  FROM loyalty_ledger
  WHERE player_id = p_player_id
    AND casino_id = p_casino_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- UPDATE IF DRIFT DETECTED
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_old_balance != v_new_balance THEN
    UPDATE player_loyalty
    SET current_balance = v_new_balance,
        updated_at = now()
    WHERE player_id = p_player_id
      AND casino_id = p_casino_id;

    RETURN QUERY SELECT v_old_balance, v_new_balance, true;
  ELSE
    RETURN QUERY SELECT v_old_balance, v_new_balance, false;
  END IF;
END;
$$;

COMMENT ON FUNCTION rpc_reconcile_loyalty_balance IS
  'Admin-only RPC: Forces balance recalculation from ledger sum. Used for drift detection recovery and QA smoke tests. '
  'ADR-024: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- RPC 6: rpc_get_player_ledger
-- ============================================================================
-- Source: 20251221173703_prd015_ws2_loyalty_rpcs_self_injection.sql
-- Change: Replace vulnerable self-injection with set_rls_context_from_staff()
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_get_player_ledger(
  p_casino_id uuid,
  p_player_id uuid,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  casino_id uuid,
  player_id uuid,
  rating_slip_id uuid,
  visit_id uuid,
  staff_id uuid,
  points_delta int,
  reason loyalty_reason,
  idempotency_key uuid,
  campaign_id text,
  source_kind text,
  source_id uuid,
  note text,
  metadata jsonb,
  created_at timestamptz,
  has_more boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_fetch_limit int;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();
  -- =======================================================================

  -- Validate and cap limit
  IF p_limit <= 0 OR p_limit > 100 THEN
    p_limit := 20;
  END IF;

  v_fetch_limit := p_limit + 1; -- Fetch +1 to detect hasMore

  RETURN QUERY
  WITH fetched_rows AS (
    SELECT
      ll.id,
      ll.casino_id,
      ll.player_id,
      ll.rating_slip_id,
      ll.visit_id,
      ll.staff_id,
      ll.points_delta,
      ll.reason,
      ll.idempotency_key,
      ll.campaign_id,
      ll.source_kind,
      ll.source_id,
      ll.note,
      ll.metadata,
      ll.created_at,
      row_number() OVER () as rn
    FROM loyalty_ledger ll
    WHERE ll.casino_id = p_casino_id
      AND ll.player_id = p_player_id
      AND (
        p_cursor_created_at IS NULL  -- First page
        OR (
          ll.created_at < p_cursor_created_at
          OR (ll.created_at = p_cursor_created_at AND ll.id > p_cursor_id)
        )
      )
    ORDER BY ll.created_at DESC, ll.id ASC
    LIMIT v_fetch_limit
  )
  SELECT
    fr.id,
    fr.casino_id,
    fr.player_id,
    fr.rating_slip_id,
    fr.visit_id,
    fr.staff_id,
    fr.points_delta,
    fr.reason,
    fr.idempotency_key,
    fr.campaign_id,
    fr.source_kind,
    fr.source_id,
    fr.note,
    fr.metadata,
    fr.created_at,
    fr.rn > p_limit AS has_more
  FROM fetched_rows fr
  WHERE fr.rn <= p_limit; -- Return only requested limit
END;
$$;

COMMENT ON FUNCTION rpc_get_player_ledger IS
  'Paginated ledger retrieval: Keyset pagination with (created_at DESC, id ASC) ordering. RLS enforced on SELECT. Returns has_more flag for client pagination. '
  'ADR-024: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- RPC 7: rpc_issue_mid_session_reward
-- ============================================================================
-- Source: 20251221173703_prd015_ws2_loyalty_rpcs_self_injection.sql
-- Change: Replace vulnerable self-injection with set_rls_context_from_staff()
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_issue_mid_session_reward(
  p_casino_id uuid,
  p_player_id uuid,
  p_rating_slip_id uuid,
  p_staff_id uuid,
  p_points int,
  p_idempotency_key text DEFAULT NULL,
  p_reason loyalty_reason DEFAULT 'manual_reward'
) RETURNS TABLE (ledger_id uuid, balance_after int)
LANGUAGE plpgsql
AS $$
DECLARE
  v_ledger_id uuid;
  v_balance_after int;
  v_now timestamptz := now();
  v_context_casino_id uuid;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();
  -- =======================================================================

  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-006)
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;
  -- ═══════════════════════════════════════════════════════════════════════

  IF p_points <= 0 THEN
    RAISE EXCEPTION 'Points must be positive';
  END IF;

  -- Verify rating slip eligibility (derives player_id from visit)
  PERFORM 1
    FROM rating_slip rs
    JOIN visit v ON v.id = rs.visit_id
   WHERE rs.id = p_rating_slip_id
     AND v.player_id = p_player_id
     AND rs.casino_id = p_casino_id
     AND rs.status IN ('open','paused');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rating slip not eligible for mid-session reward';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
        FROM loyalty_ledger
       WHERE idempotency_key = p_idempotency_key
         AND casino_id = p_casino_id
    ) THEN
      RETURN QUERY
        SELECT ll.id,
               (
                 SELECT current_balance
                   FROM player_loyalty
                  WHERE player_id = p_player_id
                    AND casino_id = p_casino_id
               )
          FROM loyalty_ledger ll
         WHERE ll.idempotency_key = p_idempotency_key
           AND ll.casino_id = p_casino_id;
      RETURN;
    END IF;
  END IF;

  -- Insert ledger entry
  INSERT INTO loyalty_ledger (
    casino_id,
    player_id,
    rating_slip_id,
    staff_id,
    points_delta,
    reason,
    idempotency_key,
    created_at
  )
  VALUES (
    p_casino_id,
    p_player_id,
    p_rating_slip_id,
    p_staff_id,
    p_points,
    COALESCE(p_reason, 'manual_reward'),
    p_idempotency_key,
    v_now
  )
  RETURNING id INTO v_ledger_id;

  -- Update or insert player_loyalty balance
  INSERT INTO player_loyalty (player_id, casino_id, current_balance, updated_at)
  VALUES (p_player_id, p_casino_id, p_points, v_now)
  ON CONFLICT (player_id, casino_id)
  DO UPDATE SET
    current_balance = player_loyalty.current_balance + p_points,
    updated_at = v_now
  RETURNING current_balance INTO v_balance_after;

  RETURN QUERY SELECT v_ledger_id, v_balance_after;
END;
$$;

COMMENT ON FUNCTION rpc_issue_mid_session_reward IS
  'Issues mid-session loyalty points. SEC-006 hardened with Template 5 context validation. '
  'ADR-024: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

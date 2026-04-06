-- ============================================================================
-- Migration: PRD-061 Cadence Enforcement Schema Amendments
-- Created: 2026-04-06
-- PRD Reference: docs/10-prd/PRD-061-rewards-eligibility-cadence-enforcement-v0.md
-- Purpose: Schema prerequisites for cadence enforcement:
--   M1: Add reward_catalog_id FK to promo_coupon (entitlement counting)
--   M2: Thread reward_catalog_id through rpc_issue_promo_coupon
--   M3: Unique constraint on reward_limits(reward_id, scope)
--   M4: Partial indexes for cadence counting performance
--   M5: Tighten reward_limits write RLS to admin-only (was pit_boss+admin)
-- ============================================================================

BEGIN;

-- ============================================================================
-- M1: Add reward_catalog_id to promo_coupon for entitlement cadence counting
-- ============================================================================
-- Without this column, entitlement counting must fall back to promo_program_id
-- as a proxy — imprecise if multiple rewards share a program.
-- See PRD-061 §5.3 Canonical Enforcement Model, Entitlement family.

ALTER TABLE public.promo_coupon
  ADD COLUMN IF NOT EXISTS reward_catalog_id uuid NULL
    REFERENCES public.reward_catalog(id);

CREATE INDEX IF NOT EXISTS idx_promo_coupon_reward_catalog_id
  ON public.promo_coupon (reward_catalog_id)
  WHERE reward_catalog_id IS NOT NULL;

COMMENT ON COLUMN public.promo_coupon.reward_catalog_id IS
  'PRD-061: Links coupon to reward catalog item for cadence counting. '
  'NULL for coupons issued before PRD-061 or without catalog context.';

-- ============================================================================
-- M2: Update rpc_issue_promo_coupon to accept and store reward_catalog_id
-- ============================================================================
-- Adds p_reward_catalog_id uuid DEFAULT NULL parameter.
-- PostgREST-safe: single function with DEFAULT param, no overload.
-- Preserves existing behavior: callers that don't pass the param get NULL.
-- MUST drop old signature first to avoid PostgreSQL function overloading.

DROP FUNCTION IF EXISTS public.rpc_issue_promo_coupon(uuid, text, text, uuid, uuid, timestamptz, uuid);

CREATE OR REPLACE FUNCTION public.rpc_issue_promo_coupon(
  p_promo_program_id uuid,
  p_validation_number text,
  p_idempotency_key text,
  p_player_id uuid DEFAULT NULL,
  p_visit_id uuid DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL,
  p_reward_catalog_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_caller_role text;
  v_program public.promo_program%ROWTYPE;
  v_coupon public.promo_coupon%ROWTYPE;
  v_existing_coupon public.promo_coupon%ROWTYPE;
  v_allow_anonymous boolean;
BEGIN
  -- ADR-024: Authoritative context injection (first statement)
  PERFORM public.set_rls_context_from_staff(p_correlation_id::text);

  -- Extract validated context
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  IF v_casino_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: context not established'
      USING ERRCODE = 'P0001';
  END IF;

  -- PRD-052 WS1: Role gate — only pit_boss and admin may issue promo coupons.
  v_caller_role := NULLIF(current_setting('app.staff_role', true), '');
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % cannot issue promo coupons', COALESCE(v_caller_role, 'unknown')
      USING ERRCODE = 'P0001';
  END IF;

  -- Check idempotency first
  SELECT * INTO v_existing_coupon
  FROM public.promo_coupon
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
  FROM public.promo_program
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
    FROM public.casino_settings cs
    WHERE cs.casino_id = v_casino_id;

    IF NOT v_allow_anonymous THEN
      RAISE EXCEPTION 'ANONYMOUS_ISSUANCE_DISABLED: casino requires player for promo issuance'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Validate player belongs to casino if provided
  IF p_player_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.player_casino
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
      SELECT 1 FROM public.visit
      WHERE id = p_visit_id
        AND casino_id = v_casino_id
    ) THEN
      RAISE EXCEPTION 'VISIT_NOT_FOUND: visit does not exist at this casino'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Issue the coupon (PRD-061: now includes reward_catalog_id)
  INSERT INTO public.promo_coupon (
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
    correlation_id,
    reward_catalog_id
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
    p_correlation_id,
    p_reward_catalog_id
  ) RETURNING * INTO v_coupon;

  -- Emit to loyalty_outbox
  INSERT INTO public.loyalty_outbox (
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
      'correlation_id', p_correlation_id,
      'reward_catalog_id', p_reward_catalog_id
    ),
    now()
  );

  -- Audit log
  INSERT INTO public.audit_log (
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
      'face_value', v_coupon.face_value_amount,
      'reward_catalog_id', p_reward_catalog_id
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

COMMENT ON FUNCTION public.rpc_issue_promo_coupon IS
  'PRD-LOYALTY-PROMO: Issue a promotional coupon. ADR-024 compliant: uses set_rls_context_from_staff(). '
  'Idempotent via p_idempotency_key. Returns is_existing=true for duplicate requests. '
  'PRD-061: Added p_reward_catalog_id for cadence counting linkage.';

-- ============================================================================
-- M3: Unique constraint on reward_limits (one rule per scope per reward)
-- ============================================================================
-- PRD-061 §5.4: A reward MUST NOT have two rows with the same scope.

ALTER TABLE public.reward_limits
  ADD CONSTRAINT uq_reward_limits_reward_scope UNIQUE (reward_id, scope);

-- ============================================================================
-- M4: Partial indexes for cadence counting performance
-- ============================================================================
-- PRD-061 §5.2 NFR-1: counting queries must hit indexed columns.

-- Points comp counting: loyalty_ledger WHERE reason='redeem' AND source_kind='reward'
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_cadence_count
  ON public.loyalty_ledger (player_id, source_id, created_at DESC)
  WHERE reason = 'redeem' AND source_kind = 'reward';

-- Entitlement counting: promo_coupon WHERE status != 'voided'
CREATE INDEX IF NOT EXISTS idx_promo_coupon_cadence_count
  ON public.promo_coupon (player_id, reward_catalog_id, issued_at DESC)
  WHERE status != 'voided';

-- ============================================================================
-- M5: Tighten reward_limits write RLS to admin-only
-- ============================================================================
-- PRD-061 §5.2 NFR-2: admin-only write access. Pit bosses can READ but not write.
-- Current policies allow pit_boss+admin for INSERT/UPDATE/DELETE — tighten to admin-only.
-- SELECT policy unchanged (admin + pit_boss + any authenticated staff).

-- INSERT: admin-only
DROP POLICY IF EXISTS reward_limits_insert ON public.reward_limits;
CREATE POLICY reward_limits_insert ON public.reward_limits
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) = 'admin'
  );

-- UPDATE: admin-only
DROP POLICY IF EXISTS reward_limits_update ON public.reward_limits;
CREATE POLICY reward_limits_update ON public.reward_limits
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) = 'admin'
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) = 'admin'
  );

-- DELETE: admin-only
DROP POLICY IF EXISTS reward_limits_delete ON public.reward_limits;
CREATE POLICY reward_limits_delete ON public.reward_limits
  FOR DELETE USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) = 'admin'
  );

COMMENT ON POLICY reward_limits_insert ON public.reward_limits IS
  'PRD-061: Admin-only INSERT. Pit bosses see limits but cannot create/modify them.';
COMMENT ON POLICY reward_limits_update ON public.reward_limits IS
  'PRD-061: Admin-only UPDATE. Pit bosses see limits but cannot create/modify them.';
COMMENT ON POLICY reward_limits_delete ON public.reward_limits IS
  'PRD-061: Admin-only DELETE. Pit bosses see limits but cannot create/modify them.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

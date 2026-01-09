-- =====================================================
-- Migration: LoyaltyService Promo Instruments Extension
-- Created: 2026-01-06 23:56:11
-- PRD: PRD-LOYALTY-PROMO
-- EXEC-SPEC: docs/20-architecture/specs/PRD-LOYALTY-PROMO/EXECUTION-SPEC-LOYALTY-PROMO.md
-- Purpose: Create promo_program, promo_coupon tables with RLS and RPCs
-- =====================================================
-- This migration creates:
--   1. Enums: promo_type_enum, promo_coupon_status
--   2. Tables: promo_program, promo_coupon
--   3. RPCs: rpc_issue_promo_coupon, rpc_void_promo_coupon, rpc_replace_promo_coupon, rpc_promo_coupon_inventory
--   4. RLS policies for casino-scoped access (ADR-015 Pattern C)
--   5. Indexes for performance
--
-- SRM Ownership: LoyaltyService
-- ADR-024 Compliance: All SECURITY DEFINER RPCs use set_rls_context_from_staff()
-- =====================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create Enums
-- ============================================================================

-- Promo type enum (extensible for future promo types)
CREATE TYPE public.promo_type_enum AS ENUM ('match_play');

COMMENT ON TYPE public.promo_type_enum IS
  'PRD-LOYALTY-PROMO: Promotional instrument types. match_play = player matches wager to redeem coupon face value.';

-- Promo coupon status enum
CREATE TYPE public.promo_coupon_status AS ENUM (
  'issued',    -- Coupon is active and can be used
  'voided',    -- Coupon was cancelled before use
  'replaced',  -- Coupon was exchanged for a new one
  'expired',   -- Coupon passed its expiration date
  'cleared'    -- Coupon was successfully redeemed (post-v0)
);

COMMENT ON TYPE public.promo_coupon_status IS
  'PRD-LOYALTY-PROMO: Coupon lifecycle states. cleared is post-v0 for redemption tracking.';

-- ============================================================================
-- STEP 2: Create promo_program Table
-- ============================================================================

CREATE TABLE public.promo_program (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  name text NOT NULL,
  promo_type promo_type_enum NOT NULL,
  face_value_amount numeric NOT NULL CHECK (face_value_amount > 0),
  required_match_wager_amount numeric NOT NULL CHECK (required_match_wager_amount > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_staff_id uuid REFERENCES public.staff(id),

  -- Validate date range
  CONSTRAINT promo_program_date_range_check CHECK (
    start_at IS NULL OR end_at IS NULL OR start_at < end_at
  )
);

-- Indexes
CREATE INDEX idx_promo_program_casino_id ON public.promo_program(casino_id);
CREATE INDEX idx_promo_program_casino_status ON public.promo_program(casino_id, status);

COMMENT ON TABLE public.promo_program IS
  'PRD-LOYALTY-PROMO: Defines promotional instrument templates (e.g., $25 Match Play program). LoyaltyService-owned.';

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.trg_promo_program_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER promo_program_updated_at
  BEFORE UPDATE ON public.promo_program
  FOR EACH ROW EXECUTE FUNCTION public.trg_promo_program_updated_at();

-- ============================================================================
-- STEP 3: Create promo_coupon Table
-- ============================================================================

CREATE TABLE public.promo_coupon (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  promo_program_id uuid NOT NULL REFERENCES public.promo_program(id) ON DELETE RESTRICT,
  validation_number text NOT NULL,
  status promo_coupon_status NOT NULL DEFAULT 'issued',
  face_value_amount numeric NOT NULL CHECK (face_value_amount > 0),
  required_match_wager_amount numeric NOT NULL CHECK (required_match_wager_amount > 0),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  voided_at timestamptz,
  replaced_at timestamptz,
  cleared_at timestamptz,
  player_id uuid REFERENCES public.player(id),
  visit_id uuid REFERENCES public.visit(id),
  issued_by_staff_id uuid NOT NULL REFERENCES public.staff(id),
  voided_by_staff_id uuid REFERENCES public.staff(id),
  replaced_by_staff_id uuid REFERENCES public.staff(id),
  replacement_coupon_id uuid REFERENCES public.promo_coupon(id),
  idempotency_key text,
  correlation_id uuid,

  -- Unique validation number per casino
  CONSTRAINT promo_coupon_validation_unique UNIQUE (casino_id, validation_number)
);

-- Indexes for performance
CREATE INDEX idx_promo_coupon_casino_id ON public.promo_coupon(casino_id);
CREATE INDEX idx_promo_coupon_program_id ON public.promo_coupon(promo_program_id);
CREATE INDEX idx_promo_coupon_player_id ON public.promo_coupon(player_id) WHERE player_id IS NOT NULL;
CREATE INDEX idx_promo_coupon_visit_id ON public.promo_coupon(visit_id) WHERE visit_id IS NOT NULL;
CREATE INDEX idx_promo_coupon_status_issued ON public.promo_coupon(casino_id, status, issued_at);
CREATE INDEX idx_promo_coupon_expiry ON public.promo_coupon(expires_at) WHERE status = 'issued';

-- Partial unique index for idempotency
CREATE UNIQUE INDEX idx_promo_coupon_idempotency
  ON public.promo_coupon(casino_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE public.promo_coupon IS
  'PRD-LOYALTY-PROMO: Individual promotional coupon instances issued to players. LoyaltyService-owned.';

-- ============================================================================
-- STEP 4: Enable RLS
-- ============================================================================

ALTER TABLE public.promo_program ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_coupon ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 5: RLS Policies for promo_program (ADR-015 Pattern C)
-- ============================================================================

-- SELECT: Casino staff can view programs
CREATE POLICY promo_program_select_same_casino ON public.promo_program
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- INSERT: Pit boss/admin can create programs
CREATE POLICY promo_program_insert_staff ON public.promo_program
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- UPDATE: Pit boss/admin can update programs
CREATE POLICY promo_program_update_staff ON public.promo_program
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- DELETE denial (programs should be archived, not deleted)
CREATE POLICY promo_program_no_delete ON public.promo_program
  FOR DELETE
  USING (false);

-- ============================================================================
-- STEP 6: RLS Policies for promo_coupon (ADR-015 Pattern C)
-- ============================================================================

-- SELECT: Casino staff can view coupons
CREATE POLICY promo_coupon_select_same_casino ON public.promo_coupon
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- INSERT: Pit boss/admin can issue coupons (via RPC preferred)
CREATE POLICY promo_coupon_insert_staff ON public.promo_coupon
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- UPDATE: Pit boss/admin can update coupons (via RPC preferred)
CREATE POLICY promo_coupon_update_staff ON public.promo_coupon
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- DELETE denial (append-only ledger semantics)
CREATE POLICY promo_coupon_no_delete ON public.promo_coupon
  FOR DELETE
  USING (false);

-- ============================================================================
-- STEP 7: RPC - rpc_issue_promo_coupon (ADR-024 compliant)
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

REVOKE ALL ON FUNCTION public.rpc_issue_promo_coupon FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_issue_promo_coupon TO authenticated;

COMMENT ON FUNCTION public.rpc_issue_promo_coupon IS
  'PRD-LOYALTY-PROMO: Issue a promotional coupon. ADR-024 compliant: uses set_rls_context_from_staff(). '
  'Idempotent via p_idempotency_key. Returns is_existing=true for duplicate requests.';

-- ============================================================================
-- STEP 8: RPC - rpc_void_promo_coupon (ADR-024 compliant)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_void_promo_coupon(
  p_coupon_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_coupon promo_coupon%ROWTYPE;
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

  -- Get and lock the coupon
  SELECT * INTO v_coupon
  FROM promo_coupon
  WHERE id = p_coupon_id
    AND casino_id = v_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COUPON_NOT_FOUND: coupon does not exist or belongs to different casino'
      USING ERRCODE = 'P0001';
  END IF;

  -- Check if already voided (idempotent)
  IF v_coupon.status = 'voided' THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_existing', true,
      'coupon', jsonb_build_object(
        'id', v_coupon.id,
        'validation_number', v_coupon.validation_number,
        'status', v_coupon.status,
        'voided_at', v_coupon.voided_at
      )
    );
  END IF;

  -- Only issued coupons can be voided
  IF v_coupon.status != 'issued' THEN
    RAISE EXCEPTION 'INVALID_COUPON_STATUS: cannot void coupon with status=%', v_coupon.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Void the coupon
  UPDATE promo_coupon
  SET
    status = 'voided',
    voided_at = now(),
    voided_by_staff_id = v_actor_id
  WHERE id = p_coupon_id
  RETURNING * INTO v_coupon;

  -- Emit to loyalty_outbox
  INSERT INTO loyalty_outbox (
    casino_id,
    event_type,
    payload,
    created_at
  ) VALUES (
    v_casino_id,
    'promo_coupon_voided',
    jsonb_build_object(
      'coupon_id', v_coupon.id,
      'validation_number', v_coupon.validation_number,
      'voided_by', v_actor_id,
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
    dto_before,
    dto_after,
    correlation_id
  ) VALUES (
    v_casino_id,
    v_actor_id,
    'loyalty',
    'promo_coupon_voided',
    jsonb_build_object('status', 'issued'),
    jsonb_build_object(
      'coupon_id', v_coupon.id,
      'status', 'voided',
      'voided_at', v_coupon.voided_at
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
      'voided_at', v_coupon.voided_at,
      'voided_by_staff_id', v_coupon.voided_by_staff_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_void_promo_coupon FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_void_promo_coupon TO authenticated;

COMMENT ON FUNCTION public.rpc_void_promo_coupon IS
  'PRD-LOYALTY-PROMO: Void a promotional coupon. ADR-024 compliant. Only issued coupons can be voided.';

-- ============================================================================
-- STEP 9: RPC - rpc_replace_promo_coupon (ADR-024 compliant)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_replace_promo_coupon(
  p_coupon_id uuid,
  p_new_validation_number text,
  p_idempotency_key text,
  p_new_expires_at timestamptz DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_old_coupon promo_coupon%ROWTYPE;
  v_new_coupon promo_coupon%ROWTYPE;
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

  -- Get and lock the old coupon
  SELECT * INTO v_old_coupon
  FROM promo_coupon
  WHERE id = p_coupon_id
    AND casino_id = v_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COUPON_NOT_FOUND: coupon does not exist or belongs to different casino'
      USING ERRCODE = 'P0001';
  END IF;

  -- Check if already replaced (return the replacement coupon)
  IF v_old_coupon.status = 'replaced' AND v_old_coupon.replacement_coupon_id IS NOT NULL THEN
    SELECT * INTO v_new_coupon
    FROM promo_coupon
    WHERE id = v_old_coupon.replacement_coupon_id;

    RETURN jsonb_build_object(
      'success', true,
      'is_existing', true,
      'old_coupon', jsonb_build_object(
        'id', v_old_coupon.id,
        'status', v_old_coupon.status
      ),
      'new_coupon', jsonb_build_object(
        'id', v_new_coupon.id,
        'validation_number', v_new_coupon.validation_number,
        'status', v_new_coupon.status
      )
    );
  END IF;

  -- Only issued coupons can be replaced
  IF v_old_coupon.status != 'issued' THEN
    RAISE EXCEPTION 'INVALID_COUPON_STATUS: cannot replace coupon with status=%', v_old_coupon.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Create new coupon with same program/player/visit
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
    v_old_coupon.promo_program_id,
    p_new_validation_number,
    'issued',
    v_old_coupon.face_value_amount,
    v_old_coupon.required_match_wager_amount,
    now(),
    COALESCE(p_new_expires_at, v_old_coupon.expires_at),
    v_old_coupon.player_id,
    v_old_coupon.visit_id,
    v_actor_id,
    p_idempotency_key,
    p_correlation_id
  ) RETURNING * INTO v_new_coupon;

  -- Mark old coupon as replaced
  UPDATE promo_coupon
  SET
    status = 'replaced',
    replaced_at = now(),
    replaced_by_staff_id = v_actor_id,
    replacement_coupon_id = v_new_coupon.id
  WHERE id = p_coupon_id
  RETURNING * INTO v_old_coupon;

  -- Emit to loyalty_outbox
  INSERT INTO loyalty_outbox (
    casino_id,
    event_type,
    payload,
    created_at
  ) VALUES (
    v_casino_id,
    'promo_coupon_replaced',
    jsonb_build_object(
      'old_coupon_id', v_old_coupon.id,
      'old_validation_number', v_old_coupon.validation_number,
      'new_coupon_id', v_new_coupon.id,
      'new_validation_number', v_new_coupon.validation_number,
      'replaced_by', v_actor_id,
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
    dto_before,
    dto_after,
    correlation_id
  ) VALUES (
    v_casino_id,
    v_actor_id,
    'loyalty',
    'promo_coupon_replaced',
    jsonb_build_object(
      'coupon_id', v_old_coupon.id,
      'validation_number', v_old_coupon.validation_number,
      'status', 'issued'
    ),
    jsonb_build_object(
      'old_coupon_id', v_old_coupon.id,
      'new_coupon_id', v_new_coupon.id,
      'new_validation_number', v_new_coupon.validation_number
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'is_existing', false,
    'old_coupon', jsonb_build_object(
      'id', v_old_coupon.id,
      'validation_number', v_old_coupon.validation_number,
      'status', v_old_coupon.status,
      'replaced_at', v_old_coupon.replaced_at
    ),
    'new_coupon', jsonb_build_object(
      'id', v_new_coupon.id,
      'validation_number', v_new_coupon.validation_number,
      'status', v_new_coupon.status,
      'face_value_amount', v_new_coupon.face_value_amount,
      'issued_at', v_new_coupon.issued_at,
      'expires_at', v_new_coupon.expires_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_replace_promo_coupon FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_replace_promo_coupon TO authenticated;

COMMENT ON FUNCTION public.rpc_replace_promo_coupon IS
  'PRD-LOYALTY-PROMO: Replace a promotional coupon with a new one. ADR-024 compliant. '
  'Creates new coupon with same program/player/visit, marks old as replaced.';

-- ============================================================================
-- STEP 10: RPC - rpc_promo_coupon_inventory (SECURITY INVOKER per ADR-018)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_promo_coupon_inventory(
  p_promo_program_id uuid DEFAULT NULL,
  p_status promo_coupon_status DEFAULT NULL
) RETURNS TABLE (
  status promo_coupon_status,
  coupon_count bigint,
  total_face_value numeric,
  total_match_wager numeric
)
LANGUAGE plpgsql
SECURITY INVOKER  -- Read-only, uses caller's RLS context
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pc.status,
    COUNT(*)::bigint AS coupon_count,
    SUM(pc.face_value_amount) AS total_face_value,
    SUM(pc.required_match_wager_amount) AS total_match_wager
  FROM promo_coupon pc
  WHERE (p_promo_program_id IS NULL OR pc.promo_program_id = p_promo_program_id)
    AND (p_status IS NULL OR pc.status = p_status)
  GROUP BY pc.status
  ORDER BY pc.status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_promo_coupon_inventory TO authenticated;

COMMENT ON FUNCTION public.rpc_promo_coupon_inventory IS
  'PRD-LOYALTY-PROMO: Get coupon inventory summary by status. SECURITY INVOKER per ADR-018 (read-only). '
  'RLS filters results to caller''s casino.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

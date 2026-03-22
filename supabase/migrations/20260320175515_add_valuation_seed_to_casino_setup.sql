-- Migration: PRD-053 WS3b — Onboarding Seed: Valuation Policy in Casino Setup
-- Created: 2026-03-20
-- PRD Reference: docs/10-prd/PRD-053-point-conversion-canonicalization-v0.md
-- EXEC-SPEC: docs/21-exec-spec/EXEC-054-point-conversion-canonicalization.md
-- ADR References: ADR-024 (INV-8), ADR-018 (SECURITY DEFINER)
-- Bounded Context: LoyaltyService (loyalty_valuation_policy)
--
-- Purpose:
--   Extend rpc_complete_casino_setup to INSERT a default loyalty_valuation_policy
--   row (cents_per_point = 2) for the newly setup casino, ensuring future casinos
--   cannot reach comp issuance without an active valuation policy.
--
-- Idempotent: ON CONFLICT DO NOTHING on partial unique index.

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_complete_casino_setup(
  p_skip boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id  uuid;
  v_actor_id   uuid;
  v_staff_role text;
  v_status     text;
  v_at         timestamptz;
  v_by         uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 1: Context injection (ADR-024, ADR-018)
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM public.set_rls_context_from_staff();

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 2: Read derived context from session variables
  -- ═══════════════════════════════════════════════════════════════════════
  v_casino_id  := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 3: Role authorization — admin only
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_staff_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: role not allowed'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 4: Precondition — at least 1 gaming table (unless skip)
  -- ═══════════════════════════════════════════════════════════════════════
  IF NOT p_skip THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.gaming_table
      WHERE casino_id = v_casino_id
    ) THEN
      RAISE EXCEPTION 'PRECONDITION_FAILED: no gaming tables configured for this casino'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 5: Fetch current setup state
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT cs.setup_status, cs.setup_completed_at, cs.setup_completed_by
  INTO v_status, v_at, v_by
  FROM public.casino_settings cs
  WHERE cs.casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: casino_settings row missing for casino %', v_casino_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 6: Idempotent check — already complete
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_status = 'ready' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'casino_id', v_casino_id,
      'setup_status', v_status,
      'setup_completed_at', v_at,
      'setup_completed_by', v_by
    );
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 7: Transition to ready
  -- ═══════════════════════════════════════════════════════════════════════
  UPDATE public.casino_settings
  SET setup_status       = 'ready',
      setup_completed_at = now(),
      setup_completed_by = v_actor_id
  WHERE casino_id = v_casino_id
    AND setup_status != 'ready'
  RETURNING setup_status, setup_completed_at, setup_completed_by
  INTO v_status, v_at, v_by;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 8 (PRD-053): Seed default valuation policy for new casino
  -- Ensures fail-closed valuation lookup succeeds on first comp issuance.
  -- Idempotent via ON CONFLICT DO NOTHING on partial unique index.
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.loyalty_valuation_policy (
    casino_id,
    cents_per_point,
    effective_date,
    version_identifier,
    is_active,
    created_by_staff_id
  ) VALUES (
    v_casino_id,
    2,
    CURRENT_DATE,
    'onboarding-bootstrap',
    true,
    v_actor_id
  )
  ON CONFLICT (casino_id) WHERE (is_active = true) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'casino_id', v_casino_id,
    'setup_status', v_status,
    'setup_completed_at', v_at,
    'setup_completed_by', v_by
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_complete_casino_setup(boolean) IS
  'PRD-030 + PRD-053: Idempotent casino setup completion. SECURITY DEFINER, admin-only. '
  'Derives context from set_rls_context_from_staff() (ADR-024 INV-8). '
  'Seeds default loyalty_valuation_policy (cents_per_point=2) for new casinos.';

-- Grants unchanged
REVOKE ALL ON FUNCTION public.rpc_complete_casino_setup(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_complete_casino_setup(boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

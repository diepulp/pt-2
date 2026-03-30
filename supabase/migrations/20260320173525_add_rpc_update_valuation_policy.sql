-- Migration: PRD-053 WS5a — Admin RPC: rpc_update_valuation_policy
-- Created: 2026-03-20
-- PRD Reference: docs/10-prd/PRD-053-point-conversion-canonicalization-v0.md
-- EXEC-SPEC: docs/21-exec-spec/EXEC-054-point-conversion-canonicalization.md
-- ADR References: ADR-024 (INV-8, no spoofable params), ADR-018 (SECURITY DEFINER),
--                 ADR-015 (SET LOCAL pooler-safe), ADR-030 (session-var enforcement)
-- Bounded Context: LoyaltyService (loyalty_valuation_policy)
--
-- Purpose:
--   SECURITY DEFINER RPC for atomic valuation policy rotation.
--   Deactivates current active row, inserts new row with updated rate.
--   Uses SELECT ... FOR UPDATE to serialize concurrent admin updates.
--
-- ADR-024 INV-8: NO p_casino_id parameter — derived from session vars.
-- Pattern: follows rpc_complete_casino_setup (same guard ordering).

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_update_valuation_policy(
  p_cents_per_point numeric,
  p_effective_date date,
  p_version_identifier text
)
RETURNS loyalty_valuation_policy
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id  uuid;
  v_actor_id   uuid;
  v_staff_role text;
  v_result     public.loyalty_valuation_policy%ROWTYPE;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 1: Context injection (ADR-024, ADR-018)
  -- Derives casino_id, actor_id, staff_role from JWT + staff table
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM public.set_rls_context_from_staff();

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 2: Read derived context from session variables
  -- ═══════════════════════════════════════════════════════════════════════
  v_casino_id  := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 3: Guard — casino context
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 4: Guard — authenticated
  -- ═══════════════════════════════════════════════════════════════════════
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: not authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 5: Guard — admin role only (pit_boss excluded per PRD-053)
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_staff_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 6: Guard — actor context
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: actor context not set'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 7: Guard — input validation
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_cents_per_point <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: cents_per_point must be positive'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 8: Concurrency lock on active row
  -- SELECT ... FOR UPDATE serializes concurrent admin updates per-casino.
  -- If no active row exists, lock is a no-op (INSERT still proceeds).
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM id FROM public.loyalty_valuation_policy
    WHERE casino_id = v_casino_id AND is_active = true
    FOR UPDATE;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 9: Atomic rotation — deactivate current active row
  -- ═══════════════════════════════════════════════════════════════════════
  UPDATE public.loyalty_valuation_policy
  SET is_active = false
  WHERE casino_id = v_casino_id AND is_active = true;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 10: Insert new active row
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
    p_cents_per_point,
    p_effective_date,
    p_version_identifier,
    true,
    v_actor_id
  ) RETURNING * INTO v_result;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 11: Audit log entry
  -- Direct INSERT (SECURITY DEFINER has elevated privileges)
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'loyalty',
    v_actor_id,
    'valuation_policy_updated',
    jsonb_build_object(
      'cents_per_point', p_cents_per_point,
      'effective_date', p_effective_date,
      'version_identifier', p_version_identifier,
      'new_policy_id', v_result.id
    )
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- Comment
-- ============================================================================

COMMENT ON FUNCTION public.rpc_update_valuation_policy(numeric, date, text) IS
  'PRD-053: Atomic valuation policy rotation. SECURITY DEFINER, admin-only. '
  'Derives context from set_rls_context_from_staff() (ADR-024 INV-8). '
  'SELECT FOR UPDATE lock serializes concurrent updates per-casino. '
  'Deactivates current active row, inserts new active row.';

-- ============================================================================
-- Grants
-- ============================================================================

REVOKE ALL ON FUNCTION public.rpc_update_valuation_policy(numeric, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_update_valuation_policy(numeric, date, text) TO authenticated;

-- ============================================================================
-- PostgREST schema reload
-- ============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

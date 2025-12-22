-- =============================================================
-- PRD-017: Visit Loyalty Summary RPC
-- Published contract for LoyaltyService
-- =============================================================

-- Drop existing function if exists (for idempotency)
DROP FUNCTION IF EXISTS rpc_get_visit_loyalty_summary(uuid);

-- Create the loyalty summary RPC
-- SECURITY INVOKER: RLS enforced via caller's context
CREATE OR REPLACE FUNCTION rpc_get_visit_loyalty_summary(
  p_visit_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_points_earned numeric;
  v_visit_exists boolean;
  v_context_staff_role text;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling compatibility
  -- =======================================================================
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')
  );

  PERFORM set_rls_context(
    COALESCE(
      NULLIF(current_setting('app.actor_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
    ),
    COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    ),
    v_context_staff_role
  );
  -- =======================================================================

  -- 1. Check if visit exists (RLS enforced)
  SELECT EXISTS(
    SELECT 1 FROM visit WHERE id = p_visit_id
  ) INTO v_visit_exists;

  IF NOT v_visit_exists THEN
    RETURN NULL;
  END IF;

  -- 2. Sum points from loyalty_ledger for this visit
  -- Only count positive points_delta (accruals, credits, promotions)
  SELECT COALESCE(SUM(
    CASE WHEN points_delta > 0 THEN points_delta ELSE 0 END
  ), 0)
  INTO v_points_earned
  FROM loyalty_ledger
  WHERE visit_id = p_visit_id;

  -- 3. Return summary
  RETURN jsonb_build_object(
    'points_earned', v_points_earned
  );
END;
$$;

-- Add function comment for documentation
COMMENT ON FUNCTION rpc_get_visit_loyalty_summary(uuid) IS
  'PRD-017: Published contract for LoyaltyService. Returns total points earned for a visit. Returns {points_earned: number}. SECURITY INVOKER - RLS enforced.';

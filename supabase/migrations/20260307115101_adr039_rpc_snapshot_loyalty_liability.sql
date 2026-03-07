-- ADR-039 D4: Loyalty liability snapshot RPC
-- Bounded context: LoyaltyService (Reward)
-- SECURITY DEFINER with ADR-024 context derivation (no p_casino_id — INV-8)

CREATE OR REPLACE FUNCTION public.rpc_snapshot_loyalty_liability(
  p_snapshot_date date DEFAULT CURRENT_DATE
)
RETURNS loyalty_liability_snapshot
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_policy loyalty_valuation_policy;
  v_total_points bigint;
  v_player_count integer;
  v_monetary_value_cents bigint;
  v_result loyalty_liability_snapshot;
BEGIN
  -- =========================================================================
  -- ADR-024: Authoritative context derivation
  -- =========================================================================
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- =========================================================================
  -- Role gate: pit_boss or admin only
  -- =========================================================================
  IF v_staff_role IS NULL OR v_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot create loyalty snapshots', v_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;

  -- =========================================================================
  -- Read active valuation policy for casino
  -- =========================================================================
  SELECT * INTO v_policy
  FROM loyalty_valuation_policy
  WHERE casino_id = v_casino_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ACTIVE_VALUATION_POLICY: No active valuation policy for casino %', v_casino_id
      USING ERRCODE = 'P0002';
  END IF;

  -- =========================================================================
  -- Aggregate loyalty balances
  -- =========================================================================
  SELECT
    COALESCE(SUM(current_balance), 0),
    COUNT(*)
  INTO v_total_points, v_player_count
  FROM player_loyalty
  WHERE casino_id = v_casino_id;

  -- Compute estimated monetary value in cents
  v_monetary_value_cents := (v_total_points * v_policy.cents_per_point)::bigint;

  -- =========================================================================
  -- UPSERT: idempotent on (casino_id, snapshot_date)
  -- =========================================================================
  INSERT INTO loyalty_liability_snapshot (
    casino_id,
    snapshot_date,
    total_outstanding_points,
    estimated_monetary_value_cents,
    valuation_policy_version,
    valuation_effective_date,
    player_count
  ) VALUES (
    v_casino_id,
    p_snapshot_date,
    v_total_points,
    v_monetary_value_cents,
    v_policy.version_identifier,
    v_policy.effective_date,
    v_player_count
  )
  ON CONFLICT (casino_id, snapshot_date) DO UPDATE SET
    total_outstanding_points = EXCLUDED.total_outstanding_points,
    estimated_monetary_value_cents = EXCLUDED.estimated_monetary_value_cents,
    valuation_policy_version = EXCLUDED.valuation_policy_version,
    valuation_effective_date = EXCLUDED.valuation_effective_date,
    player_count = EXCLUDED.player_count
  RETURNING * INTO v_result;

  -- =========================================================================
  -- Audit log
  -- =========================================================================
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'loyalty',
    v_actor_id,
    'snapshot_loyalty_liability',
    jsonb_build_object(
      'snapshot_date', p_snapshot_date,
      'total_outstanding_points', v_total_points,
      'estimated_monetary_value_cents', v_monetary_value_cents,
      'valuation_policy_version', v_policy.version_identifier,
      'player_count', v_player_count
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.rpc_snapshot_loyalty_liability(date) IS
  'ADR-039 D4: Daily idempotent loyalty liability snapshot. '
  'SECURITY DEFINER with ADR-024 context derivation. No p_casino_id (INV-8).';

REVOKE ALL ON FUNCTION public.rpc_snapshot_loyalty_liability(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_snapshot_loyalty_liability(date) TO authenticated;

NOTIFY pgrst, 'reload schema';

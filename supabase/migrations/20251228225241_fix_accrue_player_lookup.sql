-- =====================================================
-- Migration: Fix rpc_accrue_on_close player_id lookup
-- Created: 2025-12-28 02:00:01
-- Issue: ISSUE-752833A6
-- Purpose: Fix player_id lookup - get from visit table,
--          not rating_slip (per SRM invariant)
-- =====================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: rpc_accrue_on_close must get player_id from visit, not rating_slip
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_context_staff_role text;
  v_caller_role text;
  v_slip record;
  v_player_id uuid;
  v_loyalty_snapshot jsonb;
  v_theo numeric;
  v_base_points int;
  v_existing_entry record;
  v_balance_after int;
  v_player_loyalty_exists boolean;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling
  -- =======================================================================
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  PERFORM set_rls_context(
    COALESCE(
      NULLIF(current_setting('app.actor_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
    ),
    p_casino_id,
    v_context_staff_role
  );
  -- =======================================================================

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
  SELECT rs.*, v.player_id
  INTO v_slip
  FROM rating_slip rs
  JOIN visit v ON v.id = rs.visit_id
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
    -- No-op for compliance-only slips: return zeros without creating ledger entry
    RETURN QUERY SELECT
      NULL::uuid,     -- no ledger_id
      0::int,         -- zero points
      0::numeric,     -- zero theo
      0::int,         -- balance unchanged (or would need lookup)
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
  v_theo := calculate_theo_from_snapshot(v_slip, v_loyalty_snapshot);

  -- HARDENED: Apply NULLIF pattern to points_conversion_rate extraction
  v_base_points := ROUND(v_theo * COALESCE(
    NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric,
    10.0
  ));

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
  RETURNING id INTO ledger_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- UPDATE PLAYER BALANCE (upsert pattern)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT EXISTS(
    SELECT 1 FROM player_loyalty
    WHERE player_id = v_player_id AND casino_id = p_casino_id
  ) INTO v_player_loyalty_exists;

  IF v_player_loyalty_exists THEN
    UPDATE player_loyalty
    SET current_balance = current_balance + v_base_points,
        updated_at = now()
    WHERE player_id = v_player_id
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
      v_player_id,
      p_casino_id,
      v_base_points,
      NULL,
      '{}',
      now()
    )
    RETURNING current_balance INTO v_balance_after;
  END IF;

  RETURN QUERY SELECT ledger_id, v_base_points, v_theo, v_balance_after, false;
END;
$$;

COMMENT ON FUNCTION rpc_accrue_on_close IS
  'Base accrual RPC: Mints points on rating slip close using deterministic theo calculation from policy_snapshot.loyalty. SECURITY INVOKER with role gate (pit_boss, admin). Idempotent via business uniqueness (one per slip). ADR-014: Skips accrual for compliance_only slips (ghost gaming). ADR-015 Phase 1A: Self-injects RLS context. ISSUE-752833A6: Fixed player_id lookup via visit table join.';

NOTIFY pgrst, 'reload schema';

COMMIT;

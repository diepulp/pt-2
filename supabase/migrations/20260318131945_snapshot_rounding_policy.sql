-- ============================================================================
-- Migration: Snapshot rounding_policy in policy_snapshot.loyalty
-- Created: 2026-03-18
-- Reference: LOYALTY-EARN-CONFIG-WIRING-CONTEXT.md (D3, D4)
-- ADR: ADR-019 D2 (snapshot determinism)
-- ============================================================================
-- Problem: rpc_accrue_on_close() hardcodes ROUND() for float-to-int conversion.
--          Rounding behavior is not captured in policy_snapshot, violating
--          ADR-019 D2 which requires all accrual-affecting values to be frozen
--          at slip creation.
--
-- Fix:
--   1. rpc_start_rating_slip: snapshot 'rounding_policy': 'floor' (hardcoded)
--   2. rpc_accrue_on_close: honor rounding_policy from snapshot
--
-- Baselines:
--   rpc_start_rating_slip: 20260302230020 (5-param, ADR-024)
--   rpc_accrue_on_close:   20260304172336 (2-param, p_casino_id removed per PRD-043)
--
-- Backward compatibility:
--   Old snapshots (v1) lack rounding_policy → COALESCE to 'floor'
--   New snapshots (v2) include rounding_policy = 'floor'
--   Behavioral change: ROUND() → FLOOR() for new slips (at most 0.999 pts/slip)
-- ============================================================================

-- ============================================================================
-- 1. rpc_start_rating_slip — add rounding_policy to snapshot
-- Baseline: 20260302230020_drop_sec007_p0_phantom_overloads.sql
-- Signature: (uuid, uuid, uuid, text, jsonb) — UNCHANGED
-- Change: add 'rounding_policy' to loyalty object + _source, bump to v2
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_start_rating_slip(
  p_casino_id UUID,
  p_visit_id UUID,
  p_table_id UUID,
  p_seat_number TEXT,
  p_game_settings JSONB
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_result rating_slip;
  v_player_id UUID;
  v_visit_kind visit_kind;
  v_accrual_kind text;
  v_policy_snapshot JSONB;
  v_game_settings_lookup RECORD;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative RLS Context Injection
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- =====================================================================
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-007)
  -- =====================================================================
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

  -- Derive actor_id from authoritative context (ADR-024)
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =====================================================================

  -- Validate visit is open and get player_id + visit_kind for processing
  SELECT player_id, visit_kind INTO v_player_id, v_visit_kind
  FROM visit
  WHERE id = p_visit_id
    AND casino_id = p_casino_id
    AND ended_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_OPEN: Visit % is not active', p_visit_id;
  END IF;

  -- =====================================================================
  -- DETERMINE ACCRUAL_KIND (ADR-014 Ghost Gaming Support)
  -- =====================================================================
  v_accrual_kind := CASE
    WHEN v_visit_kind = 'gaming_ghost_unrated' THEN 'compliance_only'
    ELSE 'loyalty'
  END;

  -- Validate table is active
  IF NOT EXISTS (
    SELECT 1 FROM gaming_table
    WHERE id = p_table_id
      AND casino_id = p_casino_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'TABLE_NOT_ACTIVE: Table % is not active', p_table_id;
  END IF;

  -- =====================================================================
  -- BUILD POLICY_SNAPSHOT (ISSUE-752833A6, ADR-019 D2)
  -- game_settings: canonical source for game-specific + earn-rate fields
  -- rounding_policy: hardcoded 'floor' per pilot decision D3
  -- =====================================================================
  SELECT gs.house_edge, gs.decisions_per_hour, gs.points_conversion_rate, gs.point_multiplier
  INTO v_game_settings_lookup
  FROM gaming_table gt
  LEFT JOIN game_settings gs
    ON gs.game_type = gt.type
    AND gs.casino_id = gt.casino_id
  WHERE gt.id = p_table_id
    AND gt.casino_id = p_casino_id;

  v_policy_snapshot := jsonb_build_object(
    'loyalty', jsonb_build_object(
      'house_edge', COALESCE(v_game_settings_lookup.house_edge, 1.5),
      'decisions_per_hour', COALESCE(v_game_settings_lookup.decisions_per_hour, 70),
      'points_conversion_rate', COALESCE(v_game_settings_lookup.points_conversion_rate, 10.0),
      'point_multiplier', COALESCE(v_game_settings_lookup.point_multiplier, 1.0),
      'rounding_policy', 'floor',
      'policy_version', 'loyalty_points_v2'
    ),
    '_source', jsonb_build_object(
      'house_edge', CASE WHEN v_game_settings_lookup.house_edge IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'decisions_per_hour', CASE WHEN v_game_settings_lookup.decisions_per_hour IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'points_conversion_rate', CASE WHEN v_game_settings_lookup.points_conversion_rate IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'point_multiplier', CASE WHEN v_game_settings_lookup.point_multiplier IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'rounding_policy', 'default'
    )
  );
  -- =====================================================================

  -- Create slip with policy_snapshot and accrual_kind
  INSERT INTO rating_slip (
    casino_id, visit_id, table_id,
    seat_number, game_settings, policy_snapshot, accrual_kind, status, start_time
  )
  VALUES (
    p_casino_id, p_visit_id, p_table_id,
    p_seat_number, p_game_settings, v_policy_snapshot, v_accrual_kind, 'open', now()
  )
  RETURNING * INTO v_result;

  -- Audit log: uses v_context_actor_id (authoritative, context-derived)
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating-slip',
    v_context_actor_id,
    'start_rating_slip',
    jsonb_build_object(
      'rating_slip_id', v_result.id,
      'visit_id', p_visit_id,
      'player_id', v_player_id,
      'table_id', p_table_id,
      'visit_kind', v_visit_kind,
      'accrual_kind', v_accrual_kind,
      'policy_snapshot_populated', true,
      'policy_snapshot_source', v_policy_snapshot->'_source',
      'policy_values', v_policy_snapshot->'loyalty'
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_start_rating_slip(UUID, UUID, UUID, TEXT, JSONB) IS
  'ADR-024: set_rls_context_from_staff(). ADR-019 D2: policy_snapshot.loyalty from game_settings. '
  'ADR-014: accrual_kind from visit_kind. SEC-007 P0-7: no p_actor_id param. '
  'v2: adds rounding_policy=floor to snapshot (pilot decision D3).';

-- ============================================================================
-- 2. rpc_accrue_on_close — honor rounding_policy from snapshot
-- Baseline: 20260304172336_prd043_d2_remove_loyalty_p_casino_id.sql
-- Signature: (uuid, uuid) — p_casino_id was removed by PRD-043
-- Change: replace ROUND() with CASE on snapshot rounding_policy
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_accrue_on_close(
  p_rating_slip_id uuid,
  p_idempotency_key uuid
)
RETURNS TABLE(
  ledger_id uuid,
  points_delta integer,
  theo numeric,
  balance_after integer,
  is_existing boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_casino_id uuid;
  v_caller_role text;
  v_slip record;
  v_player_id uuid;
  v_loyalty_snapshot jsonb;
  v_theo numeric;
  v_base_points int;
  v_existing_entry record;
  v_balance_after int;
BEGIN
  -- Derive context from JWT staff claim
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;

  -- Role gate: pit_boss, admin
  v_caller_role := NULLIF(current_setting('app.staff_role', true), '');
  IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % cannot mint base accrual', v_caller_role;
  END IF;

  -- Fetch rating slip scoped to derived casino
  SELECT rs.*, v.player_id
  INTO v_slip
  FROM public.rating_slip rs
  JOIN public.visit v ON v.id = rs.visit_id
  WHERE rs.id = p_rating_slip_id AND rs.casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  IF v_slip.status != 'closed' THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_CLOSED: Base accrual requires status=closed (current: %)', v_slip.status;
  END IF;

  v_player_id := v_slip.player_id;

  -- compliance_only: no points, just return balance
  IF v_slip.accrual_kind = 'compliance_only' THEN
    SELECT current_balance INTO v_balance_after
    FROM public.player_loyalty
    WHERE player_id = v_player_id
      AND casino_id = v_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLAYER_LOYALTY_MISSING: player_id=%, casino_id=%. Enrollment did not provision loyalty account.',
        v_player_id, v_casino_id
        USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY SELECT
      NULL::uuid, 0::int, 0::numeric, v_balance_after, false;
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
  -- Rounding policy read from snapshot (D4); COALESCE to 'floor' for v1 snapshots.
  -- ═══════════════════════════════════════════════════════════════════════
  v_theo := public.calculate_theo_from_snapshot(v_slip, v_loyalty_snapshot);

  v_base_points := (CASE COALESCE(v_loyalty_snapshot->>'rounding_policy', 'floor')
    WHEN 'floor'   THEN FLOOR(v_theo * COALESCE(NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric, 10.0))
    WHEN 'ceil'    THEN CEIL(v_theo * COALESCE(NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric, 10.0))
    WHEN 'nearest' THEN ROUND(v_theo * COALESCE(NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric, 10.0))
    ELSE FLOOR(v_theo * COALESCE(NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric, 10.0))
  END)::int;

  IF v_base_points < 0 THEN
    v_base_points := 0;
  END IF;

  -- Insert ledger entry (idempotent via ON CONFLICT)
  INSERT INTO public.loyalty_ledger (
    casino_id, player_id, rating_slip_id, visit_id,
    points_delta, reason, idempotency_key,
    source_kind, source_id, metadata
  ) VALUES (
    v_casino_id, v_player_id, p_rating_slip_id, v_slip.visit_id,
    v_base_points, 'base_accrual', p_idempotency_key,
    'rating_slip', p_rating_slip_id,
    jsonb_build_object(
      'calc', jsonb_build_object(
        'theo', v_theo,
        'base_points', v_base_points,
        'conversion_rate', COALESCE(NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric, 10.0),
        'rounding_policy', COALESCE(v_loyalty_snapshot->>'rounding_policy', 'floor'),
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

  -- Idempotent: if already existed, return existing entry
  IF NOT FOUND THEN
    SELECT * INTO v_existing_entry
    FROM public.loyalty_ledger
    WHERE casino_id = v_casino_id
      AND rating_slip_id = p_rating_slip_id
      AND reason = 'base_accrual';

    SELECT current_balance INTO v_balance_after
    FROM public.player_loyalty
    WHERE player_id = v_existing_entry.player_id AND casino_id = v_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLAYER_LOYALTY_MISSING: player_id=%, casino_id=%. Enrollment did not provision loyalty account.',
        v_existing_entry.player_id, v_casino_id
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

  -- Update player loyalty balance
  UPDATE public.player_loyalty
  SET current_balance = current_balance + v_base_points,
      updated_at = now()
  WHERE player_id = v_player_id
    AND casino_id = v_casino_id
  RETURNING current_balance INTO v_balance_after;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAYER_LOYALTY_MISSING: player_id=%, casino_id=%. Enrollment did not provision loyalty account.',
      v_player_id, v_casino_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT ledger_id, v_base_points, v_theo, v_balance_after, false;
END;
$function$;

COMMENT ON FUNCTION rpc_accrue_on_close(uuid, uuid) IS
  'Base accrual: deterministic theo from policy_snapshot.loyalty (ADR-019 D2). '
  'ADR-024: set_rls_context_from_staff(). ADR-014: skips compliance_only. '
  'PRD-043: p_casino_id removed, derived from context. '
  'v2: honors rounding_policy from snapshot (pilot decision D4). COALESCE to floor for v1 snapshots.';

NOTIFY pgrst, 'reload schema';

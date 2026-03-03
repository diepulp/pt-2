-- ============================================================================
-- SEC-007 P0 Phantom Overload + Dead Param Cleanup
-- Fixes: P0-4 (rpc_update_table_status phantom), P0-7 (rpc_start_rating_slip dead p_actor_id)
-- Source: SEC-007 Tenant Isolation Enforcement Contract (EXEC-040)
-- ADR: ADR-024
-- ============================================================================
-- P0-4: rpc_update_table_status has a phantom 4-param overload
--        (uuid, uuid, table_status, uuid) from migration 20251221173716 that
--        still calls deprecated set_rls_context(). PostgREST exposes both
--        overloads — the 4-param accepts p_actor_id enabling identity spoofing.
--        The canonical 3-param (uuid, uuid, table_status) from 20251231072655
--        uses set_rls_context_from_staff() correctly.
--        Fix: DROP the 4-param phantom.
--
-- P0-7: rpc_start_rating_slip has p_actor_id UUID DEFAULT NULL as 6th param.
--        Although ignored in body (M-4 fix), PostgREST still accepts it,
--        creating a spoofable surface. Also ambiguous with DEFAULT overload.
--        Fix: DROP 6-param, CREATE 5-param (identical body, no p_actor_id).
-- ============================================================================

-- ============================================================================
-- P0-4: DROP phantom 4-param rpc_update_table_status
-- The canonical 3-param version (ADR-024 compliant) is untouched.
-- ============================================================================
DROP FUNCTION IF EXISTS public.rpc_update_table_status(uuid, uuid, table_status, uuid);

-- ============================================================================
-- P0-7: DROP 6-param rpc_start_rating_slip, CREATE 5-param without p_actor_id
-- ============================================================================
DROP FUNCTION IF EXISTS public.rpc_start_rating_slip(uuid, uuid, uuid, text, jsonb, uuid);

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
  -- BUILD POLICY_SNAPSHOT (ISSUE-752833A6 Fix, ADR-019 D2)
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
      'policy_version', 'loyalty_points_v1'
    ),
    '_source', jsonb_build_object(
      'house_edge', CASE WHEN v_game_settings_lookup.house_edge IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'decisions_per_hour', CASE WHEN v_game_settings_lookup.decisions_per_hour IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'points_conversion_rate', CASE WHEN v_game_settings_lookup.points_conversion_rate IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'point_multiplier', CASE WHEN v_game_settings_lookup.point_multiplier IS NOT NULL THEN 'game_settings' ELSE 'default' END
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
  'ADR-024: Uses set_rls_context_from_staff() for authoritative context injection. '
  'Creates new rating slip for active visit/table. SEC-007 hardened with Template 5 context validation. '
  'ISSUE-752833A6: Populates policy_snapshot.loyalty from game_settings (ADR-019 D2). '
  'ADR-014: Sets accrual_kind based on visit_kind (ghost visits are compliance_only). '
  'SEC-007 P0-7: p_actor_id parameter removed — actor always derived from app.actor_id context.';

-- REVOKE/GRANT for the new 5-param signature
REVOKE ALL ON FUNCTION public.rpc_start_rating_slip(uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_start_rating_slip(uuid, uuid, uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_start_rating_slip(uuid, uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_start_rating_slip(uuid, uuid, uuid, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';

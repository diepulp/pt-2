-- =====================================================
-- Migration: Fix policy_snapshot population in rpc_start_rating_slip
-- Created: 2025-12-27 17:07:49
-- Issue: ISSUE-752833A6
-- Purpose: Populate policy_snapshot.loyalty from game_settings at slip creation
--          per ADR-019 D2 immutability principle
-- Reference: ADR-019, SEC-007
-- =====================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- rpc_start_rating_slip with policy_snapshot population
--
-- CHANGE SUMMARY:
-- 1. Lookup policy values from game_settings table via gaming_table.type
-- 2. Build policy_snapshot.loyalty with all accrual-affecting fields
-- 3. Add _source tracking for audit trail
-- 4. Preserve SEC-007 Template 5 context validation
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rpc_start_rating_slip(
  p_casino_id UUID,
  p_visit_id UUID,
  p_table_id UUID,
  p_seat_number TEXT,
  p_game_settings JSONB,
  p_actor_id UUID
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_result rating_slip;
  v_player_id UUID;
  v_policy_snapshot JSONB;
  v_game_settings_lookup RECORD;
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
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-007)
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

  -- Validate visit is open and get player_id for audit
  SELECT player_id INTO v_player_id
  FROM visit
  WHERE id = p_visit_id
    AND casino_id = p_casino_id
    AND ended_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_OPEN: Visit % is not active', p_visit_id;
  END IF;

  -- Validate table is active
  IF NOT EXISTS (
    SELECT 1 FROM gaming_table
    WHERE id = p_table_id
      AND casino_id = p_casino_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'TABLE_NOT_ACTIVE: Table % is not active', p_table_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- BUILD POLICY_SNAPSHOT (ISSUE-752833A6 Fix, ADR-019 D2)
  -- ═══════════════════════════════════════════════════════════════════════
  -- TABLE-AUTHORITATIVE: game_settings table is canonical source
  -- p_game_settings is for runtime state (average_bet), NOT policy values
  -- Priority: 1) game_settings table, 2) hardcoded defaults
  --
  -- Join Path (verified from baseline_srm.sql):
  --   gaming_table.type -> game_settings.game_type (both game_type enum)
  --   Both tables share casino_id
  -- ═══════════════════════════════════════════════════════════════════════

  -- Lookup from game_settings table via gaming_table.type (AUTHORITATIVE)
  SELECT gs.house_edge, gs.decisions_per_hour, gs.points_conversion_rate, gs.point_multiplier
  INTO v_game_settings_lookup
  FROM gaming_table gt
  LEFT JOIN game_settings gs
    ON gs.game_type = gt.type
    AND gs.casino_id = gt.casino_id
  WHERE gt.id = p_table_id
    AND gt.casino_id = p_casino_id;

  -- Build snapshot from canonical sources only (NO p_game_settings for policy)
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
  -- ═══════════════════════════════════════════════════════════════════════

  -- Create slip with policy_snapshot (ISSUE-752833A6 fix)
  INSERT INTO rating_slip (
    casino_id, visit_id, table_id,
    seat_number, game_settings, policy_snapshot, status, start_time
  )
  VALUES (
    p_casino_id, p_visit_id, p_table_id,
    p_seat_number, p_game_settings, v_policy_snapshot, 'open', now()
  )
  RETURNING * INTO v_result;

  -- Audit log with policy source tracking (debugging: "where did these values come from?")
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating-slip',
    p_actor_id,
    'start_rating_slip',
    jsonb_build_object(
      'rating_slip_id', v_result.id,
      'visit_id', p_visit_id,
      'player_id', v_player_id,
      'table_id', p_table_id,
      'policy_snapshot_populated', true,
      'policy_snapshot_source', v_policy_snapshot->'_source',
      'policy_values', v_policy_snapshot->'loyalty'
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_start_rating_slip(UUID, UUID, UUID, TEXT, JSONB, UUID) IS
  'Creates new rating slip for active visit/table. SEC-007 hardened with Template 5 context validation. ADR-015 Phase 1A: Self-injects RLS context for connection pooling. ISSUE-752833A6: Now populates policy_snapshot.loyalty from game_settings for ADR-019 D2 compliance.';

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFY POSTGREST TO RELOAD SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (Run manually after migration)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Test that new slips get policy_snapshot:
-- SELECT
--   id,
--   policy_snapshot->'loyalty' IS NOT NULL AS has_loyalty_snapshot,
--   policy_snapshot->'loyalty'->>'policy_version' AS version,
--   policy_snapshot->'_source' AS source_tracking
-- FROM rating_slip
-- WHERE created_at > now() - interval '1 hour';
--
-- Verify game_settings join path works:
-- SELECT gt.id AS table_id, gt.type, gs.house_edge, gs.decisions_per_hour
-- FROM gaming_table gt
-- LEFT JOIN game_settings gs ON gs.game_type = gt.type AND gs.casino_id = gt.casino_id
-- LIMIT 5;
--

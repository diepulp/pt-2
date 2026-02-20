-- ============================================================================
-- Migration: ADR-018 SECURITY DEFINER REVOKE/GRANT Remediation
-- Created: 2026-02-20
-- Audit Reference: ADR-018 Compliance Audit, Feb 2026
-- ADR References: ADR-018 (SECURITY DEFINER governance), ADR-024 (context injection)
-- ============================================================================
--
-- PURPOSE
-- ~~~~~~~
-- Remediate all MEDIUM-severity gaps (M-1, M-2, M-3) plus Stream 3 RPCs
-- where SECURITY DEFINER functions are missing REVOKE ALL FROM PUBLIC.
--
-- PostgreSQL defaults grant EXECUTE to PUBLIC on new functions. This means
-- the `anon` role can call SECURITY DEFINER RPCs. While internal auth checks
-- (set_rls_context_from_staff()) block execution, defense-in-depth per ADR-018
-- requires explicit REVOKE to eliminate the attack surface entirely.
--
-- Additionally handles:
--   M-4: Vestigial p_actor_id in rpc_start_rating_slip (use context instead)
--   L-3: Drop legacy exec_sql(text) function
--
-- SCOPE (26 functions total)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~
--   M-1:  3 RPCs (cashier confirmation, migration 20260217074826)
--   M-2:  1 RPC  (game settings seeding, migration 20260210081120)
--   M-3: 12 RPCs (ADR-024 remediation, migration 20251231072655)
--   M-3+: 1 RPC  (rpc_start_rating_slip, migration 20251229154013)
--   S3:   8 RPCs (Stream 3: table session, visit, rundown)
--   L-3:  1 function (exec_sql, legacy SQL execution)
--
-- IDEMPOTENCY
-- ~~~~~~~~~~~
-- All REVOKE and GRANT statements are idempotent. Running this migration
-- multiple times produces the same result. No IF EXISTS guards needed
-- for REVOKE/GRANT (PostgreSQL silently no-ops on redundant operations).
--
-- RISK ASSESSMENT
-- ~~~~~~~~~~~~~~~
-- LOW: REVOKE/GRANT are metadata-only DDL. No data changes, no function
--      body modifications (except M-4 and L-3). Authenticated users retain
--      access via explicit GRANT. Only PUBLIC/anon access is removed.
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: M-1 — Cashier Confirmation RPCs (migration 20260217074826)
-- ============================================================================
-- These 3 RPCs have NO REVOKE and NO GRANT in their original migration.
-- All are SECURITY DEFINER with set_rls_context_from_staff().

-- 1.1 rpc_confirm_table_fill(uuid, int, text)
-- ADR-018: REVOKE public access, grant to authenticated only
REVOKE ALL ON FUNCTION public.rpc_confirm_table_fill(uuid, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_confirm_table_fill(uuid, int, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_table_fill(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_table_fill(uuid, int, text) TO service_role;

-- 1.2 rpc_confirm_table_credit(uuid, int, text)
REVOKE ALL ON FUNCTION public.rpc_confirm_table_credit(uuid, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_confirm_table_credit(uuid, int, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_table_credit(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_table_credit(uuid, int, text) TO service_role;

-- 1.3 rpc_acknowledge_drop_received(uuid)
REVOKE ALL ON FUNCTION public.rpc_acknowledge_drop_received(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_acknowledge_drop_received(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_acknowledge_drop_received(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_acknowledge_drop_received(uuid) TO service_role;

-- ============================================================================
-- SECTION 2: M-2 — Game Settings Seed RPC (migration 20260210081120)
-- ============================================================================
-- This RPC has GRANT to authenticated but NO REVOKE FROM PUBLIC.

-- 2.1 rpc_seed_game_settings_defaults(text)
REVOKE ALL ON FUNCTION public.rpc_seed_game_settings_defaults(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_seed_game_settings_defaults(text) FROM anon;
-- GRANT already exists from original migration; re-assert for completeness
GRANT EXECUTE ON FUNCTION public.rpc_seed_game_settings_defaults(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_seed_game_settings_defaults(text) TO service_role;

-- ============================================================================
-- SECTION 3: M-3 — ADR-024 Remediation RPCs (migration 20251231072655)
-- ============================================================================
-- All 12 RPCs in this migration have NO REVOKE and NO GRANT.
-- All are SECURITY DEFINER with set_rls_context_from_staff().

-- 3.1 rpc_activate_floor_layout(uuid, uuid, text)
REVOKE ALL ON FUNCTION public.rpc_activate_floor_layout(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_activate_floor_layout(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_activate_floor_layout(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_activate_floor_layout(uuid, uuid, text) TO service_role;

-- 3.2 rpc_close_rating_slip(uuid, uuid, numeric)
REVOKE ALL ON FUNCTION public.rpc_close_rating_slip(uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_close_rating_slip(uuid, uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_close_rating_slip(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_close_rating_slip(uuid, uuid, numeric) TO service_role;

-- 3.3 rpc_create_floor_layout(uuid, text, text)
REVOKE ALL ON FUNCTION public.rpc_create_floor_layout(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_create_floor_layout(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_floor_layout(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_floor_layout(uuid, text, text) TO service_role;

-- 3.4 rpc_create_player(uuid, text, text, date)
REVOKE ALL ON FUNCTION public.rpc_create_player(uuid, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_create_player(uuid, text, text, date) FROM anon;
-- GRANT already exists from earlier migration (different signature uuid,uuid,text,text,date);
-- re-assert for current signature
GRANT EXECUTE ON FUNCTION public.rpc_create_player(uuid, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_player(uuid, text, text, date) TO service_role;

-- 3.5 rpc_log_table_drop(uuid, uuid, text, text, uuid, timestamptz, timestamptz, timestamptz, date, integer, text)
REVOKE ALL ON FUNCTION public.rpc_log_table_drop(uuid, uuid, text, text, uuid, timestamptz, timestamptz, timestamptz, date, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_log_table_drop(uuid, uuid, text, text, uuid, timestamptz, timestamptz, timestamptz, date, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_log_table_drop(uuid, uuid, text, text, uuid, timestamptz, timestamptz, timestamptz, date, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_log_table_drop(uuid, uuid, text, text, uuid, timestamptz, timestamptz, timestamptz, date, integer, text) TO service_role;

-- 3.6 rpc_log_table_inventory_snapshot(uuid, uuid, text, jsonb, uuid, integer, text)
REVOKE ALL ON FUNCTION public.rpc_log_table_inventory_snapshot(uuid, uuid, text, jsonb, uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_log_table_inventory_snapshot(uuid, uuid, text, jsonb, uuid, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_log_table_inventory_snapshot(uuid, uuid, text, jsonb, uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_log_table_inventory_snapshot(uuid, uuid, text, jsonb, uuid, integer, text) TO service_role;

-- 3.7 rpc_move_player(uuid, uuid, uuid, text, numeric)
REVOKE ALL ON FUNCTION public.rpc_move_player(uuid, uuid, uuid, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_move_player(uuid, uuid, uuid, text, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_move_player(uuid, uuid, uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_move_player(uuid, uuid, uuid, text, numeric) TO service_role;

-- 3.8 rpc_pause_rating_slip(uuid, uuid)
REVOKE ALL ON FUNCTION public.rpc_pause_rating_slip(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_pause_rating_slip(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_pause_rating_slip(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_pause_rating_slip(uuid, uuid) TO service_role;

-- 3.9 rpc_request_table_credit(uuid, uuid, jsonb, integer, uuid, uuid, text, text)
REVOKE ALL ON FUNCTION public.rpc_request_table_credit(uuid, uuid, jsonb, integer, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_request_table_credit(uuid, uuid, jsonb, integer, uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_table_credit(uuid, uuid, jsonb, integer, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_request_table_credit(uuid, uuid, jsonb, integer, uuid, uuid, text, text) TO service_role;

-- 3.10 rpc_request_table_fill(uuid, uuid, jsonb, integer, uuid, uuid, text, text)
REVOKE ALL ON FUNCTION public.rpc_request_table_fill(uuid, uuid, jsonb, integer, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_request_table_fill(uuid, uuid, jsonb, integer, uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_table_fill(uuid, uuid, jsonb, integer, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_request_table_fill(uuid, uuid, jsonb, integer, uuid, uuid, text, text) TO service_role;

-- 3.11 rpc_resume_rating_slip(uuid, uuid)
REVOKE ALL ON FUNCTION public.rpc_resume_rating_slip(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_resume_rating_slip(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_resume_rating_slip(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_resume_rating_slip(uuid, uuid) TO service_role;

-- 3.12 rpc_update_table_status(uuid, uuid, table_status)
REVOKE ALL ON FUNCTION public.rpc_update_table_status(uuid, uuid, table_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_update_table_status(uuid, uuid, table_status) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_table_status(uuid, uuid, table_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_table_status(uuid, uuid, table_status) TO service_role;

-- ============================================================================
-- SECTION 4: M-3+ — rpc_start_rating_slip (migration 20251229154013)
-- ============================================================================
-- SECURITY DEFINER, NO REVOKE, NO GRANT in any migration.
-- Signature: (uuid, uuid, uuid, text, jsonb, uuid) — 6th param is vestigial p_actor_id

-- 4.1 REVOKE/GRANT for current signature
REVOKE ALL ON FUNCTION public.rpc_start_rating_slip(uuid, uuid, uuid, text, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_start_rating_slip(uuid, uuid, uuid, text, jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_start_rating_slip(uuid, uuid, uuid, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_start_rating_slip(uuid, uuid, uuid, text, jsonb, uuid) TO service_role;

-- ============================================================================
-- SECTION 5: Stream 3 — Table Session, Visit, Rundown RPCs
-- ============================================================================
-- All have GRANT to authenticated but NO REVOKE FROM PUBLIC.

-- 5.1 rpc_open_table_session(uuid)
REVOKE ALL ON FUNCTION public.rpc_open_table_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_open_table_session(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_open_table_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_open_table_session(uuid) TO service_role;

-- 5.2 rpc_start_table_rundown(uuid)
REVOKE ALL ON FUNCTION public.rpc_start_table_rundown(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_start_table_rundown(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_start_table_rundown(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_start_table_rundown(uuid) TO service_role;

-- 5.3 rpc_close_table_session(uuid, uuid, uuid, text)
REVOKE ALL ON FUNCTION public.rpc_close_table_session(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_close_table_session(uuid, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_close_table_session(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_close_table_session(uuid, uuid, uuid, text) TO service_role;

-- 5.4 rpc_get_current_table_session(uuid)
REVOKE ALL ON FUNCTION public.rpc_get_current_table_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_current_table_session(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_current_table_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_current_table_session(uuid) TO service_role;

-- 5.5 rpc_start_or_resume_visit(uuid)
REVOKE ALL ON FUNCTION public.rpc_start_or_resume_visit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_start_or_resume_visit(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_start_or_resume_visit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_start_or_resume_visit(uuid) TO service_role;

-- 5.6 rpc_resolve_current_slip_context(uuid)
REVOKE ALL ON FUNCTION public.rpc_resolve_current_slip_context(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_resolve_current_slip_context(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_current_slip_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_current_slip_context(uuid) TO service_role;

-- 5.7 rpc_post_table_drop_total(uuid, integer)
REVOKE ALL ON FUNCTION public.rpc_post_table_drop_total(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_post_table_drop_total(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_post_table_drop_total(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_post_table_drop_total(uuid, integer) TO service_role;

-- 5.8 rpc_compute_table_rundown(uuid)
REVOKE ALL ON FUNCTION public.rpc_compute_table_rundown(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_compute_table_rundown(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_compute_table_rundown(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_compute_table_rundown(uuid) TO service_role;

-- ============================================================================
-- SECTION 6: M-4 — Vestigial p_actor_id in rpc_start_rating_slip
-- ============================================================================
-- The p_actor_id parameter is client-supplied and used in the audit_log INSERT.
-- Per ADR-024, the actor_id MUST come from the authoritative context
-- (set_rls_context_from_staff() -> app.actor_id), not from a spoofable parameter.
--
-- PHASE 1 (this migration): Replace function body to use context-derived actor_id.
--   The p_actor_id parameter is KEPT in the signature for backward compatibility
--   (callers still pass it) but its value is IGNORED. A deprecation comment is added.
--
-- PHASE 2 (future migration + TypeScript update): Remove p_actor_id from signature.
--   Requires coordinated changes in:
--     - services/rating-slip/crud.ts (line ~180)
--     - services/visit/crud.ts (line ~692)
--     - All integration tests passing p_actor_id
--     - database.types.ts regeneration
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_start_rating_slip(
  p_casino_id UUID,
  p_visit_id UUID,
  p_table_id UUID,
  p_seat_number TEXT,
  p_game_settings JSONB,
  p_actor_id UUID DEFAULT NULL  -- DEPRECATED: ignored, context-derived actor used instead (ADR-024 M-4)
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;  -- M-4 FIX: derive from context, not parameter
  v_result rating_slip;
  v_player_id UUID;
  v_visit_kind visit_kind;
  v_accrual_kind text;
  v_policy_snapshot JSONB;
  v_game_settings_lookup RECORD;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative RLS Context Injection
  -- Replaces vulnerable set_rls_context() pattern with secure staff-based lookup
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

  -- M-4 FIX: Derive actor_id from authoritative context (ADR-024)
  -- p_actor_id parameter is IGNORED — retained only for backward compatibility
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
  -- Ghost visits (gaming_ghost_unrated) are compliance-only, no loyalty
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
  -- =====================================================================

  -- Create slip with policy_snapshot and accrual_kind (ISSUE-752833A6 + ADR-014)
  INSERT INTO rating_slip (
    casino_id, visit_id, table_id,
    seat_number, game_settings, policy_snapshot, accrual_kind, status, start_time
  )
  VALUES (
    p_casino_id, p_visit_id, p_table_id,
    p_seat_number, p_game_settings, v_policy_snapshot, v_accrual_kind, 'open', now()
  )
  RETURNING * INTO v_result;

  -- Audit log: M-4 FIX — uses v_context_actor_id (authoritative) instead of p_actor_id (spoofable)
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating-slip',
    v_context_actor_id,  -- M-4 FIX: was p_actor_id (spoofable parameter)
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

COMMENT ON FUNCTION rpc_start_rating_slip(UUID, UUID, UUID, TEXT, JSONB, UUID) IS
  'ADR-024: Uses set_rls_context_from_staff() for authoritative context injection. '
  'Creates new rating slip for active visit/table. SEC-007 hardened with Template 5 context validation. '
  'ISSUE-752833A6: Populates policy_snapshot.loyalty from game_settings (ADR-019 D2). '
  'ADR-014: Sets accrual_kind based on visit_kind (ghost visits are compliance_only). '
  'M-4 FIX: p_actor_id parameter is DEPRECATED and IGNORED — actor derived from app.actor_id context.';

-- ============================================================================
-- SECTION 7: L-3 — Drop legacy exec_sql(text)
-- ============================================================================
-- exec_sql(text) is a SECURITY DEFINER function that accepts arbitrary SQL.
-- While it has a regex guard limiting to SET LOCAL, it is:
--   1. Superseded by set_rls_context_from_staff() (ADR-024)
--   2. GRANTED to authenticated role (attack surface)
--   3. Not called by any production TypeScript code
--   4. Only referenced in integration test files (as test utilities)
--
-- The regex guard (^\s*SET\s+LOCAL\s+) is the sole defense. Defense-in-depth
-- requires removing the function entirely.
--
-- Test files affected (need update separately):
--   - services/security/__tests__/rls-context.integration.test.ts
--   - lib/supabase/__tests__/rls-mtl.integration.test.ts
-- Both already use try/catch around exec_sql calls, so removal is non-breaking.

-- First REVOKE, then DROP (in case DROP fails, at least access is removed)
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM authenticated;

DROP FUNCTION IF EXISTS public.exec_sql(text);

-- ============================================================================
-- SECTION 8: L-4 — compute_gaming_day(uuid, timestamptz) — ALREADY REMEDIATED
-- ============================================================================
-- No action required. The 2-arg version was already locked down in migration
-- 20260203005841_prd027_temporal_rpcs.sql:
--   REVOKE EXECUTE ON FUNCTION public.compute_gaming_day(uuid, timestamptz) FROM anon, authenticated;
-- The function is retained for internal use by triggers (runs as function owner).
-- Verified: No DROP is appropriate — triggers depend on it.

-- ============================================================================
-- NOTIFY POSTGREST
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

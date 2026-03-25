-- ============================================================================
-- Migration: PRD-057 Session Close Lifecycle Hardening
-- Created: 2026-03-25
-- PRD Reference: docs/10-prd/PRD-057-session-close-lifecycle-hardening-v0.md
-- EXEC-SPEC: docs/21-exec-spec/EXEC-057-session-close-lifecycle-hardening.md
-- Purpose: Wire has_unresolved_items to live rating_slip state, enforce
--          session-gated seating, enrich force-close audit trail.
-- Bounded Context: TableContextService, RatingSlipService (cross-context reads)
-- ADR Compliance: ADR-024 (authoritative context), ADR-018 (DEFINER governance),
--                 ADR-030 D5 (search_path = pg_catalog, public)
-- ============================================================================
-- Amendments:
--   1. rpc_close_table_session — compute has_unresolved_items from live state
--   2. rpc_force_close_table_session — compute flag + enumerate orphaned slips
--   3. rpc_start_rating_slip — add table_session existence check
--   4. rpc_check_table_seat_availability — add table_session existence check
-- ============================================================================
-- Backward Compatibility: No signature changes. All use CREATE OR REPLACE.
-- ============================================================================


-- ============================================================================
-- 1. Update has_unresolved_items column comment (ownership transfer)
-- ============================================================================
-- PRD-038A defined this as "Finance/MTL RPCs or service_role only."
-- PRD-057 transfers write ownership to close RPCs which compute from live state.

COMMENT ON COLUMN table_session.has_unresolved_items IS
  'PRD-057: Computed from live rating_slip state at close time by rpc_close_table_session '
  'and rpc_force_close_table_session. True when open/paused rating slips exist at the table. '
  'Persisted only on successful close (standard: false, force: true/false). '
  'Future: Finance/MTL integration may also contribute.';


-- ============================================================================
-- 2. rpc_close_table_session — compute has_unresolved_items before P0005 check
-- ============================================================================
-- Baseline: 20260225110743_prd038a_close_guardrails_rpcs.sql
-- Change: compute flag from live rating_slip state; persist only on success
-- Transaction semantics: if flag=true, RAISE rolls back — no persistence
-- ADR-018: cross-context read includes casino_id = v_casino_id
-- ADR-030 D5: search_path = pg_catalog, public

CREATE OR REPLACE FUNCTION rpc_close_table_session(
  p_table_session_id uuid,
  p_drop_event_id uuid DEFAULT NULL,
  p_closing_inventory_snapshot_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_close_reason close_reason_type DEFAULT NULL,
  p_close_note text DEFAULT NULL
)
RETURNS table_session
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result table_session;
  v_casino_id uuid;
  v_actor_id uuid;
  v_role text;
  v_current_status table_session_status;
  v_has_unresolved boolean;
  v_table_id uuid;
BEGIN
  PERFORM set_rls_context_from_staff();

  v_casino_id := current_setting('app.casino_id')::uuid;
  v_actor_id := current_setting('app.actor_id')::uuid;

  -- Authorization (MVP): only pit_boss/admin may mutate sessions
  v_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  IF v_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = 'P0001',
            HINT = 'Only pit_boss or admin roles can close sessions';
  END IF;

  -- Get current status with lock
  SELECT status, gaming_table_id
  INTO v_current_status, v_table_id
  FROM table_session
  WHERE id = p_table_session_id
    AND casino_id = v_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found'
      USING ERRCODE = 'P0002',
            HINT = 'Session does not exist or belongs to different casino';
  END IF;

  -- Require RUNDOWN state (or ACTIVE if shortcut allowed)
  IF v_current_status NOT IN ('RUNDOWN', 'ACTIVE') THEN
    RAISE EXCEPTION 'invalid_state_transition'
      USING ERRCODE = 'P0003',
            HINT = format('Cannot close from %s state', v_current_status);
  END IF;

  -- PRD-057: Compute has_unresolved_items from live rating_slip state
  -- Cross-context read: TableContext → RatingSlip (allowlisted, read-only)
  -- ADR-018: casino_id filter required in SECURITY DEFINER
  SELECT EXISTS(
    SELECT 1 FROM rating_slip
    WHERE table_id = v_table_id
      AND casino_id = v_casino_id
      AND status IN ('open', 'paused')
  ) INTO v_has_unresolved;

  -- PRD-057: Block close when unresolved liabilities exist
  -- Transaction semantics: RAISE aborts → no state persisted on blocked close
  IF v_has_unresolved THEN
    RAISE EXCEPTION 'unresolved_liabilities'
      USING ERRCODE = 'P0005',
            HINT = 'Session has unresolved items. Use force-close for privileged override.';
  END IF;

  -- Require at least one closing artifact
  IF p_drop_event_id IS NULL AND p_closing_inventory_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'missing_closing_artifact'
      USING ERRCODE = 'P0004',
            HINT = 'Provide drop_event_id or closing_inventory_snapshot_id';
  END IF;

  -- PRD-038A Gap B: Validate close_note for 'other' reason
  IF p_close_reason = 'other' AND (p_close_note IS NULL OR length(trim(p_close_note)) = 0) THEN
    RAISE EXCEPTION 'close_note_required'
      USING ERRCODE = 'P0006',
            HINT = 'close_reason=other requires a non-empty close_note';
  END IF;

  -- Close the session — persist has_unresolved_items = false (successful close)
  UPDATE table_session SET
    status = 'CLOSED',
    closed_at = now(),
    closed_by_staff_id = v_actor_id,
    drop_event_id = COALESCE(p_drop_event_id, drop_event_id),
    closing_inventory_snapshot_id = COALESCE(p_closing_inventory_snapshot_id, closing_inventory_snapshot_id),
    notes = COALESCE(p_notes, notes),
    close_reason = p_close_reason,
    close_note = p_close_note,
    has_unresolved_items = false
  WHERE id = p_table_session_id
  RETURNING * INTO v_result;

  -- PRD-038: Inline rundown persistence (shared helper)
  PERFORM _persist_inline_rundown(
    p_table_session_id,
    v_result,
    v_casino_id,
    v_actor_id,
    p_drop_event_id
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_close_table_session(uuid, uuid, uuid, text, close_reason_type, text) IS
  'PRD-057: Computes has_unresolved_items from live rating_slip state. '
  'Blocks standard close when open/paused slips exist (P0005). '
  'Flag persists only on successful close (false). ADR-024 compliant.';


-- ============================================================================
-- 3. rpc_force_close_table_session — compute flag + enumerate orphaned slips
-- ============================================================================
-- Baseline: 20260225110743_prd038a_close_guardrails_rpcs.sql
-- Change: compute has_unresolved_items, enumerate orphans in audit_log
-- ADR-018: cross-context reads include casino_id = v_casino_id
-- ADR-030 D5: search_path = pg_catalog, public

CREATE OR REPLACE FUNCTION rpc_force_close_table_session(
  p_table_session_id uuid,
  p_close_reason close_reason_type,
  p_close_note text DEFAULT NULL
)
RETURNS table_session
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result table_session;
  v_casino_id uuid;
  v_actor_id uuid;
  v_role text;
  v_current_status table_session_status;
  v_has_unresolved boolean;
  v_table_id uuid;
  v_orphaned_slips jsonb;
  v_orphaned_count integer;
BEGIN
  PERFORM set_rls_context_from_staff();

  v_casino_id := current_setting('app.casino_id')::uuid;
  v_actor_id := current_setting('app.actor_id')::uuid;

  -- Authorization: force-close is restricted to pit_boss/admin
  v_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  IF v_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = 'P0001',
            HINT = 'Only pit_boss or admin roles can force-close sessions';
  END IF;

  -- Get current status and table_id with lock
  SELECT status, gaming_table_id
  INTO v_current_status, v_table_id
  FROM table_session
  WHERE id = p_table_session_id
    AND casino_id = v_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found'
      USING ERRCODE = 'P0002',
            HINT = 'Session does not exist or belongs to different casino';
  END IF;

  -- Cannot force-close an already closed session
  IF v_current_status = 'CLOSED' THEN
    RAISE EXCEPTION 'invalid_state_transition'
      USING ERRCODE = 'P0003',
            HINT = 'Session is already closed';
  END IF;

  -- Validate close_note for 'other' reason
  IF p_close_reason = 'other' AND (p_close_note IS NULL OR length(trim(p_close_note)) = 0) THEN
    RAISE EXCEPTION 'close_note_required'
      USING ERRCODE = 'P0006',
            HINT = 'close_reason=other requires a non-empty close_note';
  END IF;

  -- PRD-057: Compute has_unresolved_items from live rating_slip state
  -- Cross-context read: TableContext → RatingSlip (allowlisted, read-only)
  -- ADR-018: casino_id filter required in SECURITY DEFINER
  SELECT EXISTS(
    SELECT 1 FROM rating_slip
    WHERE table_id = v_table_id
      AND casino_id = v_casino_id
      AND status IN ('open', 'paused')
  ) INTO v_has_unresolved;

  -- PRD-057: Enumerate orphaned slips for audit trail
  -- Payload shape frozen per PRD §4.1: {slip_id, visit_id, status, seat_number}
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'slip_id', rs.id,
      'visit_id', rs.visit_id,
      'status', rs.status,
      'seat_number', rs.seat_number
    ) ORDER BY rs.seat_number, rs.start_time),
    '[]'::jsonb
  ), COUNT(*)::integer
  INTO v_orphaned_slips, v_orphaned_count
  FROM rating_slip rs
  WHERE rs.table_id = v_table_id
    AND rs.casino_id = v_casino_id
    AND rs.status IN ('open', 'paused');

  -- Force close: persist has_unresolved_items + requires_reconciliation
  UPDATE table_session SET
    status = 'CLOSED',
    closed_at = now(),
    closed_by_staff_id = v_actor_id,
    close_reason = p_close_reason,
    close_note = p_close_note,
    has_unresolved_items = v_has_unresolved,
    requires_reconciliation = true
  WHERE id = p_table_session_id
  RETURNING * INTO v_result;

  -- Audit trail: force close with orphaned slip enumeration
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'table-context',
    v_actor_id,
    'force_close',
    jsonb_build_object(
      'table_session_id', p_table_session_id,
      'close_reason', p_close_reason::text,
      'close_note', p_close_note,
      'previous_status', v_current_status::text,
      'has_unresolved_items', v_has_unresolved,
      'requires_reconciliation', true,
      'orphaned_rating_slips', v_orphaned_slips,
      'orphaned_slip_count', v_orphaned_count
    )
  );

  -- Inline rundown persistence (shared helper)
  PERFORM _persist_inline_rundown(
    p_table_session_id,
    v_result,
    v_casino_id,
    v_actor_id
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_force_close_table_session(uuid, close_reason_type, text) IS
  'PRD-057: Force-close with has_unresolved_items computation and orphaned slip audit trail. '
  'Payload: orphaned_rating_slips [{slip_id, visit_id, status, seat_number}] + orphaned_slip_count. '
  'ADR-024 compliant. ADR-018: casino_id scoped cross-context reads.';


-- ============================================================================
-- 4. rpc_start_rating_slip — add table_session existence check
-- ============================================================================
-- Baseline: 20260318131945_snapshot_rounding_policy.sql
-- Signature: (uuid, uuid, text, jsonb) — 4-param, no p_casino_id (ADR-024)
-- Change: add session gate after TABLE_NOT_ACTIVE check
-- ADR-018: casino_id filter on table_session query (SECURITY DEFINER)
-- RUNDOWN allowed per ADR-028 D6.2.1 (play continues during rundown)

CREATE OR REPLACE FUNCTION rpc_start_rating_slip(
  p_visit_id UUID,
  p_table_id UUID,
  p_seat_number TEXT,
  p_game_settings JSONB
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_context_actor_id uuid;
  v_result rating_slip;
  v_player_id UUID;
  v_visit_kind visit_kind;
  v_accrual_kind text;
  v_policy_snapshot JSONB;
  v_game_settings_lookup RECORD;
BEGIN
  -- ADR-024: Authoritative RLS Context Injection
  PERFORM set_rls_context_from_staff();

  -- Derive casino_id from authoritative context (no parameter — ADR-024)
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id not set in RLS context';
  END IF;

  -- Derive actor_id from authoritative context (ADR-024)
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate visit is open and get player_id + visit_kind
  SELECT player_id, visit_kind INTO v_player_id, v_visit_kind
  FROM visit
  WHERE id = p_visit_id
    AND casino_id = v_casino_id
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
      AND casino_id = v_casino_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'TABLE_NOT_ACTIVE: Table % is not active', p_table_id;
  END IF;

  -- =====================================================================
  -- PRD-057: SESSION-GATED SEATING
  -- Enforce invariant: no player seated without an active table session.
  -- Cross-context read: RatingSlip → TableContext (allowlisted, read-only)
  -- ADR-018: casino_id filter required in SECURITY DEFINER
  -- RUNDOWN allowed per ADR-028 D6.2.1 (play continues during rundown)
  -- =====================================================================
  IF NOT EXISTS (
    SELECT 1 FROM table_session
    WHERE gaming_table_id = p_table_id
      AND casino_id = v_casino_id
      AND status IN ('OPEN', 'ACTIVE', 'RUNDOWN')
  ) THEN
    RAISE EXCEPTION 'NO_ACTIVE_SESSION'
      USING ERRCODE = 'P0007',
            HINT = 'Table has no active session. Open a session before seating players.';
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
    AND gt.casino_id = v_casino_id;

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
    v_casino_id, p_visit_id, p_table_id,
    p_seat_number, p_game_settings, v_policy_snapshot, v_accrual_kind, 'open', now()
  )
  RETURNING * INTO v_result;

  -- Audit log: uses v_context_actor_id (authoritative, context-derived)
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
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

COMMENT ON FUNCTION rpc_start_rating_slip(UUID, UUID, TEXT, JSONB) IS
  'PRD-057: Session-gated seating — rejects with NO_ACTIVE_SESSION (P0007) when no active table session. '
  'ADR-024: set_rls_context_from_staff(), no p_casino_id/p_actor_id params. '
  'ADR-019 D2: policy_snapshot.loyalty from game_settings. '
  'ADR-014: accrual_kind from visit_kind. '
  'v2: adds rounding_policy=floor to snapshot (pilot decision D3).';

REVOKE ALL ON FUNCTION rpc_start_rating_slip(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpc_start_rating_slip(UUID, UUID, TEXT, JSONB) TO authenticated, service_role;


-- ============================================================================
-- 5. rpc_check_table_seat_availability — add table_session existence check
-- ============================================================================
-- Baseline: 20260303212259_fix_prd017_rpcs_dropped_set_rls_context.sql
-- Signature: (uuid, int) — SECURITY INVOKER (RLS enforced)
-- Change: add session check after table status checks, before seat occupancy
-- No manual casino_id filter needed (RLS handles scoping for INVOKER)

CREATE OR REPLACE FUNCTION rpc_check_table_seat_availability(
  p_table_id uuid,
  p_seat_number int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_table_record RECORD;
  v_seat_occupied boolean;
BEGIN
  -- ADR-024: Authoritative context derivation
  PERFORM set_rls_context_from_staff();

  -- 1. Check if table exists and get its status (RLS enforced)
  SELECT id, label, status, casino_id
  INTO v_table_record
  FROM gaming_table
  WHERE id = p_table_id;

  -- Table not found (or not accessible due to RLS)
  IF v_table_record IS NULL THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'table_not_found'
    );
  END IF;

  -- 2. Check table status
  IF v_table_record.status = 'inactive' THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'table_inactive',
      'table_name', v_table_record.label
    );
  END IF;

  IF v_table_record.status = 'closed' THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'table_closed',
      'table_name', v_table_record.label
    );
  END IF;

  -- 3. PRD-057: Check for active table session
  -- SECURITY INVOKER: RLS handles casino scoping — no manual filter needed
  -- RUNDOWN allowed per ADR-028 D6.2.1 (play continues during rundown)
  IF NOT EXISTS (
    SELECT 1 FROM table_session
    WHERE gaming_table_id = p_table_id
      AND status IN ('OPEN', 'ACTIVE', 'RUNDOWN')
  ) THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'no_active_session',
      'table_name', v_table_record.label
    );
  END IF;

  -- 4. Check seat occupancy (open or paused rating slip at this table/seat)
  SELECT EXISTS(
    SELECT 1
    FROM rating_slip rs
    WHERE rs.table_id = p_table_id
      AND rs.seat_number = p_seat_number::text
      AND rs.status IN ('open', 'paused')
  ) INTO v_seat_occupied;

  IF v_seat_occupied THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'seat_occupied',
      'table_name', v_table_record.label
    );
  END IF;

  -- 5. Table is active, session exists, and seat is available
  RETURN jsonb_build_object(
    'available', true,
    'table_name', v_table_record.label
  );
END;
$$;

COMMENT ON FUNCTION rpc_check_table_seat_availability(uuid, int) IS
  'PRD-057: Session-gated seating — returns no_active_session when no table session. '
  'PRD-017: Checks table/seat availability. ADR-024: Uses set_rls_context_from_staff(). SECURITY INVOKER.';


-- ============================================================================
-- 6. Permissions (re-assert after CREATE OR REPLACE)
-- ============================================================================

-- Close: preserve existing grants
REVOKE ALL ON FUNCTION rpc_close_table_session(uuid, uuid, uuid, text, close_reason_type, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpc_close_table_session(uuid, uuid, uuid, text, close_reason_type, text) TO authenticated;

-- Force close: preserve existing grants
REVOKE ALL ON FUNCTION rpc_force_close_table_session(uuid, close_reason_type, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpc_force_close_table_session(uuid, close_reason_type, text) TO authenticated;

-- Start rating slip: already granted above in section 4
-- Seat availability: SECURITY INVOKER, no special grants needed


-- ============================================================================
-- 7. Notify PostgREST
-- ============================================================================

NOTIFY pgrst, 'reload schema';

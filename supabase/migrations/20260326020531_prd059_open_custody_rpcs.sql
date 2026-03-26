-- ============================================================================
-- Migration: PRD-059 OPEN Table Custody Gate — RPCs + Session Gate Fixes
-- Created: 2026-03-26
-- ADR Reference: docs/80-adrs/ADR-048-open-table-custody-gate.md
-- PRD Reference: docs/10-prd/PRD-059-open-table-custody-gate-pilot-lite-v0.md
-- SEC Note: docs/20-architecture/specs/open-custody-lite/SEC_NOTE.md
-- Purpose: Modify rpc_open_table_session (OPEN status + predecessor linkage),
--          create rpc_activate_table_session (custody attestation),
--          modify rpc_close_table_session (OPEN-cancellation),
--          fix session gates to exclude OPEN from gameplay-allowed statuses.
-- Bounded Context: TableContextService
-- ADR Compliance: ADR-024 (authoritative context), ADR-018 (DEFINER governance),
--                 ADR-030 (write-path session vars), ADR-040 (Category A identity)
-- ============================================================================
-- Error Codes (new):
--   P0008: dealer_not_confirmed — dealer_confirmed is false
--   P0009: note_required — note required but missing/empty
--   P0010: invalid_opening_amount — opening_total_cents < 0
--   P0011: predecessor_already_consumed — snapshot consumption guard
-- ============================================================================


-- ============================================================================
-- 1. rpc_open_table_session — insert OPEN (not ACTIVE), link predecessor
-- ============================================================================
-- Baseline: 20260115025237_table_session_rpcs.sql
-- Changes: status='OPEN', predecessor lookup, snapshot linkage
-- ADR-048: Two-step activation lifecycle (OPEN → ACTIVE via attestation)

CREATE OR REPLACE FUNCTION rpc_open_table_session(p_gaming_table_id uuid)
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
  v_predecessor_session_id uuid;
  v_predecessor_closing_snapshot_id uuid;
BEGIN
  -- ADR-024: Derive context from authoritative sources
  PERFORM set_rls_context_from_staff();

  v_casino_id := current_setting('app.casino_id')::uuid;
  v_actor_id := current_setting('app.actor_id')::uuid;

  -- Authorization: only pit_boss/admin may open sessions
  v_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  IF v_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = 'P0001',
            HINT = 'Only pit_boss or admin roles can open sessions';
  END IF;

  -- Validate no active session exists (lock row if found)
  IF EXISTS (
    SELECT 1 FROM table_session
    WHERE gaming_table_id = p_gaming_table_id
    AND casino_id = v_casino_id
    AND status IN ('OPEN', 'ACTIVE', 'RUNDOWN')
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'active_session_exists'
      USING ERRCODE = '23505',
            HINT = 'Close existing session before opening new one';
  END IF;

  -- Predecessor lookup: most recent CLOSED session for this table
  SELECT id, closing_inventory_snapshot_id
  INTO v_predecessor_session_id, v_predecessor_closing_snapshot_id
  FROM table_session
  WHERE gaming_table_id = p_gaming_table_id
    AND casino_id = v_casino_id
    AND status = 'CLOSED'
  ORDER BY closed_at DESC NULLS LAST
  LIMIT 1;

  -- Create new session with OPEN status (ADR-048: two-step activation)
  INSERT INTO table_session (
    casino_id,
    gaming_table_id,
    status,
    opened_by_staff_id,
    predecessor_session_id,
    opening_inventory_snapshot_id
  ) VALUES (
    v_casino_id,
    p_gaming_table_id,
    'OPEN',
    v_actor_id,
    v_predecessor_session_id,
    v_predecessor_closing_snapshot_id
  )
  RETURNING * INTO v_result;

  RETURN v_result;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'active_session_exists'
      USING ERRCODE = '23505',
            HINT = 'Another session was opened concurrently';
END;
$$;

COMMENT ON FUNCTION rpc_open_table_session(uuid) IS
  'PRD-059: Opens table session in OPEN status (ADR-048 two-step activation). '
  'Links predecessor_session_id and opening_inventory_snapshot_id from most recent CLOSED session. '
  'Requires rpc_activate_table_session to reach ACTIVE. ADR-024 compliant.';


-- ============================================================================
-- 2. rpc_activate_table_session — NEW: custody attestation + OPEN→ACTIVE
-- ============================================================================
-- ADR-048 D1: Creates table_opening_attestation as separate record
-- SEC Note: Controls C1-C7 implemented
-- ADR-024: casino_id and attested_by from authoritative context, not params
-- ADR-040: Category A identity provenance for attested_by

CREATE OR REPLACE FUNCTION rpc_activate_table_session(
  p_table_session_id uuid,
  p_opening_total_cents integer,
  p_dealer_confirmed boolean,
  p_opening_note text DEFAULT NULL
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
  v_session RECORD;
  v_provenance text;
  v_note_required boolean := false;
  v_predecessor_snapshot_id uuid;
  v_predecessor_close_total integer;
  v_predecessor_requires_recon boolean;
  v_rows integer;
BEGIN
  -- ADR-024: Authoritative context injection (SEC Note C2)
  PERFORM set_rls_context_from_staff();

  -- Derive context from session vars (ADR-024 INV-8: no spoofable params)
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set';
  END IF;

  -- Role gate: pit_boss/admin only (SEC Note C3)
  v_role := NULLIF(current_setting('app.staff_role', true), '');

  IF v_role IS NULL OR v_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = 'P0001',
            HINT = 'Only pit_boss or admin roles can activate sessions';
  END IF;

  -- Validate session: exists, belongs to casino, status=OPEN (FOR UPDATE lock)
  SELECT id, gaming_table_id, status, predecessor_session_id,
         opening_inventory_snapshot_id
  INTO v_session
  FROM table_session
  WHERE id = p_table_session_id
    AND casino_id = v_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found'
      USING ERRCODE = 'P0002',
            HINT = 'Session does not exist or belongs to different casino';
  END IF;

  IF v_session.status != 'OPEN' THEN
    RAISE EXCEPTION 'invalid_state_transition'
      USING ERRCODE = 'P0003',
            HINT = format('Cannot activate from %s state — only OPEN sessions can be activated', v_session.status);
  END IF;

  -- Validate dealer confirmation (SEC Note: dealer_confirmed required)
  IF p_dealer_confirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'dealer_not_confirmed'
      USING ERRCODE = 'P0008',
            HINT = 'Dealer confirmation is required to activate a table session';
  END IF;

  -- Validate opening amount
  IF p_opening_total_cents < 0 THEN
    RAISE EXCEPTION 'invalid_opening_amount'
      USING ERRCODE = 'P0010',
            HINT = 'Opening total cents must be >= 0';
  END IF;

  -- =====================================================================
  -- Derive provenance_source and note requirement (SEC Note C7)
  -- Server-derived: client cannot select provenance
  -- =====================================================================
  IF v_session.predecessor_session_id IS NULL THEN
    -- No predecessor: bootstrap from par
    v_provenance := 'par_bootstrap';
    v_note_required := true;
  ELSE
    -- Predecessor exists: check if closing snapshot is valid
    -- Read total_cents in SAME transaction (SEC Note T4: atomicity)
    SELECT tis.id, tis.total_cents
    INTO v_predecessor_snapshot_id, v_predecessor_close_total
    FROM table_inventory_snapshot tis
    WHERE tis.id = v_session.opening_inventory_snapshot_id;

    IF v_predecessor_snapshot_id IS NULL OR v_predecessor_close_total IS NULL THEN
      -- Broken predecessor: snapshot missing or total_cents NULL
      v_provenance := 'par_bootstrap';
      v_note_required := true;
    ELSE
      -- Valid predecessor chain
      v_provenance := 'predecessor';

      -- Check variance: opening amount differs from close total
      IF v_predecessor_close_total != p_opening_total_cents THEN
        v_note_required := true;
      END IF;

      -- Check requires_reconciliation on predecessor session
      SELECT requires_reconciliation
      INTO v_predecessor_requires_recon
      FROM table_session
      WHERE id = v_session.predecessor_session_id;

      IF v_predecessor_requires_recon IS TRUE THEN
        v_note_required := true;
      END IF;
    END IF;
  END IF;

  -- Validate note when required
  IF v_note_required AND (p_opening_note IS NULL OR trim(p_opening_note) = '') THEN
    RAISE EXCEPTION 'note_required'
      USING ERRCODE = 'P0009',
            HINT = format('A note is required for this activation (provenance=%s)', v_provenance);
  END IF;

  -- =====================================================================
  -- INSERT table_opening_attestation (SEC Note C4: RPC-only writes)
  -- casino_id from app.casino_id, attested_by from app.actor_id (ADR-024)
  -- predecessor_close_total_cents read in same transaction (SEC Note T4)
  -- =====================================================================
  INSERT INTO table_opening_attestation (
    casino_id,
    session_id,
    opening_total_cents,
    attested_by,
    dealer_confirmed,
    note,
    predecessor_snapshot_id,
    predecessor_close_total_cents,
    provenance_source
  ) VALUES (
    v_casino_id,                  -- from current_setting('app.casino_id') — ADR-024
    p_table_session_id,
    p_opening_total_cents,
    v_actor_id,                   -- from current_setting('app.actor_id') — ADR-024/040
    p_dealer_confirmed,
    p_opening_note,
    v_predecessor_snapshot_id,    -- NULL if no predecessor
    v_predecessor_close_total,    -- NULL if no predecessor
    v_provenance
  );

  -- Transition OPEN → ACTIVE (SEC Note C6: attestation-existence invariant)
  UPDATE table_session SET
    status = 'ACTIVE',
    activated_by_staff_id = v_actor_id
  WHERE id = p_table_session_id
  RETURNING * INTO v_result;

  -- =====================================================================
  -- Guarded predecessor snapshot consumption (SEC Note C5)
  -- Single-write: consumed_by_session_id set once, never overwritten
  -- Zero rows affected = snapshot already consumed = chain fork = P0011
  -- =====================================================================
  IF v_predecessor_snapshot_id IS NOT NULL THEN
    UPDATE table_inventory_snapshot
    SET consumed_by_session_id = p_table_session_id,
        consumed_at = now()
    WHERE id = v_predecessor_snapshot_id
      AND consumed_by_session_id IS NULL;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      RAISE EXCEPTION 'predecessor_already_consumed'
        USING ERRCODE = 'P0011',
              HINT = 'Predecessor close snapshot was already consumed by another session (chain fork detected)';
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_activate_table_session(uuid, integer, boolean, text) IS
  'PRD-059: Creates table_opening_attestation and transitions OPEN→ACTIVE. '
  'SEC Note controls: C1 (RLS), C2 (ADR-024 actor), C3 (role gate), C5 (consumption guard), '
  'C6 (attestation invariant), C7 (server-derived provenance). '
  'Error codes: P0001 (forbidden), P0002 (not found), P0003 (wrong status), '
  'P0008 (dealer), P0009 (note required), P0010 (amount), P0011 (consumed).';

REVOKE ALL ON FUNCTION rpc_activate_table_session(uuid, integer, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpc_activate_table_session(uuid, integer, boolean, text) TO authenticated;


-- ============================================================================
-- 3. rpc_close_table_session — add OPEN-cancellation branch (ADR-048 D2)
-- ============================================================================
-- Baseline: 20260325150925_prd057_session_close_lifecycle_hardening.sql
-- Change: accept OPEN status with cancellation semantics
-- ADR-048 D2: OPEN-cancellation is NOT gameplay close — distinct operational act

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

  -- =====================================================================
  -- PRD-059: OPEN-cancellation branch (ADR-048 D2)
  -- Distinct from gameplay close: no artifacts, no rundown, no unresolved check
  -- Boundary rule: OPEN-cancellation piggybacking on close infrastructure
  -- =====================================================================
  IF v_current_status = 'OPEN' THEN
    -- OPEN sessions MUST use close_reason='cancelled'
    IF p_close_reason IS DISTINCT FROM 'cancelled' THEN
      RAISE EXCEPTION 'invalid_state_transition'
        USING ERRCODE = 'P0003',
              HINT = 'OPEN sessions must be cancelled with close_reason=cancelled';
    END IF;

    -- Cancel: no attestation created, no predecessor consumed
    UPDATE table_session SET
      status = 'CLOSED',
      closed_at = now(),
      closed_by_staff_id = v_actor_id,
      close_reason = 'cancelled',
      close_note = p_close_note
    WHERE id = p_table_session_id
    RETURNING * INTO v_result;

    RETURN v_result;
  END IF;
  -- =====================================================================
  -- End OPEN-cancellation branch. Below is gameplay close (ACTIVE/RUNDOWN).
  -- =====================================================================

  -- Require RUNDOWN state (or ACTIVE if shortcut allowed)
  IF v_current_status NOT IN ('RUNDOWN', 'ACTIVE') THEN
    RAISE EXCEPTION 'invalid_state_transition'
      USING ERRCODE = 'P0003',
            HINT = format('Cannot close from %s state', v_current_status);
  END IF;

  -- PRD-057: Compute has_unresolved_items from live rating_slip state
  SELECT EXISTS(
    SELECT 1 FROM rating_slip
    WHERE table_id = v_table_id
      AND casino_id = v_casino_id
      AND status IN ('open', 'paused')
  ) INTO v_has_unresolved;

  -- PRD-057: Block close when unresolved liabilities exist
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

  -- Close the session
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

  -- PRD-038: Inline rundown persistence
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
  'PRD-059: OPEN-cancellation branch (ADR-048 D2) + PRD-057 unresolved items. '
  'Three modes: OPEN→cancelled (no artifacts), ACTIVE/RUNDOWN→CLOSED (with artifacts). '
  'ADR-024 compliant. ADR-048 D2 boundary rule: OPEN-cancellation is not gameplay close.';


-- ============================================================================
-- 4. SESSION GATE FIXES (DA P0-1 — CRITICAL)
-- ============================================================================
-- rpc_start_rating_slip and rpc_check_table_seat_availability both check
-- status IN ('OPEN', 'ACTIVE', 'RUNDOWN') — this allows gameplay on OPEN
-- sessions before attestation. Fix: exclude OPEN from allowed statuses.
-- OPEN sessions must NOT pass the gameplay gate.
-- ============================================================================


-- 4a. rpc_start_rating_slip — fix session gate
-- Baseline: 20260325150925_prd057_session_close_lifecycle_hardening.sql
-- Change: line ~404: remove OPEN from allowed session statuses

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

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id not set in RLS context';
  END IF;

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

  -- Determine accrual_kind (ADR-014 Ghost Gaming)
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
  -- PRD-057 + PRD-059: SESSION-GATED SEATING
  -- DA P0-1 FIX: Exclude OPEN from allowed statuses.
  -- OPEN sessions have not been activated (no attestation) — gameplay forbidden.
  -- RUNDOWN allowed per ADR-028 D6.2.1 (play continues during rundown)
  -- =====================================================================
  IF NOT EXISTS (
    SELECT 1 FROM table_session
    WHERE gaming_table_id = p_table_id
      AND casino_id = v_casino_id
      AND status IN ('ACTIVE', 'RUNDOWN')
  ) THEN
    RAISE EXCEPTION 'NO_ACTIVE_SESSION'
      USING ERRCODE = 'P0007',
            HINT = 'Table has no active session. Open and activate a session before seating players.';
  END IF;

  -- Build policy_snapshot (ISSUE-752833A6, ADR-019 D2)
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

  -- Create slip
  INSERT INTO rating_slip (
    casino_id, visit_id, table_id,
    seat_number, game_settings, policy_snapshot, accrual_kind, status, start_time
  )
  VALUES (
    v_casino_id, p_visit_id, p_table_id,
    p_seat_number, p_game_settings, v_policy_snapshot, v_accrual_kind, 'open', now()
  )
  RETURNING * INTO v_result;

  -- Audit log
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
  'PRD-059: Session gate excludes OPEN status (DA P0-1 fix). '
  'PRD-057: Session-gated seating — rejects NO_ACTIVE_SESSION (P0007). '
  'ADR-024: set_rls_context_from_staff(), no p_casino_id/p_actor_id params. '
  'ADR-019 D2: policy_snapshot.loyalty from game_settings.';

REVOKE ALL ON FUNCTION rpc_start_rating_slip(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpc_start_rating_slip(UUID, UUID, TEXT, JSONB) TO authenticated, service_role;


-- 4b. rpc_check_table_seat_availability — fix session gate
-- Baseline: 20260325150925_prd057_session_close_lifecycle_hardening.sql
-- Change: line ~551: remove OPEN from allowed session statuses

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

  -- 3. PRD-057 + PRD-059: Check for ACTIVE table session
  -- DA P0-1 FIX: Exclude OPEN — only ACTIVE/RUNDOWN allow gameplay
  IF NOT EXISTS (
    SELECT 1 FROM table_session
    WHERE gaming_table_id = p_table_id
      AND status IN ('ACTIVE', 'RUNDOWN')
  ) THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'no_active_session',
      'table_name', v_table_record.label
    );
  END IF;

  -- 4. Check seat occupancy
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
  'PRD-059: Session gate excludes OPEN status (DA P0-1 fix). '
  'PRD-057: Session-gated seating — returns no_active_session when no table session. '
  'ADR-024: Uses set_rls_context_from_staff(). SECURITY INVOKER.';


-- ============================================================================
-- 5. rpc_start_table_rundown — exclude OPEN from allowed entry statuses
-- ============================================================================
-- Consistency fix: OPEN sessions should not go directly to RUNDOWN.
-- An OPEN session has no gameplay — rundown is meaningless.

CREATE OR REPLACE FUNCTION rpc_start_table_rundown(p_table_session_id uuid)
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
BEGIN
  PERFORM set_rls_context_from_staff();

  v_casino_id := current_setting('app.casino_id')::uuid;
  v_actor_id := current_setting('app.actor_id')::uuid;

  v_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  IF v_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = 'P0001',
            HINT = 'Only pit_boss or admin roles can start rundown';
  END IF;

  SELECT status INTO v_current_status
  FROM table_session
  WHERE id = p_table_session_id
  AND casino_id = v_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found'
      USING ERRCODE = 'P0002',
            HINT = 'Session does not exist or belongs to different casino';
  END IF;

  -- PRD-059: Only ACTIVE sessions can enter RUNDOWN (OPEN excluded)
  IF v_current_status != 'ACTIVE' THEN
    RAISE EXCEPTION 'invalid_state_transition'
      USING ERRCODE = 'P0003',
            HINT = format('Cannot start rundown from %s state — only ACTIVE sessions', v_current_status);
  END IF;

  UPDATE table_session SET
    status = 'RUNDOWN',
    rundown_started_at = now(),
    rundown_started_by_staff_id = v_actor_id
  WHERE id = p_table_session_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_start_table_rundown(uuid) IS
  'PRD-059: Only ACTIVE sessions can enter RUNDOWN (OPEN excluded). '
  'ADR-024 compliant.';


-- ============================================================================
-- 6. Permissions (re-assert after CREATE OR REPLACE)
-- ============================================================================

-- Open
REVOKE ALL ON FUNCTION rpc_open_table_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpc_open_table_session(uuid) TO authenticated;

-- Rundown
REVOKE ALL ON FUNCTION rpc_start_table_rundown(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpc_start_table_rundown(uuid) TO authenticated;

-- Close (6-param version)
REVOKE ALL ON FUNCTION rpc_close_table_session(uuid, uuid, uuid, text, close_reason_type, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpc_close_table_session(uuid, uuid, uuid, text, close_reason_type, text) TO authenticated;

-- Force close (unchanged, but re-assert)
REVOKE ALL ON FUNCTION rpc_force_close_table_session(uuid, close_reason_type, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpc_force_close_table_session(uuid, close_reason_type, text) TO authenticated;


-- ============================================================================
-- 7. Notify PostgREST
-- ============================================================================

NOTIFY pgrst, 'reload schema';

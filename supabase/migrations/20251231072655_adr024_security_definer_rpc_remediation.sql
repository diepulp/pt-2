-- =====================================================
-- Migration: ADR-024 SECURITY DEFINER RPC Remediation
-- Created: 2025-12-31 07:26:55 UTC
-- ADR Reference: docs/80-adrs/ADR-024_DECISIONS.md
-- =====================================================
-- This migration updates all 12 remaining SECURITY DEFINER RPCs
-- to use set_rls_context_from_staff() instead of deprecated set_rls_context().
--
-- Security Fix:
--   - Replaces spoofable set_rls_context(p_actor_id, p_casino_id, p_role)
--   - With authoritative set_rls_context_from_staff() (derives from JWT + staff table)
--
-- Affected RPCs:
--   1.  rpc_activate_floor_layout
--   2.  rpc_close_rating_slip
--   3.  rpc_create_floor_layout
--   4.  rpc_create_player
--   5.  rpc_log_table_drop
--   6.  rpc_log_table_inventory_snapshot
--   7.  rpc_move_player
--   8.  rpc_pause_rating_slip
--   9.  rpc_request_table_credit
--   10. rpc_request_table_fill
--   11. rpc_resume_rating_slip
--   12. rpc_update_table_status
--
-- Security Invariants Enforced:
--   INV-2: Only set_rls_context_from_staff() callable by client roles
--   INV-3: Staff identity bound to auth.uid() via staff table lookup
--   INV-5: Context set via SET LOCAL (pooler-safe)
--   INV-7: All client-callable RPCs call set_rls_context_from_staff()
-- =====================================================

BEGIN;

-- ============================================================================
-- 1. rpc_activate_floor_layout
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_activate_floor_layout(
  p_casino_id uuid,
  p_layout_version_id uuid,
  p_request_id text
) RETURNS floor_layout_activation
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_result floor_layout_activation;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Casino scope validation
  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot activate floor layouts', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  INSERT INTO public.floor_layout_activation (
    casino_id, layout_version_id, activated_by, activation_request_id
  ) VALUES (
    p_casino_id, p_layout_version_id, v_context_actor_id, p_request_id
  )
  ON CONFLICT (casino_id, activation_request_id) DO UPDATE
    SET layout_version_id = EXCLUDED.layout_version_id,
        activated_by = EXCLUDED.activated_by,
        activated_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_activate_floor_layout(uuid, uuid, text) IS
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- 2. rpc_close_rating_slip
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_close_rating_slip(
  p_casino_id uuid,
  p_rating_slip_id uuid,
  p_average_bet numeric DEFAULT NULL
) RETURNS TABLE(slip rating_slip, duration_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_actor_id uuid;
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_row record;
  v_result rating_slip;
  v_previous_status text;  -- FIX: Capture before UPDATE for accurate audit log
  v_duration INTEGER;
  v_current_pause_range tstzrange;
  v_final_intervals tstzrange[];
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Casino scope validation
  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot close rating slips', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- Lock the slip for update to prevent race conditions
  SELECT * INTO v_result
  FROM rating_slip
  WHERE id = p_rating_slip_id
  AND casino_id = p_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  IF v_result.status = 'closed' THEN
    RAISE EXCEPTION 'RATING_SLIP_ALREADY_CLOSED: Rating slip % is already closed', p_rating_slip_id;
  END IF;

  -- FIX: Capture previous_status BEFORE any modifications for accurate audit log
  v_previous_status := v_result.status::text;

  -- If currently paused, close the open pause interval first
  IF v_result.status = 'paused' AND v_result.pause_intervals IS NOT NULL THEN
    v_current_pause_range := v_result.pause_intervals[array_length(v_result.pause_intervals, 1)];

    -- Only update if upper bound is null (meaning it's still open)
    IF upper(v_current_pause_range) IS NULL THEN
      v_final_intervals := v_result.pause_intervals;
      v_final_intervals[array_length(v_final_intervals, 1)] :=
        tstzrange(lower(v_current_pause_range), now());

      v_result.pause_intervals := v_final_intervals;
    END IF;
  END IF;

  -- Calculate duration (excluding paused time)
  SELECT EXTRACT(EPOCH FROM (
    now() - v_result.start_time - COALESCE(
      SUM(upper(pause_range) - lower(pause_range)),
      INTERVAL '0 seconds'
    )
  ))::INTEGER INTO v_duration
  FROM unnest(COALESCE(v_result.pause_intervals, '{}')) AS pause_range;

  -- Update slip to closed state
  UPDATE rating_slip
  SET
    status = 'closed',
    end_time = now(),
    duration_seconds = v_duration,
    average_bet = COALESCE(p_average_bet, v_result.average_bet),
    final_average_bet = p_average_bet,
    pause_intervals = COALESCE(v_final_intervals, v_result.pause_intervals)
  WHERE id = p_rating_slip_id
  RETURNING * INTO v_result;

  -- Audit log (FIX: Use v_previous_status captured before UPDATE)
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating_slip',
    v_context_actor_id,
    'close',
    jsonb_build_object(
      'rating_slip_id', p_rating_slip_id,
      'duration_seconds', v_duration,
      'average_bet', COALESCE(p_average_bet, v_result.average_bet),
      'previous_status', v_previous_status,
      'visit_id', v_result.visit_id
    )
  );

  RETURN QUERY SELECT v_result, v_duration;
END;
$$;

COMMENT ON FUNCTION rpc_close_rating_slip(uuid, uuid, numeric) IS
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- 3. rpc_create_floor_layout
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_create_floor_layout(
  p_casino_id uuid,
  p_name text,
  p_description text
) RETURNS floor_layout
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_layout_id uuid;
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Casino scope validation
  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot create floor layouts', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  INSERT INTO public.floor_layout (casino_id, name, description, created_by)
  VALUES (p_casino_id, p_name, p_description, v_context_actor_id)
  RETURNING id INTO v_layout_id;

  INSERT INTO public.floor_layout_version (layout_id, version_no, created_by)
  VALUES (v_layout_id, 1, v_context_actor_id);

  RETURN (SELECT fl FROM public.floor_layout fl WHERE fl.id = v_layout_id);
END;
$$;

COMMENT ON FUNCTION rpc_create_floor_layout(uuid, text, text) IS
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- 4. rpc_create_player
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_create_player(
  p_casino_id uuid,
  p_first_name text,
  p_last_name text,
  p_birth_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff_role text;
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_player_id uuid;
  v_player_record jsonb;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Casino scope validation
  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id
    USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
    USING ERRCODE = 'P0001';
  END IF;

  -- Validate staff role (pit_boss or admin required)
  IF v_staff_role IS NULL OR v_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: staff_role must be pit_boss or admin, got: %', COALESCE(v_staff_role, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate actor exists and belongs to casino
  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE id = v_context_actor_id
      AND casino_id = p_casino_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Actor not found or not active in casino'
      USING ERRCODE = 'P0002';
  END IF;

  -- Validate input
  IF p_first_name IS NULL OR trim(p_first_name) = '' THEN
    RAISE EXCEPTION 'first_name is required'
      USING ERRCODE = '23502';
  END IF;

  IF p_last_name IS NULL OR trim(p_last_name) = '' THEN
    RAISE EXCEPTION 'last_name is required'
      USING ERRCODE = '23502';
  END IF;

  -- Create player record
  INSERT INTO player (first_name, last_name, birth_date)
  VALUES (trim(p_first_name), trim(p_last_name), p_birth_date)
  RETURNING id INTO v_player_id;

  -- Create player_casino enrollment (ATOMIC with player creation)
  INSERT INTO player_casino (player_id, casino_id, status, enrolled_by)
  VALUES (v_player_id, p_casino_id, 'active', v_context_actor_id)
  ON CONFLICT (player_id, casino_id) DO NOTHING;

  -- Create player_loyalty record (ISSUE-B5894ED8 FIX)
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
    0,
    NULL,
    '{}',
    now()
  )
  ON CONFLICT (player_id, casino_id) DO NOTHING;

  -- Build and return player DTO
  SELECT jsonb_build_object(
    'id', p.id,
    'firstName', p.first_name,
    'lastName', p.last_name,
    'birthDate', p.birth_date,
    'createdAt', p.created_at
  )
  INTO v_player_record
  FROM player p
  WHERE p.id = v_player_id;

  RETURN v_player_record;
END;
$$;

COMMENT ON FUNCTION rpc_create_player(uuid, text, text, date) IS
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- 5. rpc_log_table_drop
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_log_table_drop(
  p_casino_id uuid,
  p_table_id uuid,
  p_drop_box_id text,
  p_seal_no text,
  p_witnessed_by uuid,
  p_removed_at timestamptz DEFAULT now(),
  p_delivered_at timestamptz DEFAULT NULL,
  p_delivered_scan_at timestamptz DEFAULT NULL,
  p_gaming_day date DEFAULT NULL,
  p_seq_no integer DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS table_drop_event
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_result table_drop_event;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Casino scope validation
  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot log table drops', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  INSERT INTO public.table_drop_event (
    casino_id,
    table_id,
    drop_box_id,
    seal_no,
    removed_by,
    witnessed_by,
    removed_at,
    delivered_at,
    delivered_scan_at,
    gaming_day,
    seq_no,
    note
  )
  VALUES (
    p_casino_id,
    p_table_id,
    p_drop_box_id,
    p_seal_no,
    v_context_actor_id,
    p_witnessed_by,
    COALESCE(p_removed_at, now()),
    p_delivered_at,
    p_delivered_scan_at,
    p_gaming_day,
    p_seq_no,
    p_note
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_log_table_drop(uuid, uuid, text, text, uuid, timestamptz, timestamptz, timestamptz, date, integer, text) IS
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- 6. rpc_log_table_inventory_snapshot
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_log_table_inventory_snapshot(
  p_casino_id uuid,
  p_table_id uuid,
  p_snapshot_type text,
  p_chipset jsonb,
  p_verified_by uuid DEFAULT NULL,
  p_discrepancy_cents integer DEFAULT 0,
  p_note text DEFAULT NULL
) RETURNS table_inventory_snapshot
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_result table_inventory_snapshot;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Casino scope validation
  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot log table inventory snapshots', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  INSERT INTO public.table_inventory_snapshot (
    casino_id,
    table_id,
    snapshot_type,
    chipset,
    counted_by,
    verified_by,
    discrepancy_cents,
    note
  )
  VALUES (
    p_casino_id,
    p_table_id,
    p_snapshot_type,
    p_chipset,
    v_context_actor_id,
    p_verified_by,
    COALESCE(p_discrepancy_cents, 0),
    p_note
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_log_table_inventory_snapshot(uuid, uuid, text, jsonb, uuid, integer, text) IS
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- 7. rpc_move_player
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_move_player(
  p_casino_id uuid,
  p_slip_id uuid,
  p_new_table_id uuid,
  p_new_seat_number text DEFAULT NULL,
  p_average_bet numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_current_slip rating_slip;
  v_closed_slip rating_slip;
  v_new_slip rating_slip;
  v_source_table_id UUID;
  v_duration INTEGER;
  v_move_group_id UUID;
  v_accumulated_seconds INTEGER;
  v_source_seats TEXT[];
  v_dest_seats TEXT[];
  v_policy_snapshot JSONB;
  v_game_settings_jsonb JSONB;
  v_dest_table_type text;
  v_house_edge NUMERIC;
  v_decisions_per_hour INTEGER;
  v_points_conversion_rate NUMERIC;
  v_point_multiplier NUMERIC;
  v_min_bet NUMERIC;
  v_max_bet NUMERIC;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Casino scope validation
  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot move players', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- 1. LOCK AND VALIDATE CURRENT SLIP
  SELECT * INTO v_current_slip
  FROM rating_slip
  WHERE id = p_slip_id AND casino_id = p_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_slip.status = 'closed' THEN
    RAISE EXCEPTION 'RATING_SLIP_ALREADY_CLOSED' USING ERRCODE = 'P0003';
  END IF;

  v_source_table_id := v_current_slip.table_id;

  -- 2. VALIDATE DESTINATION SEAT AVAILABILITY
  IF p_new_seat_number IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM rating_slip
      WHERE table_id = p_new_table_id
        AND seat_number = p_new_seat_number
        AND status IN ('open', 'paused')
        AND casino_id = p_casino_id
    ) THEN
      RAISE EXCEPTION 'SEAT_OCCUPIED' USING ERRCODE = 'P0004';
    END IF;
  END IF;

  -- 3. CLOSE CURRENT SLIP WITH DURATION CALCULATION
  v_duration := EXTRACT(EPOCH FROM (now() - v_current_slip.start_time))::INTEGER;

  UPDATE rating_slip SET
    status = 'closed',
    end_time = now(),
    duration_seconds = v_duration,
    final_duration_seconds = v_duration,
    average_bet = COALESCE(p_average_bet, v_current_slip.average_bet),
    final_average_bet = COALESCE(p_average_bet, v_current_slip.average_bet)
  WHERE id = p_slip_id
  RETURNING * INTO v_closed_slip;

  -- 4. BUILD POLICY_SNAPSHOT FOR DESTINATION TABLE
  SELECT gt.type, gs.house_edge, gs.decisions_per_hour, gs.points_conversion_rate,
         gs.point_multiplier, gs.min_bet, gs.max_bet
  INTO v_dest_table_type, v_house_edge, v_decisions_per_hour, v_points_conversion_rate,
       v_point_multiplier, v_min_bet, v_max_bet
  FROM gaming_table gt
  LEFT JOIN game_settings gs
    ON gs.game_type = gt.type
    AND gs.casino_id = gt.casino_id
  WHERE gt.id = p_new_table_id
    AND gt.casino_id = p_casino_id;

  v_game_settings_jsonb := jsonb_build_object(
    'game_type', v_dest_table_type,
    'min_bet', COALESCE(v_min_bet, 25),
    'max_bet', COALESCE(v_max_bet, 5000),
    'house_edge', COALESCE(v_house_edge, 0.015)
  );

  v_policy_snapshot := jsonb_build_object(
    'loyalty', jsonb_build_object(
      'house_edge', COALESCE(v_house_edge, 1.5),
      'decisions_per_hour', COALESCE(v_decisions_per_hour, 70),
      'points_conversion_rate', COALESCE(v_points_conversion_rate, 10.0),
      'point_multiplier', COALESCE(v_point_multiplier, 1.0),
      'policy_version', 'loyalty_points_v1'
    ),
    '_source', jsonb_build_object(
      'house_edge', CASE WHEN v_house_edge IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'decisions_per_hour', CASE WHEN v_decisions_per_hour IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'points_conversion_rate', CASE WHEN v_points_conversion_rate IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'point_multiplier', CASE WHEN v_point_multiplier IS NOT NULL THEN 'game_settings' ELSE 'default' END
    ),
    '_move_context', jsonb_build_object(
      'from_slip_id', p_slip_id,
      'inherited_accrual_kind', v_current_slip.accrual_kind
    )
  );

  -- 5. CREATE NEW SLIP AT DESTINATION WITH CONTINUITY + POLICY SNAPSHOT
  v_move_group_id := COALESCE(v_current_slip.move_group_id, v_current_slip.id);
  v_accumulated_seconds := COALESCE(v_current_slip.accumulated_seconds, 0) + v_duration;

  INSERT INTO rating_slip (
    casino_id, visit_id, table_id, seat_number, status, start_time,
    previous_slip_id, move_group_id, accumulated_seconds, average_bet,
    game_settings, policy_snapshot, accrual_kind
  ) VALUES (
    p_casino_id,
    v_current_slip.visit_id,
    p_new_table_id,
    p_new_seat_number,
    'open',
    now(),
    p_slip_id,
    v_move_group_id,
    v_accumulated_seconds,
    p_average_bet,
    v_game_settings_jsonb,
    v_policy_snapshot,
    COALESCE(v_current_slip.accrual_kind, 'loyalty')
  )
  RETURNING * INTO v_new_slip;

  -- 6. GET UPDATED SEAT OCCUPANCY FOR BOTH TABLES
  SELECT ARRAY_AGG(seat_number ORDER BY seat_number) INTO v_source_seats
  FROM rating_slip
  WHERE table_id = v_source_table_id
    AND status IN ('open', 'paused')
    AND casino_id = p_casino_id
    AND seat_number IS NOT NULL;

  SELECT ARRAY_AGG(seat_number ORDER BY seat_number) INTO v_dest_seats
  FROM rating_slip
  WHERE table_id = p_new_table_id
    AND status IN ('open', 'paused')
    AND casino_id = p_casino_id
    AND seat_number IS NOT NULL;

  -- 7. AUDIT LOG
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (p_casino_id, 'rating_slip', v_context_actor_id, 'move', jsonb_build_object(
    'from_slip_id', p_slip_id,
    'to_slip_id', v_new_slip.id,
    'from_table_id', v_source_table_id,
    'to_table_id', p_new_table_id,
    'from_seat_number', v_current_slip.seat_number,
    'to_seat_number', p_new_seat_number,
    'accumulated_seconds', v_accumulated_seconds,
    'policy_snapshot_populated', true,
    'accrual_kind', v_new_slip.accrual_kind
  ));

  -- 8. RETURN ENHANCED RESPONSE
  RETURN jsonb_build_object(
    'closedSlipId', v_closed_slip.id,
    'newSlipId', v_new_slip.id,
    'moveGroupId', v_move_group_id,
    'accumulatedSeconds', v_accumulated_seconds,
    'sourceTableId', v_source_table_id,
    'sourceTableSeats', COALESCE(v_source_seats, ARRAY[]::TEXT[]),
    'destinationTableSeats', COALESCE(v_dest_seats, ARRAY[]::TEXT[]),
    'newSlip', jsonb_build_object(
      'id', v_new_slip.id,
      'tableId', v_new_slip.table_id,
      'seatNumber', v_new_slip.seat_number,
      'status', v_new_slip.status,
      'startTime', v_new_slip.start_time,
      'accrualKind', v_new_slip.accrual_kind
    )
  );
END;
$$;

COMMENT ON FUNCTION rpc_move_player(uuid, uuid, uuid, text, numeric) IS
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- 8. rpc_pause_rating_slip
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_pause_rating_slip(
  p_casino_id uuid,
  p_rating_slip_id uuid
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_actor_id uuid;
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_result rating_slip;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Casino scope validation
  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot pause rating slips', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- Lock and check state
  SELECT * INTO v_result
  FROM rating_slip
  WHERE id = p_rating_slip_id
  AND casino_id = p_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  IF v_result.status != 'open' THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_OPEN: Rating slip % is not in open state (status: %)',
      p_rating_slip_id, v_result.status;
  END IF;

  -- Update to paused state and record pause start
  UPDATE rating_slip
  SET
    status = 'paused',
    pause_intervals = array_append(
      COALESCE(pause_intervals, '{}'),
      tstzrange(now(), NULL)
    )
  WHERE id = p_rating_slip_id
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating_slip',
    v_context_actor_id,
    'pause',
    jsonb_build_object(
      'rating_slip_id', p_rating_slip_id,
      'pause_start_time', now(),
      'previous_status', 'open',
      'visit_id', v_result.visit_id
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_pause_rating_slip(uuid, uuid) IS
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- 9. rpc_request_table_credit
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_request_table_credit(
  p_casino_id uuid,
  p_table_id uuid,
  p_chipset jsonb,
  p_amount_cents integer,
  p_sent_by uuid,
  p_received_by uuid,
  p_slip_no text,
  p_request_id text
) RETURNS table_credit
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_result table_credit;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Casino scope validation
  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot request table credit', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  INSERT INTO public.table_credit (
    casino_id,
    table_id,
    chipset,
    amount_cents,
    authorized_by,
    sent_by,
    received_by,
    slip_no,
    request_id
  )
  VALUES (
    p_casino_id,
    p_table_id,
    p_chipset,
    p_amount_cents,
    v_context_actor_id,
    p_sent_by,
    p_received_by,
    p_slip_no,
    p_request_id
  )
  ON CONFLICT (casino_id, request_id) DO UPDATE
    SET received_by = EXCLUDED.received_by,
        amount_cents = EXCLUDED.amount_cents
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_request_table_credit(uuid, uuid, jsonb, integer, uuid, uuid, text, text) IS
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- 10. rpc_request_table_fill
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_request_table_fill(
  p_casino_id uuid,
  p_table_id uuid,
  p_chipset jsonb,
  p_amount_cents integer,
  p_delivered_by uuid,
  p_received_by uuid,
  p_slip_no text,
  p_request_id text
) RETURNS table_fill
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_result table_fill;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Casino scope validation
  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot request table fills', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  INSERT INTO public.table_fill (
    casino_id,
    table_id,
    chipset,
    amount_cents,
    requested_by,
    delivered_by,
    received_by,
    slip_no,
    request_id
  )
  VALUES (
    p_casino_id,
    p_table_id,
    p_chipset,
    p_amount_cents,
    v_context_actor_id,
    p_delivered_by,
    p_received_by,
    p_slip_no,
    p_request_id
  )
  ON CONFLICT (casino_id, request_id) DO UPDATE
    SET delivered_by = EXCLUDED.delivered_by,
        received_by = EXCLUDED.received_by,
        amount_cents = EXCLUDED.amount_cents
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_request_table_fill(uuid, uuid, jsonb, integer, uuid, uuid, text, text) IS
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- 11. rpc_resume_rating_slip
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_resume_rating_slip(
  p_casino_id uuid,
  p_rating_slip_id uuid
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_actor_id uuid;
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_result rating_slip;
  v_pause_range tstzrange;
  v_updated_intervals tstzrange[];
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Casino scope validation
  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot resume rating slips', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- Lock and check state
  SELECT * INTO v_result
  FROM rating_slip
  WHERE id = p_rating_slip_id
  AND casino_id = p_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  IF v_result.status != 'paused' THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_PAUSED: Rating slip % is not in paused state (status: %)',
      p_rating_slip_id, v_result.status;
  END IF;

  -- Close the most recent pause interval
  IF v_result.pause_intervals IS NOT NULL AND array_length(v_result.pause_intervals, 1) > 0 THEN
    v_pause_range := v_result.pause_intervals[array_length(v_result.pause_intervals, 1)];

    v_updated_intervals := v_result.pause_intervals;
    v_updated_intervals[array_length(v_updated_intervals, 1)] :=
      tstzrange(lower(v_pause_range), now());

    UPDATE rating_slip
    SET
      status = 'open',
      pause_intervals = v_updated_intervals
    WHERE id = p_rating_slip_id
    RETURNING * INTO v_result;

  ELSE
    RAISE EXCEPTION 'PAUSE_INTERVAL_NOT_FOUND: No pause intervals found for paused slip %', p_rating_slip_id;
  END IF;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating_slip',
    v_context_actor_id,
    'resume',
    jsonb_build_object(
      'rating_slip_id', p_rating_slip_id,
      'pause_end_time', now(),
      'previous_status', 'paused',
      'visit_id', v_result.visit_id,
      'pause_duration_seconds', EXTRACT(EPOCH FROM (now() - lower(v_pause_range)))::int
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_resume_rating_slip(uuid, uuid) IS
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- 12. rpc_update_table_status
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_update_table_status(
  p_casino_id uuid,
  p_table_id uuid,
  p_new_status table_status
) RETURNS gaming_table
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_current_status table_status;
  v_result gaming_table;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Casino scope validation
  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: context is % but caller provided %',
      v_context_casino_id, p_casino_id;
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot update table status', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- Get current status with row lock
  SELECT status INTO v_current_status
  FROM gaming_table
  WHERE id = p_table_id AND casino_id = p_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Table % not found', p_table_id;
  END IF;

  -- Validate state transition
  IF NOT (
    (v_current_status = 'inactive' AND p_new_status = 'active') OR
    (v_current_status = 'active' AND p_new_status IN ('inactive', 'closed'))
  ) THEN
    RAISE EXCEPTION 'TABLE_INVALID_TRANSITION: Cannot transition from % to %',
      v_current_status, p_new_status;
  END IF;

  -- Update status
  UPDATE gaming_table
  SET status = p_new_status
  WHERE id = p_table_id AND casino_id = p_casino_id
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'table-context',
    v_context_actor_id,
    'update_table_status',
    jsonb_build_object(
      'table_id', p_table_id,
      'from_status', v_current_status,
      'to_status', p_new_status
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_update_table_status(uuid, uuid, table_status) IS
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context injection.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

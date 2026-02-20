-- ============================================================================
-- Migration: SEC-REMEDIATION P0 — Actor ID Bypass Removal + Role Gate
-- Created: 2026-02-20
-- Audit Reference: SEC-AUDIT-2026-02-19 RLS Violations Matrix
-- Findings: C-1, C-2 (CRITICAL), H-4 (HIGH)
-- ADR References: ADR-024 (INV-7, INV-8), ADR-018 (SECURITY DEFINER governance)
-- ============================================================================
--
-- PURPOSE
-- ~~~~~~~
-- Remove CRITICAL p_actor_id bypass from two RPCs and add role gate to a third:
--
--   C-1: rpc_create_pit_cash_observation — DROP 9-param (p_actor_id),
--        CREATE 8-param with unconditional set_rls_context_from_staff().
--        GRANT: authenticated only (no service_role — no server-side callers).
--
--   C-2: rpc_log_table_buyin_telemetry — DROP 10-param (p_actor_id),
--        CREATE 9-param with unconditional set_rls_context_from_staff().
--        Also: amount_cents validation <> 0 (supports negative RATED_ADJUSTMENT),
--        telemetry_kind expanded to include 'RATED_ADJUSTMENT'.
--        GRANT: authenticated only (no service_role).
--
--   H-4: rpc_enroll_player — CREATE OR REPLACE (body-only, no signature change).
--        Add role gate: pit_boss or admin only.
--
-- DECISION 2: DROP+CREATE (not CREATE OR REPLACE) for C-1/C-2 because param
--   count change creates second overload in PostgreSQL.
--
-- PRE-MIGRATION VERIFICATION (Audit Fix #5):
--   Confirmed: No production callers in app/, lib/, services/ use service_role
--   for rpc_create_pit_cash_observation or rpc_log_table_buyin_telemetry.
--   Only test files (__tests__/) reference these RPCs with p_actor_id.
--
-- RISK: Integration tests that pass p_actor_id will break (expected).
--   WS3 refactors those tests immediately after this migration.
-- ============================================================================

BEGIN;

-- ============================================================================
-- C-1: rpc_create_pit_cash_observation — DROP old 9-param, CREATE new 8-param
-- ============================================================================

-- DROP old signature (includes p_actor_id as 9th param)
DROP FUNCTION IF EXISTS public.rpc_create_pit_cash_observation(
  uuid, numeric, uuid, observation_amount_kind, observation_source, timestamptz, text, text, uuid
);

-- CREATE new 8-param signature (p_actor_id removed entirely)
CREATE FUNCTION public.rpc_create_pit_cash_observation(
  p_visit_id uuid,
  p_amount numeric,
  p_rating_slip_id uuid DEFAULT NULL,
  p_amount_kind observation_amount_kind DEFAULT 'estimate',
  p_source observation_source DEFAULT 'walk_with',
  p_observed_at timestamptz DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS pit_cash_observation
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_visit_record RECORD;
  v_player_id uuid;
  v_normalized_idempotency_key text;
  v_existing_record pit_cash_observation%ROWTYPE;
  v_result pit_cash_observation%ROWTYPE;
BEGIN
  -- =======================================================================
  -- ADR-024: Unconditional Context Injection (no p_actor_id bypass)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Staff identity not found in context. Ensure you are logged in as an active staff member.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Casino context not established. Staff must be assigned to a casino.'
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Authorization Check
  -- =======================================================================
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role "%" is not authorized to create pit cash observations. Required: pit_boss, cashier, or admin.',
      COALESCE(v_context_staff_role, 'none')
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Input Validation
  -- =======================================================================
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Amount must be greater than 0. Received: %',
      COALESCE(p_amount::text, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  IF p_visit_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: visit_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Visit Validation
  -- =======================================================================
  SELECT id, casino_id, player_id
  INTO v_visit_record
  FROM public.visit
  WHERE id = p_visit_id;

  IF v_visit_record IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Visit % not found', p_visit_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_visit_record.casino_id <> v_context_casino_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Visit % does not belong to your casino', p_visit_id
      USING ERRCODE = 'P0001';
  END IF;

  v_player_id := v_visit_record.player_id;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_STATE: Visit % has no associated player', p_visit_id
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Rating Slip Validation (if provided)
  -- =======================================================================
  IF p_rating_slip_id IS NOT NULL THEN
    PERFORM 1
    FROM public.rating_slip
    WHERE id = p_rating_slip_id
      AND visit_id = p_visit_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_INPUT: Rating slip % does not belong to visit %',
        p_rating_slip_id, p_visit_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- =======================================================================
  -- Idempotency Handling
  -- =======================================================================
  v_normalized_idempotency_key := NULLIF(TRIM(p_idempotency_key), '');

  IF v_normalized_idempotency_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_record
    FROM public.pit_cash_observation
    WHERE casino_id = v_context_casino_id
      AND idempotency_key = v_normalized_idempotency_key;

    IF FOUND THEN
      RETURN v_existing_record;
    END IF;
  END IF;

  -- =======================================================================
  -- Insert New Record
  -- =======================================================================
  INSERT INTO public.pit_cash_observation (
    casino_id,
    player_id,
    visit_id,
    rating_slip_id,
    amount,
    amount_kind,
    source,
    observed_at,
    created_by_staff_id,
    note,
    idempotency_key
  ) VALUES (
    v_context_casino_id,
    v_player_id,
    p_visit_id,
    p_rating_slip_id,
    p_amount,
    p_amount_kind,
    p_source,
    COALESCE(p_observed_at, now()),
    v_context_actor_id,
    p_note,
    v_normalized_idempotency_key
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- ADR-018: Explicit grants (authenticated only — no service_role)
REVOKE ALL ON FUNCTION public.rpc_create_pit_cash_observation(
  uuid, numeric, uuid, observation_amount_kind, observation_source, timestamptz, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_create_pit_cash_observation(
  uuid, numeric, uuid, observation_amount_kind, observation_source, timestamptz, text, text
) TO authenticated;

COMMENT ON FUNCTION public.rpc_create_pit_cash_observation(
  uuid, numeric, uuid, observation_amount_kind, observation_source, timestamptz, text, text
) IS 'SEC-REMEDIATION C-1: Create pit cash observation. '
  'SECURITY DEFINER with unconditional set_rls_context_from_staff() (ADR-024 INV-7). '
  'p_actor_id REMOVED — no bypass path (ADR-024 INV-8). '
  'Role authorization: pit_boss, cashier, admin.';


-- ============================================================================
-- C-2: rpc_log_table_buyin_telemetry — DROP old overloads, CREATE new 9-param
-- ============================================================================

-- DROP old 10-param signature (includes p_actor_id + p_source, from migration 20260115000201)
DROP FUNCTION IF EXISTS public.rpc_log_table_buyin_telemetry(
  uuid, bigint, text, uuid, uuid, text, text, text, uuid, text
);

-- DROP old 9-param signature (includes p_actor_id, from migration 20260114004141)
DROP FUNCTION IF EXISTS public.rpc_log_table_buyin_telemetry(
  uuid, bigint, text, uuid, uuid, text, text, text, uuid
);

-- CREATE new 9-param signature (p_actor_id removed, amount_cents <> 0, RATED_ADJUSTMENT added)
CREATE FUNCTION public.rpc_log_table_buyin_telemetry(
  p_table_id uuid,
  p_amount_cents bigint,
  p_telemetry_kind text,
  p_visit_id uuid DEFAULT NULL,
  p_rating_slip_id uuid DEFAULT NULL,
  p_tender_type text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_source text DEFAULT 'manual_ops'
) RETURNS table_buyin_telemetry
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_table_casino_id uuid;
  v_gaming_day date;
  v_normalized_idempotency_key text;
  v_existing_record table_buyin_telemetry%ROWTYPE;
  v_result table_buyin_telemetry%ROWTYPE;
BEGIN
  -- =======================================================================
  -- ADR-024: Unconditional Context Injection (no p_actor_id bypass)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Staff identity not found in context. Ensure you are logged in as an active staff member.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Casino context not established. Staff must be assigned to a casino.'
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Authorization Check
  -- =======================================================================
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'floor_supervisor', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role "%" is not authorized to log buy-in telemetry. Required: pit_boss, floor_supervisor, or admin.',
      COALESCE(v_context_staff_role, 'none')
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Input Validation (C-2: amount_cents <> 0, RATED_ADJUSTMENT added)
  -- =======================================================================
  IF p_amount_cents IS NULL OR p_amount_cents = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: amount_cents must be non-zero. Received: %',
      COALESCE(p_amount_cents::text, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  IF p_table_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: table_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate telemetry_kind (expanded to include RATED_ADJUSTMENT)
  IF p_telemetry_kind IS NULL OR p_telemetry_kind NOT IN ('RATED_BUYIN', 'GRIND_BUYIN', 'RATED_ADJUSTMENT') THEN
    RAISE EXCEPTION 'INVALID_INPUT: telemetry_kind must be RATED_BUYIN, GRIND_BUYIN, or RATED_ADJUSTMENT. Received: %',
      COALESCE(p_telemetry_kind, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate RATED_BUYIN and RATED_ADJUSTMENT linkage
  IF p_telemetry_kind IN ('RATED_BUYIN', 'RATED_ADJUSTMENT') THEN
    IF p_visit_id IS NULL OR p_rating_slip_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: % requires both visit_id and rating_slip_id',
        p_telemetry_kind
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Validate GRIND_BUYIN no-linkage
  IF p_telemetry_kind = 'GRIND_BUYIN' THEN
    IF p_visit_id IS NOT NULL OR p_rating_slip_id IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: GRIND_BUYIN must not have visit_id or rating_slip_id'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- =======================================================================
  -- Validate source parameter
  -- =======================================================================
  IF p_source IS NOT NULL AND p_source NOT IN ('finance_bridge', 'manual_ops') THEN
    RAISE EXCEPTION 'INVALID_INPUT: source must be finance_bridge or manual_ops. Received: %',
      p_source
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Table Validation
  -- =======================================================================
  SELECT gt.casino_id
  INTO v_table_casino_id
  FROM public.gaming_table gt
  WHERE gt.id = p_table_id;

  IF v_table_casino_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Table % not found', p_table_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_table_casino_id <> v_context_casino_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Table % does not belong to your casino', p_table_id
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Visit Validation (if provided)
  -- =======================================================================
  IF p_visit_id IS NOT NULL THEN
    PERFORM 1
    FROM public.visit v
    WHERE v.id = p_visit_id
      AND v.casino_id = v_context_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND: Visit % not found or does not belong to your casino', p_visit_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- =======================================================================
  -- Rating Slip Validation (if provided)
  -- =======================================================================
  IF p_rating_slip_id IS NOT NULL THEN
    PERFORM 1
    FROM public.rating_slip rs
    WHERE rs.id = p_rating_slip_id
      AND rs.visit_id = p_visit_id
      AND rs.table_id = p_table_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_INPUT: Rating slip % does not belong to visit % at table %',
        p_rating_slip_id, p_visit_id, p_table_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- =======================================================================
  -- Compute Gaming Day
  -- =======================================================================
  v_gaming_day := compute_gaming_day(v_context_casino_id, now());

  -- =======================================================================
  -- Idempotency Handling
  -- =======================================================================
  v_normalized_idempotency_key := NULLIF(TRIM(p_idempotency_key), '');

  IF v_normalized_idempotency_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_record
    FROM public.table_buyin_telemetry
    WHERE casino_id = v_context_casino_id
      AND idempotency_key = v_normalized_idempotency_key;

    IF FOUND THEN
      RETURN v_existing_record;
    END IF;
  END IF;

  -- =======================================================================
  -- Insert New Record
  -- =======================================================================
  INSERT INTO public.table_buyin_telemetry (
    casino_id,
    gaming_day,
    table_id,
    visit_id,
    rating_slip_id,
    amount_cents,
    telemetry_kind,
    tender_type,
    occurred_at,
    actor_id,
    note,
    idempotency_key,
    source
  ) VALUES (
    v_context_casino_id,
    v_gaming_day,
    p_table_id,
    p_visit_id,
    p_rating_slip_id,
    p_amount_cents,
    p_telemetry_kind,
    p_tender_type,
    now(),
    v_context_actor_id,
    p_note,
    v_normalized_idempotency_key,
    COALESCE(p_source, 'manual_ops')
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- ADR-018: Explicit grants (authenticated only — no service_role)
REVOKE ALL ON FUNCTION public.rpc_log_table_buyin_telemetry(
  uuid, bigint, text, uuid, uuid, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_log_table_buyin_telemetry(
  uuid, bigint, text, uuid, uuid, text, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.rpc_log_table_buyin_telemetry(
  uuid, bigint, text, uuid, uuid, text, text, text, text
) IS 'SEC-REMEDIATION C-2: Log buy-in telemetry (RATED_BUYIN, GRIND_BUYIN, RATED_ADJUSTMENT). '
  'SECURITY DEFINER with unconditional set_rls_context_from_staff() (ADR-024 INV-7). '
  'p_actor_id REMOVED — no bypass path (ADR-024 INV-8). '
  'C-2: amount_cents <> 0 (supports negative RATED_ADJUSTMENT). '
  'Role authorization: pit_boss, floor_supervisor, admin.';


-- ============================================================================
-- H-4: rpc_enroll_player — Add role gate (pit_boss, admin)
-- ============================================================================
-- CREATE OR REPLACE: body-only change, no signature change.
-- Adds role gate after context injection per ADR-024.

CREATE OR REPLACE FUNCTION public.rpc_enroll_player(
  p_player_id uuid
)
RETURNS TABLE (player_id uuid, casino_id uuid, status text, enrolled_at timestamptz, enrolled_by uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id  uuid;
  v_actor_id   uuid;
  v_staff_role text;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CONTEXT INJECTION (INV-7: all client-callable RPCs must call this)
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM public.set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  -- ═══════════════════════════════════════════════════════════════════════
  -- H-4: ROLE GATE — pit_boss or admin only (ADR-024)
  -- ═══════════════════════════════════════════════════════════════════════
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF v_staff_role IS NULL OR v_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role "%" not authorized for player enrollment. Required: pit_boss or admin.',
      COALESCE(v_staff_role, 'none')
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INPUT VALIDATION
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'player_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.player p WHERE p.id = p_player_id) THEN
    RAISE EXCEPTION 'Player not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- UPSERT player_casino
  -- ═══════════════════════════════════════════════════════════════════════
  RETURN QUERY
  INSERT INTO public.player_casino (
    player_id, casino_id, enrolled_by, status
  ) VALUES (
    p_player_id,
    v_casino_id,
    v_actor_id,
    'active'
  )
  ON CONFLICT (player_id, casino_id)
  DO UPDATE SET
    status = 'active',
    enrolled_by = v_actor_id,
    enrolled_at = now()
  RETURNING
    player_casino.player_id,
    player_casino.casino_id,
    player_casino.status::text,
    player_casino.enrolled_at,
    player_casino.enrolled_by;
END;
$$;

COMMENT ON FUNCTION public.rpc_enroll_player(uuid) IS
  'SEC-REMEDIATION H-4: Enroll/re-enroll player in casino. '
  'SECURITY DEFINER with set_rls_context_from_staff() (ADR-024 INV-7). '
  'H-4 role gate: pit_boss or admin only. '
  'Derives casino_id from context (INV-8). UPSERT with explicit column semantics.';


-- ============================================================================
-- NOTIFY POSTGREST
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- POST-MIGRATION CATALOG ASSERTION (run manually to verify)
-- ============================================================================
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS identity_args
-- FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('rpc_create_pit_cash_observation', 'rpc_log_table_buyin_telemetry')
--   AND pg_get_function_identity_arguments(p.oid) ILIKE '%p_actor_id%';
-- Must return 0 rows

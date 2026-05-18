-- PRD-081 Wave 2 — WS3_PRODUCER_B: Class B Exemplar Producer
-- Creates rpc_record_grind_observation: atomic table_buyin_telemetry + finance_outbox INSERT.
-- Updates rpc_log_table_buyin_telemetry compat wrapper to route GRIND_BUYIN to new atomic RPC.
-- After this migration, no second independent GRIND_BUYIN write path exists.
-- DEC-Q4: outbox INSERT is RPC-coupled, not trigger-based.

BEGIN;

-- ============================================================================
-- 1. New atomic RPC: rpc_record_grind_observation
-- ============================================================================
-- Class B exemplar: inserts into table_buyin_telemetry + finance_outbox atomically
-- in the same PL/pgSQL transaction boundary.
-- event_type hardcoded to 'grind.observed' (vertical-collapse exemplar — single event type).
-- buyin.observed cataloged in INT-002 for future producer slices; not emitted here.
-- player_id unconditionally NULL (ADR-052 R5 — Class B Telemetry Facts have no player identity).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_record_grind_observation(
  p_table_id     UUID,
  p_amount_cents BIGINT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id  uuid;
  v_staff_role text;
  v_gaming_day date;
  v_grind_id   uuid;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context derivation (no client-supplied identity)
  -- =======================================================================
  PERFORM public.set_rls_context_from_staff();

  v_casino_id  := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Casino context not established. Staff must be assigned to a casino.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Staff identity not found in context.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_staff_role IS NULL OR v_staff_role NOT IN ('pit_boss', 'floor_supervisor', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role "%" is not authorized to record grind observations. Required: pit_boss, floor_supervisor, or admin.',
      COALESCE(v_staff_role, 'none')
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Input Validation
  -- =======================================================================
  IF p_table_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: table_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: amount_cents must be non-zero. Received: %',
      COALESCE(p_amount_cents::text, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Same-casino table validation
  -- =======================================================================
  PERFORM 1
  FROM public.gaming_table gt
  WHERE gt.id = p_table_id
    AND gt.casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_INPUT: table_id % does not belong to this casino', p_table_id
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Derive gaming day (Layer 2: compute_gaming_day(casino_id, ts))
  -- =======================================================================
  v_gaming_day := public.compute_gaming_day(v_casino_id, NOW());

  -- =======================================================================
  -- Atomic INSERT: table_buyin_telemetry + finance_outbox in same transaction
  -- (DEC-Q4: RPC-coupled insertion — not trigger-based)
  -- =======================================================================

  INSERT INTO public.table_buyin_telemetry (
    casino_id,
    gaming_day,
    table_id,
    amount_cents,
    telemetry_kind,
    event_type,
    occurred_at,
    actor_id
  ) VALUES (
    v_casino_id,
    v_gaming_day,
    p_table_id,
    p_amount_cents,
    'GRIND_BUYIN',
    'grind.observed',
    NOW(),
    v_actor_id
  )
  RETURNING id INTO v_grind_id;

  INSERT INTO public.finance_outbox (
    event_id,
    event_type,
    fact_class,
    origin_label,
    casino_id,
    table_id,
    player_id,
    aggregate_id,
    payload,
    created_at
  ) VALUES (
    public.generate_uuid_v7(),
    'grind.observed',
    'operational',
    'estimated',
    v_casino_id,
    p_table_id,
    NULL,
    v_grind_id,
    jsonb_build_object('amount_cents', p_amount_cents),
    NOW()
  );

  RETURN v_grind_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_record_grind_observation(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_record_grind_observation(UUID, BIGINT) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_record_grind_observation(UUID, BIGINT)
  IS 'PRD-081 Wave 2 — Class B exemplar producer. '
     'Inserts into table_buyin_telemetry (telemetry_kind=GRIND_BUYIN, event_type=grind.observed) '
     'and finance_outbox atomically in one PL/pgSQL transaction boundary. '
     'player_id unconditionally NULL (ADR-052 R5). '
     'event_type hardcoded to grind.observed — vertical-collapse exemplar, single event type. '
     'buyin.observed cataloged in INT-002 for future slices; not emitted by this function. '
     'DEC-Q4: RPC-coupled insertion, not trigger-based.';


-- ============================================================================
-- 2. Compat wrapper: rpc_log_table_buyin_telemetry
-- ============================================================================
-- GRIND_BUYIN calls now route to rpc_record_grind_observation.
-- RATED_BUYIN and RATED_ADJUSTMENT retain existing behavior with event_type added
-- to satisfy the Wave 2 NOT NULL constraint on table_buyin_telemetry.event_type.
-- No second independent GRIND_BUYIN write path remains after this migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_log_table_buyin_telemetry(
  p_table_id        uuid,
  p_amount_cents    bigint,
  p_telemetry_kind  text,
  p_visit_id        uuid    DEFAULT NULL,
  p_rating_slip_id  uuid    DEFAULT NULL,
  p_tender_type     text    DEFAULT NULL,
  p_note            text    DEFAULT NULL,
  p_idempotency_key text    DEFAULT NULL,
  p_source          text    DEFAULT 'manual_ops'
)
RETURNS table_buyin_telemetry
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_context_casino_id         uuid;
  v_context_actor_id          uuid;
  v_context_staff_role        text;
  v_table_casino_id           uuid;
  v_gaming_day                date;
  v_normalized_idempotency_key text;
  v_existing_record           table_buyin_telemetry%ROWTYPE;
  v_result                    table_buyin_telemetry%ROWTYPE;
  v_grind_id                  uuid;
BEGIN
  -- =======================================================================
  -- ADR-024: Unconditional Context Injection (SEC-REMEDIATION C-2: no p_actor_id bypass)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_context_casino_id  := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id   := NULLIF(current_setting('app.actor_id', true), '')::uuid;
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
  -- Input Validation (C-2: amount_cents <> 0)
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

  IF p_telemetry_kind IS NULL OR p_telemetry_kind NOT IN ('RATED_BUYIN', 'GRIND_BUYIN', 'RATED_ADJUSTMENT') THEN
    RAISE EXCEPTION 'INVALID_INPUT: telemetry_kind must be RATED_BUYIN, GRIND_BUYIN, or RATED_ADJUSTMENT. Received: %',
      COALESCE(p_telemetry_kind, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  IF p_telemetry_kind IN ('RATED_BUYIN', 'RATED_ADJUSTMENT') THEN
    IF p_visit_id IS NULL OR p_rating_slip_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: % requires both visit_id and rating_slip_id',
        p_telemetry_kind
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_telemetry_kind = 'GRIND_BUYIN' THEN
    IF p_visit_id IS NOT NULL OR p_rating_slip_id IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: GRIND_BUYIN must not have visit_id or rating_slip_id'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_source IS NOT NULL AND p_source NOT IN ('finance_bridge', 'manual_ops') THEN
    RAISE EXCEPTION 'INVALID_INPUT: source must be finance_bridge or manual_ops. Received: %',
      p_source
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- Table Validation
  -- =======================================================================
  SELECT gt.casino_id INTO v_table_casino_id
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
  -- GRIND_BUYIN: Route to atomic rpc_record_grind_observation
  -- =======================================================================
  -- Idempotency check for GRIND_BUYIN (preserve legacy caller behavior)
  IF p_telemetry_kind = 'GRIND_BUYIN' THEN
    v_normalized_idempotency_key := NULLIF(TRIM(p_idempotency_key), '');

    IF v_normalized_idempotency_key IS NOT NULL THEN
      SELECT * INTO v_existing_record
      FROM public.table_buyin_telemetry
      WHERE casino_id = v_context_casino_id
        AND idempotency_key = v_normalized_idempotency_key;

      IF FOUND THEN
        RETURN v_existing_record;
      END IF;
    END IF;

    -- Route to new atomic RPC (handles table_buyin_telemetry + finance_outbox atomically)
    v_grind_id := public.rpc_record_grind_observation(p_table_id, p_amount_cents);

    SELECT * INTO v_result FROM public.table_buyin_telemetry WHERE id = v_grind_id;
    RETURN v_result;
  END IF;

  -- =======================================================================
  -- RATED_BUYIN / RATED_ADJUSTMENT: existing path with event_type added
  -- =======================================================================
  v_gaming_day := compute_gaming_day(v_context_casino_id, now());

  v_normalized_idempotency_key := NULLIF(TRIM(p_idempotency_key), '');

  IF v_normalized_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_record
    FROM public.table_buyin_telemetry
    WHERE casino_id = v_context_casino_id
      AND idempotency_key = v_normalized_idempotency_key;

    IF FOUND THEN
      RETURN v_existing_record;
    END IF;
  END IF;

  INSERT INTO public.table_buyin_telemetry (
    casino_id,
    gaming_day,
    table_id,
    visit_id,
    rating_slip_id,
    amount_cents,
    telemetry_kind,
    event_type,
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
    'buyin.observed',
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

REVOKE ALL ON FUNCTION public.rpc_log_table_buyin_telemetry(
  uuid, bigint, text, uuid, uuid, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_log_table_buyin_telemetry(
  uuid, bigint, text, uuid, uuid, text, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.rpc_log_table_buyin_telemetry(uuid, bigint, text, uuid, uuid, text, text, text, text)
  IS 'PRD-081 Wave 2 compat wrapper: GRIND_BUYIN routes to rpc_record_grind_observation (atomic outbox + telemetry). '
     'RATED_BUYIN and RATED_ADJUSTMENT retain existing behavior with event_type=buyin.observed added. '
     'No second independent GRIND_BUYIN write path remains. '
     'SEC-REMEDIATION C-2: unconditional set_rls_context_from_staff(), no p_actor_id bypass.';

COMMIT;

NOTIFY pgrst, 'reload schema';

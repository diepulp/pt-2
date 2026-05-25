-- Gate A Step 3 — Amend all 5 producers to pass gaming_day to 9-param fn_finance_outbox_emit
-- (PRD-087 WS1A M3)
--
-- Changes:
--   1. Pre-state assertion: privilege triangle check for rpc_create_financial_txn
--   2. rpc_create_financial_txn: SECURITY INVOKER → SECURITY DEFINER (closes privilege triangle)
--      + pass v_row.gaming_day as 9th param
--   3. rpc_record_grind_observation: pass v_gaming_day (already computed) as 9th param
--   4. rpc_create_financial_adjustment: pass v_row.gaming_day as 9th param
--   5. rpc_request_table_fill: compute v_gaming_day + pass as 9th param
--   6. rpc_request_table_credit: compute v_gaming_day + pass as 9th param
--   7. Post-state assertions: privilege triangle closed + 9-param fn present
--
-- Privilege triangle rationale:
--   fn_finance_outbox_emit EXECUTE is service_role-only (Phase 2.2 hardening).
--   rpc_create_financial_txn is SECURITY INVOKER — when authenticated calls it,
--   it runs as authenticated and cannot EXECUTE fn_finance_outbox_emit.
--   Fix: upgrade rpc_create_financial_txn to SECURITY DEFINER + SET search_path = ''.
--   This closes the triangle: authenticated → DEFINER rpc → service_role fn.

BEGIN;

-- Pre-state assertion: 9-param fn_finance_outbox_emit must exist (M2 must have applied)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_finance_outbox_emit'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid)
        = 'p_event_id uuid, p_event_type text, p_fact_class text, p_origin_label text, p_table_id uuid, p_player_id uuid, p_aggregate_id uuid, p_payload jsonb, p_gaming_day date'
  ) THEN
    RAISE EXCEPTION
      'PRE-STATE FAIL: 9-param fn_finance_outbox_emit not found. Apply M2 before M3.';
  END IF;

  -- Privilege triangle check: rpc_create_financial_txn must be identified for upgrade
  -- If it is SECURITY INVOKER and authenticated can execute it, the triangle is open.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_create_financial_txn'
      AND p.prosecdef IS FALSE  -- SECURITY INVOKER
  ) AND has_function_privilege(
    'authenticated',
    'public.rpc_create_financial_txn(uuid,uuid,numeric,financial_direction,financial_source,text,uuid,uuid,text,timestamp with time zone,text)',
    'EXECUTE'
  ) THEN
    -- Triangle is open — this migration closes it by upgrading to SECURITY DEFINER below.
    RAISE NOTICE 'PRIVILEGE TRIANGLE OPEN: rpc_create_financial_txn is SECURITY INVOKER + authenticated has EXECUTE. Closing triangle via SECURITY DEFINER upgrade in this migration.';
  END IF;
END;
$$;

-- ===========================================================================
-- 1. rpc_create_financial_txn — SECURITY INVOKER → SECURITY DEFINER (closes
--    privilege triangle) + pass v_row.gaming_day as 9th param to fn emit.
--    All objects fully qualified (SET search_path = '').
--    Semantics preserved exactly from Phase 2.1 (20260517234015).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.rpc_create_financial_txn(
  p_player_id               uuid,
  p_visit_id                uuid,
  p_amount                  numeric,
  p_direction               public.financial_direction,
  p_source                  public.financial_source,
  p_tender_type             text                     DEFAULT NULL::text,
  p_rating_slip_id          uuid                     DEFAULT NULL::uuid,
  p_related_transaction_id  uuid                     DEFAULT NULL::uuid,
  p_idempotency_key         text                     DEFAULT NULL::text,
  p_created_at              timestamp with time zone DEFAULT now(),
  p_external_ref            text                     DEFAULT NULL::text
)
RETURNS public.player_financial_transaction
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_casino_id  uuid;
  v_actor_id   uuid;
  v_staff_role text;
  v_row        public.player_financial_transaction%ROWTYPE;
  v_table_id   uuid;
BEGIN
  -- ADR-024 + ADR-040: authoritative context injection
  PERFORM public.set_rls_context_from_staff();

  v_casino_id  := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id',  true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'SEC-007: casino context missing';
  END IF;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'SEC-007: actor context missing';
  END IF;

  IF v_staff_role IS NULL OR v_staff_role NOT IN ('cashier', 'pit_boss', 'admin') THEN
    RAISE EXCEPTION 'unauthorized: staff_role=% is not permitted to create financial transactions', v_staff_role;
  END IF;

  IF v_staff_role = 'pit_boss' THEN
    IF p_direction != 'in' THEN
      RAISE EXCEPTION 'pit_boss can only create buy-in transactions (direction=in)';
    END IF;
    IF p_tender_type NOT IN ('cash', 'chips') THEN
      RAISE EXCEPTION 'pit_boss can only use cash or chips for buy-ins';
    END IF;
  END IF;

  INSERT INTO public.player_financial_transaction AS t (
    id, player_id, casino_id, visit_id, rating_slip_id, amount, direction, source,
    tender_type, created_by_staff_id, related_transaction_id, created_at,
    idempotency_key, external_ref
  )
  VALUES (
    gen_random_uuid(), p_player_id, v_casino_id, p_visit_id, p_rating_slip_id,
    p_amount, p_direction, p_source, p_tender_type, v_actor_id,
    p_related_transaction_id, COALESCE(p_created_at, now()),
    p_idempotency_key, p_external_ref
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING t.* INTO v_row;

  IF v_row.id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_row
      FROM public.player_financial_transaction
     WHERE casino_id       = v_casino_id
       AND idempotency_key = p_idempotency_key;
  END IF;

  -- ADR-057 Class A table-anchor eligibility check (unchanged)
  IF p_rating_slip_id IS NULL THEN
    RETURN v_row;
  END IF;

  SELECT rs.table_id INTO v_table_id
    FROM public.rating_slip rs
   WHERE rs.id        = p_rating_slip_id
     AND rs.casino_id = v_casino_id;

  IF v_table_id IS NULL THEN
    RAISE EXCEPTION
      'INVALID_INPUT: rating_slip_id % does not resolve to a same-casino table. '
      'Financial write rejected. No outbox row emitted.', p_rating_slip_id
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.finance_outbox WHERE aggregate_id = v_row.id
  ) THEN
    RETURN v_row;
  END IF;

  -- Route through governed helper — pass gaming_day from PFT trigger-computed value
  PERFORM public.fn_finance_outbox_emit(
    public.generate_uuid_v7(),
    'buyin.recorded',
    'ledger',
    'actual',
    v_table_id,
    v_row.player_id,
    v_row.id,
    jsonb_build_object('amount', v_row.amount, 'tender_type', v_row.tender_type),
    v_row.gaming_day
  );

  RETURN v_row;
END;
$function$;

REVOKE ALL    ON FUNCTION public.rpc_create_financial_txn(
  uuid, uuid, numeric, public.financial_direction, public.financial_source,
  text, uuid, uuid, text, timestamp with time zone, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_create_financial_txn(
  uuid, uuid, numeric, public.financial_direction, public.financial_source,
  text, uuid, uuid, text, timestamp with time zone, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_create_financial_txn(
  uuid, uuid, numeric, public.financial_direction, public.financial_source,
  text, uuid, uuid, text, timestamp with time zone, text
) IS
  'PRD-087 WS1A Gate A M3: upgraded SECURITY DEFINER (closes privilege triangle). '
  'Passes v_row.gaming_day (trigger-computed from PFT INSERT) to fn_finance_outbox_emit. '
  'All semantics preserved from Phase 2.1 (20260517234015). '
  'ADR-024 + ADR-040: context from set_rls_context_from_staff().';

-- ===========================================================================
-- 2. rpc_record_grind_observation — pass v_gaming_day (already computed) as 9th param.
--    Already SECURITY DEFINER. No security posture change.
-- ===========================================================================
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
  v_casino_id  uuid;
  v_actor_id   uuid;
  v_staff_role text;
  v_gaming_day date;
  v_grind_id   uuid;
BEGIN
  PERFORM public.set_rls_context_from_staff();

  v_casino_id  := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id',  true), '')::uuid;
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

  IF p_table_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: table_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: amount_cents must be non-zero. Received: %',
      COALESCE(p_amount_cents::text, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1
    FROM public.gaming_table gt
   WHERE gt.id        = p_table_id
     AND gt.casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_INPUT: table_id % does not belong to this casino', p_table_id
      USING ERRCODE = 'P0001';
  END IF;

  v_gaming_day := public.compute_gaming_day(v_casino_id, NOW());

  INSERT INTO public.table_buyin_telemetry (
    casino_id, gaming_day, table_id, amount_cents,
    telemetry_kind, event_type, occurred_at, actor_id
  ) VALUES (
    v_casino_id, v_gaming_day, p_table_id, p_amount_cents,
    'GRIND_BUYIN', 'grind.observed', NOW(), v_actor_id
  )
  RETURNING id INTO v_grind_id;

  -- Pass v_gaming_day as 9th param (computed above, same value stored in telemetry row)
  PERFORM public.fn_finance_outbox_emit(
    public.generate_uuid_v7(),
    'grind.observed',
    'operational',
    'estimated',
    p_table_id,
    NULL,
    v_grind_id,
    jsonb_build_object('amount_cents', p_amount_cents),
    v_gaming_day
  );

  RETURN v_grind_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.rpc_record_grind_observation(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_record_grind_observation(UUID, BIGINT) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_record_grind_observation(UUID, BIGINT) IS
  'PRD-087 WS1A Gate A M3: passes v_gaming_day to 9-param fn_finance_outbox_emit. '
  'PRD-081 Wave 2 — Class B exemplar producer. '
  'PRD-083 WS4: outbox INSERT routed through fn_finance_outbox_emit (Option A governed boundary). '
  'player_id unconditionally NULL (ADR-052 R5). event_type hardcoded to grind.observed.';

-- ===========================================================================
-- 3. rpc_create_financial_adjustment — pass v_row.gaming_day as 9th param.
--    Already SECURITY DEFINER (Phase 2.2). No security posture change.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.rpc_create_financial_adjustment(
  p_player_id       uuid,
  p_visit_id        uuid,
  p_delta_amount    numeric,
  p_reason_code     public.adjustment_reason_code,
  p_note            text,
  p_original_txn_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.player_financial_transaction
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_casino_id      uuid;
  v_actor_id       uuid;
  v_staff_role     text;
  v_original_txn   public.player_financial_transaction%ROWTYPE;
  v_row            public.player_financial_transaction%ROWTYPE;
  v_direction      public.financial_direction;
  v_rating_slip_id uuid;
  v_table_id       uuid;
BEGIN
  PERFORM public.set_rls_context_from_staff();

  v_casino_id  := NULLIF(current_setting('app.casino_id',  true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id',   true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: No casino context';
  END IF;

  IF v_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % not authorized for adjustments', v_staff_role;
  END IF;

  IF p_delta_amount = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Delta amount cannot be zero';
  END IF;

  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Note is required for adjustments';
  END IF;

  IF length(trim(p_note)) < 10 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Note must be at least 10 characters';
  END IF;

  IF p_original_txn_id IS NOT NULL THEN
    SELECT * INTO v_original_txn
      FROM public.player_financial_transaction
     WHERE id        = p_original_txn_id
       AND casino_id = v_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND: Original transaction not found or access denied';
    END IF;

    IF v_original_txn.player_id <> p_player_id THEN
      RAISE EXCEPTION 'INVALID_INPUT: Cannot adjust transaction for different player';
    END IF;

    IF v_original_txn.visit_id <> p_visit_id THEN
      RAISE EXCEPTION 'INVALID_INPUT: Cannot adjust transaction for different visit';
    END IF;

    v_rating_slip_id := v_original_txn.rating_slip_id;
  END IF;

  v_direction := 'in';

  INSERT INTO public.player_financial_transaction AS t (
    id, player_id, casino_id, visit_id, amount, direction, source, tender_type,
    created_by_staff_id, related_transaction_id, rating_slip_id, created_at,
    idempotency_key, txn_kind, reason_code, note
  )
  VALUES (
    gen_random_uuid(), p_player_id, v_casino_id, p_visit_id, p_delta_amount,
    v_direction, 'pit', 'adjustment', v_actor_id, p_original_txn_id, v_rating_slip_id,
    now(), p_idempotency_key, 'adjustment', p_reason_code, p_note
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING t.* INTO v_row;

  IF v_row.id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_row
      FROM public.player_financial_transaction
     WHERE casino_id       = v_casino_id
       AND idempotency_key = p_idempotency_key;
  END IF;

  IF p_original_txn_id IS NOT NULL THEN
    IF v_original_txn.source         = 'pit'
       AND v_original_txn.direction  = 'in'
       AND v_original_txn.tender_type IN ('cash', 'chips')
       AND v_original_txn.rating_slip_id IS NOT NULL
    THEN
      SELECT rs.table_id INTO v_table_id
        FROM public.rating_slip rs
       WHERE rs.id        = v_original_txn.rating_slip_id
         AND rs.casino_id = v_casino_id;

      IF v_table_id IS NULL THEN
        RAISE EXCEPTION
          'INVALID_INPUT: inherited rating_slip_id does not resolve to a same-casino table. '
          'Financial write rejected.'
          USING ERRCODE = 'P0001';
      END IF;

      ASSERT v_row.player_id IS NOT NULL,
        'INVARIANT VIOLATION: player_id is NULL on adjustment outbox row';

      -- Pass v_row.gaming_day (trigger-computed from PFT INSERT) as 9th param
      PERFORM public.fn_finance_outbox_emit(
        public.generate_uuid_v7(),
        'adjustment.recorded',
        'ledger',
        'actual',
        v_table_id,
        v_row.player_id,
        v_row.id,
        jsonb_build_object(
          'amount',          v_row.amount,
          'pft_direction',   v_row.direction,
          'delta_direction', CASE WHEN v_row.amount > 0 THEN 'increase' ELSE 'decrease' END,
          'reason_code',     v_row.reason_code
        ),
        v_row.gaming_day
      );
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_financial_adjustment(
  uuid, uuid, numeric, public.adjustment_reason_code, text, uuid, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_create_financial_adjustment(
  uuid, uuid, numeric, public.adjustment_reason_code, text, uuid, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_create_financial_adjustment(
  uuid, uuid, numeric, public.adjustment_reason_code, text, uuid, text
) IS
  'PRD-087 WS1A Gate A M3: passes v_row.gaming_day to 9-param fn_finance_outbox_emit. '
  'PRD-085 Phase 2.2 SECURITY DEFINER posture preserved. '
  'ADR-057 conditional emission, DO NOTHING idempotency unchanged.';

-- ===========================================================================
-- 4. rpc_request_table_fill — compute v_gaming_day + pass as 9th param.
--    Already SECURITY DEFINER. No security posture change.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.rpc_request_table_fill(
  p_table_id     uuid,
  p_chipset      jsonb,
  p_amount_cents integer,
  p_delivered_by uuid,
  p_received_by  uuid,
  p_slip_no      text,
  p_request_id   text
) RETURNS public.table_fill
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_casino_id          uuid;
  v_context_actor_id   uuid;
  v_context_staff_role text;
  v_session_id         uuid;
  v_result             public.table_fill;
  v_existing           public.table_fill;
  v_report_finalized   boolean;
  v_gaming_day         date;
BEGIN
  PERFORM public.set_rls_context_from_staff();
  v_casino_id          := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id   := NULLIF(current_setting('app.actor_id',  true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot request table fills', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context' USING ERRCODE = 'P0001';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_amount_cents must be > 0, got: %',
      COALESCE(p_amount_cents::text, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing
    FROM public.table_fill
   WHERE casino_id  = v_casino_id
     AND request_id = p_request_id
   FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.amount_cents  = p_amount_cents
       AND v_existing.table_id  = p_table_id
       AND v_existing.chipset   = p_chipset
       AND v_existing.delivered_by = p_delivered_by
       AND v_existing.received_by  = p_received_by
       AND v_existing.slip_no      = p_slip_no
    THEN
      RETURN v_existing;
    ELSE
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: fill request_id=% already committed with different payload. '
        'existing amount_cents=%, incoming amount_cents=%',
        p_request_id, v_existing.amount_cents, p_amount_cents
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_delivered_by AND casino_id = v_casino_id) THEN
    RAISE EXCEPTION 'SEC-007: staff % does not belong to casino context', p_delivered_by;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_received_by AND casino_id = v_casino_id) THEN
    RAISE EXCEPTION 'SEC-007: staff % does not belong to casino context', p_received_by;
  END IF;

  SELECT id INTO STRICT v_session_id
    FROM public.table_session
   WHERE casino_id       = v_casino_id
     AND gaming_table_id = p_table_id
     AND status IN ('OPEN', 'ACTIVE', 'RUNDOWN');

  INSERT INTO public.table_fill (
    casino_id, table_id, chipset, amount_cents,
    requested_by, delivered_by, received_by, slip_no, request_id, status, session_id
  )
  VALUES (
    v_casino_id, p_table_id, p_chipset, p_amount_cents,
    v_context_actor_id, p_delivered_by, p_received_by, p_slip_no, p_request_id,
    'requested', v_session_id
  )
  ON CONFLICT (casino_id, request_id) DO NOTHING
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    SELECT * INTO v_existing
      FROM public.table_fill
     WHERE casino_id  = v_casino_id
       AND request_id = p_request_id
     FOR UPDATE;

    IF v_existing.id IS NULL THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: fill request_id=% concurrent race unresolved',
        p_request_id USING ERRCODE = 'P0001';
    END IF;

    IF v_existing.amount_cents  = p_amount_cents
       AND v_existing.table_id  = p_table_id
       AND v_existing.chipset   = p_chipset
       AND v_existing.delivered_by = p_delivered_by
       AND v_existing.received_by  = p_received_by
       AND v_existing.slip_no      = p_slip_no
    THEN
      RETURN v_existing;
    END IF;

    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: fill request_id=% already committed with different payload. '
      'existing amount_cents=%, incoming amount_cents=%',
      p_request_id, v_existing.amount_cents, p_amount_cents
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.table_session
     SET fills_total_cents = COALESCE(fills_total_cents, 0) + p_amount_cents
   WHERE id = v_session_id;

  SELECT (finalized_at IS NOT NULL) INTO v_report_finalized
    FROM public.table_rundown_report
   WHERE table_session_id = v_session_id;

  IF v_report_finalized IS TRUE THEN
    UPDATE public.table_rundown_report
       SET has_late_events = true
     WHERE table_session_id = v_session_id
       AND has_late_events  = false;

    INSERT INTO public.audit_log (casino_id, domain, actor_id, action, details)
    VALUES (
      v_casino_id, 'table-context', v_context_actor_id,
      'LATE_EVENT_AFTER_FINALIZATION',
      jsonb_build_object(
        'event_type', 'fill', 'event_id', v_result.id,
        'session_id', v_session_id, 'amount_cents', p_amount_cents
      )
    );
  END IF;

  -- Compute gaming_day at emit time (same as grind.observed pattern).
  -- table_fill has no gaming_day column; timestamp inference is banned for backfill
  -- (DEC-EXEC-3) but compute_gaming_day at the moment of occurrence is authoritative.
  v_gaming_day := public.compute_gaming_day(v_casino_id, NOW());

  PERFORM public.fn_finance_outbox_emit(
    public.generate_uuid_v7(),
    'fill.recorded',
    'operational',
    'estimated',
    p_table_id,
    NULL,
    v_result.id,
    jsonb_build_object('amount_cents', p_amount_cents, 'session_id', v_session_id),
    v_gaming_day
  );

  RETURN v_result;
END;
$$;

REVOKE ALL    ON FUNCTION public.rpc_request_table_fill(uuid, jsonb, integer, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_table_fill(uuid, jsonb, integer, uuid, uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_request_table_fill(uuid, jsonb, integer, uuid, uuid, text, text) IS
  'PRD-087 WS1A Gate A M3: computes v_gaming_day via compute_gaming_day(casino_id, NOW()) '
  'and passes as 9th param to fn_finance_outbox_emit. '
  'PRD-085 Phase 2.2 semantics preserved. SECURITY DEFINER posture unchanged.';

-- ===========================================================================
-- 5. rpc_request_table_credit — compute v_gaming_day + pass as 9th param.
--    Already SECURITY DEFINER. No security posture change. Same pattern as fill.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.rpc_request_table_credit(
  p_table_id     uuid,
  p_chipset      jsonb,
  p_amount_cents integer,
  p_sent_by      uuid,
  p_received_by  uuid,
  p_slip_no      text,
  p_request_id   text
) RETURNS public.table_credit
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_casino_id          uuid;
  v_context_actor_id   uuid;
  v_context_staff_role text;
  v_session_id         uuid;
  v_result             public.table_credit;
  v_existing           public.table_credit;
  v_report_finalized   boolean;
  v_gaming_day         date;
BEGIN
  PERFORM public.set_rls_context_from_staff();
  v_casino_id          := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id   := NULLIF(current_setting('app.actor_id',  true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot request table credit', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context' USING ERRCODE = 'P0001';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_amount_cents must be > 0, got: %',
      COALESCE(p_amount_cents::text, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing
    FROM public.table_credit
   WHERE casino_id  = v_casino_id
     AND request_id = p_request_id
   FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.amount_cents  = p_amount_cents
       AND v_existing.table_id  = p_table_id
       AND v_existing.chipset    = p_chipset
       AND v_existing.sent_by    = p_sent_by
       AND v_existing.received_by = p_received_by
       AND v_existing.slip_no    = p_slip_no
    THEN
      RETURN v_existing;
    ELSE
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: credit request_id=% already committed with different payload. '
        'existing amount_cents=%, incoming amount_cents=%',
        p_request_id, v_existing.amount_cents, p_amount_cents
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_sent_by AND casino_id = v_casino_id) THEN
    RAISE EXCEPTION 'SEC-007: staff % does not belong to casino context', p_sent_by;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_received_by AND casino_id = v_casino_id) THEN
    RAISE EXCEPTION 'SEC-007: staff % does not belong to casino context', p_received_by;
  END IF;

  SELECT id INTO STRICT v_session_id
    FROM public.table_session
   WHERE casino_id       = v_casino_id
     AND gaming_table_id = p_table_id
     AND status IN ('OPEN', 'ACTIVE', 'RUNDOWN');

  INSERT INTO public.table_credit (
    casino_id, table_id, chipset, amount_cents,
    authorized_by, sent_by, received_by, slip_no, request_id, status, session_id
  )
  VALUES (
    v_casino_id, p_table_id, p_chipset, p_amount_cents,
    v_context_actor_id, p_sent_by, p_received_by, p_slip_no, p_request_id,
    'requested', v_session_id
  )
  ON CONFLICT (casino_id, request_id) DO NOTHING
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    SELECT * INTO v_existing
      FROM public.table_credit
     WHERE casino_id  = v_casino_id
       AND request_id = p_request_id
     FOR UPDATE;

    IF v_existing.id IS NULL THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: credit request_id=% concurrent race unresolved',
        p_request_id USING ERRCODE = 'P0001';
    END IF;

    IF v_existing.amount_cents  = p_amount_cents
       AND v_existing.table_id  = p_table_id
       AND v_existing.chipset    = p_chipset
       AND v_existing.sent_by    = p_sent_by
       AND v_existing.received_by = p_received_by
       AND v_existing.slip_no    = p_slip_no
    THEN
      RETURN v_existing;
    END IF;

    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: credit request_id=% already committed with different payload. '
      'existing amount_cents=%, incoming amount_cents=%',
      p_request_id, v_existing.amount_cents, p_amount_cents
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.table_session
     SET credits_total_cents = COALESCE(credits_total_cents, 0) + p_amount_cents
   WHERE id = v_session_id;

  SELECT (finalized_at IS NOT NULL) INTO v_report_finalized
    FROM public.table_rundown_report
   WHERE table_session_id = v_session_id;

  IF v_report_finalized IS TRUE THEN
    UPDATE public.table_rundown_report
       SET has_late_events = true
     WHERE table_session_id = v_session_id
       AND has_late_events  = false;

    INSERT INTO public.audit_log (casino_id, domain, actor_id, action, details)
    VALUES (
      v_casino_id, 'table-context', v_context_actor_id,
      'LATE_EVENT_AFTER_FINALIZATION',
      jsonb_build_object(
        'event_type', 'credit', 'event_id', v_result.id,
        'session_id', v_session_id, 'amount_cents', p_amount_cents
      )
    );
  END IF;

  -- Compute gaming_day at emit time (same as grind.observed pattern).
  v_gaming_day := public.compute_gaming_day(v_casino_id, NOW());

  PERFORM public.fn_finance_outbox_emit(
    public.generate_uuid_v7(),
    'credit.recorded',
    'operational',
    'estimated',
    p_table_id,
    NULL,
    v_result.id,
    jsonb_build_object('amount_cents', p_amount_cents, 'session_id', v_session_id),
    v_gaming_day
  );

  RETURN v_result;
END;
$$;

REVOKE ALL    ON FUNCTION public.rpc_request_table_credit(uuid, jsonb, integer, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_table_credit(uuid, jsonb, integer, uuid, uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_request_table_credit(uuid, jsonb, integer, uuid, uuid, text, text) IS
  'PRD-087 WS1A Gate A M3: computes v_gaming_day via compute_gaming_day(casino_id, NOW()) '
  'and passes as 9th param to fn_finance_outbox_emit. '
  'PRD-085 Phase 2.2 semantics preserved. SECURITY DEFINER posture unchanged.';

-- ===========================================================================
-- Post-state assertions
-- ===========================================================================
DO $$
BEGIN
  -- Privilege triangle must be closed: rpc_create_financial_txn must be SECURITY DEFINER
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_create_financial_txn'
      AND p.prosecdef IS TRUE
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: rpc_create_financial_txn is not SECURITY DEFINER after M3.';
  END IF;

  -- All 5 producers must exist and be findable
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_record_grind_observation'
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: rpc_record_grind_observation missing after M3.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_create_financial_adjustment'
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: rpc_create_financial_adjustment missing after M3.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_request_table_fill'
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: rpc_request_table_fill missing after M3.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_request_table_credit'
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: rpc_request_table_credit missing after M3.';
  END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';

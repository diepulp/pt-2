-- PRD-083 Phase 2.1 — WS4: Adjustment Producer Extension + Security Hardening
--
-- Changes:
--   1. Three pre-state assertions (ABORT on failure)
--   2. UNIQUE (aggregate_id, event_type) on finance_outbox (idempotency guard FR-9)
--   3. fn_finance_outbox_emit: governed SECURITY DEFINER outbox insertion helper
--   4. Option A security hardening: DROP insert policy + REVOKE INSERT from authenticated
--   5. rpc_create_financial_txn: minimal adaptation — route INSERT through helper
--   6. rpc_record_grind_observation: minimal adaptation — route INSERT through helper
--   7. rpc_create_financial_adjustment: extend with ADR-057 conditional outbox emission

BEGIN;

-- ===========================================================================
-- Pre-state assertions
-- ===========================================================================
DO $$
BEGIN
  -- 1. PRD-082 teardown applied
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name   = 'outbox_integration_proof_state'
  ) THEN
    RAISE EXCEPTION
      'PRE-STATE FAIL: outbox_integration_proof_state still exists. '
      'Apply 20260517141021_remove_prd082_harness_receipt_proof_state.sql first.';
  END IF;

  -- 2. No duplicate (aggregate_id, event_type) in finance_outbox
  IF EXISTS (
    SELECT 1 FROM public.finance_outbox
     GROUP BY aggregate_id, event_type
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'PRE-STATE FAIL: duplicate (aggregate_id, event_type) rows exist in finance_outbox. '
      'Resolve duplicates before adding uniqueness constraint.';
  END IF;

  -- 3. Stale p_casino_id overload absent — WS3_SIG must have applied
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_proc   p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname  = 'public'
       AND p.proname  = 'rpc_create_financial_adjustment'
       AND p.proargnames @> ARRAY['p_casino_id']
  ) THEN
    RAISE EXCEPTION
      'PRE-STATE FAIL: stale p_casino_id overload still present in rpc_create_financial_adjustment. '
      'Apply 20260517233745_wave2_adj_sig_restore.sql (WS3_SIG) first.';
  END IF;
END;
$$;

-- ===========================================================================
-- Uniqueness constraint: guard producer duplication (FR-9)
-- Guards against duplicate outbox rows per logical aggregate per event type.
-- This constraint is about producer-side deduplication only — it MUST NOT be
-- interpreted as a replay-processing constraint. Replay operates on existing
-- immutable finance_outbox rows and must not re-author producer inserts.
-- ===========================================================================
ALTER TABLE public.finance_outbox
  ADD CONSTRAINT uq_finance_outbox_aggregate_event
  UNIQUE (aggregate_id, event_type);

-- ===========================================================================
-- Governed SECURITY DEFINER helper: fn_finance_outbox_emit
--
-- Infrastructure-only: deterministic envelope validation + finance_outbox INSERT
-- within the active RPC transaction boundary. MUST NOT classify producer semantics,
-- derive event categories, branch on producer business meaning, mutate payload
-- structure, route to multiple destinations, or author any table other than
-- finance_outbox.
--
-- casino_id is derived from app.casino_id session GUC (set by
-- set_rls_context_from_staff()) — never from a caller-supplied parameter.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.fn_finance_outbox_emit(
  p_event_id     uuid,
  p_event_type   text,
  p_fact_class   text,
  p_origin_label text,
  p_table_id     uuid,
  p_player_id    uuid,   -- nullable: Class B facts have no player identity (ADR-052 R5)
  p_aggregate_id uuid,
  p_payload      jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_casino_id uuid;
BEGIN
  -- Derive casino_id from authoritative session context (ADR-024); never caller-supplied
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION
      'fn_finance_outbox_emit: casino context not established. '
      'Call set_rls_context_from_staff() before emitting.';
  END IF;

  -- Envelope validation
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: event_id is required';
  END IF;

  IF p_event_type IS NULL OR p_event_type = '' THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: event_type is required';
  END IF;

  IF p_fact_class IS NULL OR p_fact_class NOT IN ('ledger', 'operational') THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: fact_class must be ledger or operational, got: %',
      COALESCE(p_fact_class, 'NULL');
  END IF;

  IF p_origin_label IS NULL OR p_origin_label NOT IN ('actual', 'estimated') THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: origin_label must be actual or estimated, got: %',
      COALESCE(p_origin_label, 'NULL');
  END IF;

  IF p_table_id IS NULL THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: table_id is required';
  END IF;

  IF p_aggregate_id IS NULL THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: aggregate_id is required';
  END IF;

  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: payload is required';
  END IF;

  INSERT INTO public.finance_outbox (
    event_id, event_type, fact_class, origin_label,
    casino_id, table_id, player_id, aggregate_id, payload, created_at
  ) VALUES (
    p_event_id, p_event_type, p_fact_class, p_origin_label,
    v_casino_id, p_table_id, p_player_id, p_aggregate_id, p_payload,
    NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_finance_outbox_emit(
  uuid, text, text, text, uuid, uuid, uuid, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_finance_outbox_emit(
  uuid, text, text, text, uuid, uuid, uuid, jsonb
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_finance_outbox_emit(
  uuid, text, text, text, uuid, uuid, uuid, jsonb
) TO service_role;

COMMENT ON FUNCTION public.fn_finance_outbox_emit(
  uuid, text, text, text, uuid, uuid, uuid, jsonb
) IS
  'PRD-083 WS4: governed SECURITY DEFINER outbox insertion boundary (Option A). '
  'Infrastructure-only: deterministic envelope validation + finance_outbox INSERT. '
  'casino_id derived from app.casino_id session GUC — no caller-supplied casino_id. '
  'Does not classify producer semantics or author tables other than finance_outbox.';

-- ===========================================================================
-- Option A security hardening
-- Remove direct authenticated INSERT capability. The governed helper
-- fn_finance_outbox_emit (SECURITY DEFINER) is the sole insertion path.
-- ===========================================================================
DROP POLICY IF EXISTS finance_outbox_insert_staff ON public.finance_outbox;

REVOKE INSERT ON public.finance_outbox FROM authenticated;

-- Post-state: confirm authenticated cannot INSERT directly
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.finance_outbox', 'INSERT') THEN
    RAISE EXCEPTION
      'POST-STATE FAIL: authenticated still has INSERT privilege on finance_outbox '
      'after REVOKE. Cannot proceed.';
  END IF;
END;
$$;

-- ===========================================================================
-- rpc_create_financial_txn — minimal adaptation (Option A)
-- Only change: replace direct INSERT INTO finance_outbox with
-- PERFORM public.fn_finance_outbox_emit(...). No other behavioral change.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.rpc_create_financial_txn(
  p_player_id               uuid,
  p_visit_id                uuid,
  p_amount                  numeric,
  p_direction               financial_direction,
  p_source                  financial_source,
  p_tender_type             text                     DEFAULT NULL::text,
  p_rating_slip_id          uuid                     DEFAULT NULL::uuid,
  p_related_transaction_id  uuid                     DEFAULT NULL::uuid,
  p_idempotency_key         text                     DEFAULT NULL::text,
  p_created_at              timestamp with time zone DEFAULT now(),
  p_external_ref            text                     DEFAULT NULL::text
)
RETURNS player_financial_transaction
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_casino_id  uuid;
  v_actor_id   uuid;
  v_staff_role text;
  v_row        player_financial_transaction%ROWTYPE;
  v_table_id   uuid;
BEGIN
  -- ADR-024 + ADR-040: authoritative context injection
  PERFORM set_rls_context_from_staff();

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

  -- Route through governed helper (Option A: SECURITY DEFINER boundary)
  PERFORM public.fn_finance_outbox_emit(
    public.generate_uuid_v7(),
    'buyin.recorded',
    'ledger',
    'actual',
    v_table_id,
    v_row.player_id,
    v_row.id,
    jsonb_build_object('amount', v_row.amount, 'tender_type', v_row.tender_type)
  );

  RETURN v_row;
END;
$function$;

-- ===========================================================================
-- rpc_record_grind_observation — minimal adaptation (Option A)
-- Only change: replace direct INSERT INTO finance_outbox with
-- PERFORM public.fn_finance_outbox_emit(...). No other behavioral change.
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
  -- ADR-024: authoritative context derivation (no client-supplied identity)
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

  -- Route through governed helper (Option A: SECURITY DEFINER boundary)
  PERFORM public.fn_finance_outbox_emit(
    public.generate_uuid_v7(),
    'grind.observed',
    'operational',
    'estimated',
    p_table_id,
    NULL,       -- player_id unconditionally NULL (ADR-052 R5: Class B has no player identity)
    v_grind_id,
    jsonb_build_object('amount_cents', p_amount_cents)
  );

  RETURN v_grind_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.rpc_record_grind_observation(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_record_grind_observation(UUID, BIGINT) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_record_grind_observation(UUID, BIGINT) IS
  'PRD-081 Wave 2 — Class B exemplar producer. '
  'PRD-083 WS4: outbox INSERT routed through fn_finance_outbox_emit (Option A governed boundary). '
  'Inserts into table_buyin_telemetry (GRIND_BUYIN, grind.observed) and finance_outbox atomically. '
  'player_id unconditionally NULL (ADR-052 R5). '
  'event_type hardcoded to grind.observed — vertical-collapse exemplar. '
  'DEC-Q4: RPC-coupled insertion, not trigger-based.';

-- ===========================================================================
-- rpc_create_financial_adjustment — canonical 7-param + ADR-057 outbox emission
-- Builds on WS3 clean body. Adds conditional outbox emission through governed helper.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.rpc_create_financial_adjustment(
  p_player_id       uuid,
  p_visit_id        uuid,
  p_delta_amount    numeric,
  p_reason_code     adjustment_reason_code,
  p_note            text,
  p_original_txn_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS player_financial_transaction
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id      uuid;
  v_actor_id       uuid;
  v_staff_role     text;
  v_original_txn   player_financial_transaction%ROWTYPE;
  v_row            player_financial_transaction%ROWTYPE;
  v_direction      financial_direction;
  v_rating_slip_id uuid;
  v_table_id       uuid;
BEGIN
  -- ADR-024 + ADR-040: authoritative context derivation; no caller-supplied identity
  PERFORM set_rls_context_from_staff();

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
      FROM player_financial_transaction
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

  -- Bug-3 fix: DO NOTHING + SELECT replay (no ON CONFLICT DO UPDATE)
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

  -- ===========================================================================
  -- ADR-057 conditional outbox emission (FR-1 through FR-3, FR-9, FR-10)
  -- Unlinked (p_original_txn_id IS NULL) → no outbox row, no error.
  -- Excluded (original fails ADR-057 criteria) → no outbox row, no error.
  -- Invalid inherited rating_slip_id → EXCEPTION, rejects entire write (FR-1).
  -- ===========================================================================
  IF p_original_txn_id IS NOT NULL THEN
    -- Check all ADR-057 conditions on the original PFT
    IF v_original_txn.source         = 'pit'
       AND v_original_txn.direction  = 'in'
       AND v_original_txn.tender_type IN ('cash', 'chips')
       AND v_original_txn.rating_slip_id IS NOT NULL
    THEN
      -- Resolve inherited rating_slip_id → same-casino table_id (ADR-057 table-anchor)
      SELECT rs.table_id INTO v_table_id
        FROM public.rating_slip rs
       WHERE rs.id        = v_original_txn.rating_slip_id
         AND rs.casino_id = v_casino_id;

      IF v_table_id IS NULL THEN
        -- Present but unresolvable → reject the entire write
        RAISE EXCEPTION
          'INVALID_INPUT: inherited rating_slip_id does not resolve to a same-casino table. '
          'Financial write rejected.'
          USING ERRCODE = 'P0001';
      END IF;

      -- FR-9 idempotency guard: skip if outbox row already exists for this aggregate+event
      IF NOT EXISTS (
        SELECT 1 FROM public.finance_outbox
         WHERE aggregate_id = v_row.id
           AND event_type   = 'adjustment.recorded'
      ) THEN
        -- FR-3: player_id NOT NULL invariant
        ASSERT v_row.player_id IS NOT NULL,
          'INVARIANT VIOLATION: player_id is NULL on adjustment outbox row';

        -- Route through governed helper (Option A: SECURITY DEFINER boundary)
        PERFORM public.fn_finance_outbox_emit(
          public.generate_uuid_v7(),
          'adjustment.recorded',      -- FR-2: hardcoded event_type (INT-002:801)
          'ledger',                   -- FR-2: hardcoded fact_class
          'actual',                   -- FR-2: hardcoded origin_label
          v_table_id,                 -- ADR-057 table-anchor, derived from original
          v_row.player_id,            -- FR-3: NOT NULL
          v_row.id,                   -- aggregate_id = adjustment PFT row id
          jsonb_build_object(
            'amount',          v_row.amount,     -- FR-10: signed numeric delta
            'pft_direction',   v_row.direction,  -- FR-10: literal PFT direction
            'delta_direction', CASE WHEN v_row.amount > 0 THEN 'increase' ELSE 'decrease' END,
            'reason_code',     v_row.reason_code -- FR-10: note omitted (may be sensitive)
          )
        );
      END IF;
    -- ELSE: excluded — original fails ADR-057 criteria → no outbox row, no error
    END IF;
  -- ELSE: unlinked — p_original_txn_id IS NULL → no outbox row, no error
  END IF;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_create_financial_adjustment(
  uuid, uuid, numeric, adjustment_reason_code, text, uuid, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_create_financial_adjustment(
  uuid, uuid, numeric, adjustment_reason_code, text, uuid, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_create_financial_adjustment(
  uuid, uuid, numeric, adjustment_reason_code, text, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.rpc_create_financial_adjustment(
  uuid, uuid, numeric, adjustment_reason_code, text, uuid, text
) IS
  'PRD-083 WS4: canonical 7-param adjustment producer with ADR-057 conditional outbox emission. '
  'ADR-040 SECURITY INVOKER. Casino scope from set_rls_context_from_staff() (ADR-024). '
  'Bug-3 DO NOTHING idempotency preserved. Outbox through fn_finance_outbox_emit (Option A). '
  'Emits adjustment.recorded only for linked adjustments with ADR-057-eligible original PFT '
  '(pit/in/cash|chips + resolvable same-casino rating_slip.table_id). INT-002:801.';

COMMIT;

NOTIFY pgrst, 'reload schema';

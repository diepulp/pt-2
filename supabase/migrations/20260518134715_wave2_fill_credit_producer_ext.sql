-- PRD-085 Wave 2 Phase 2.2 — Fill + Credit Producer Extension
--
-- Changes:
--   1. Pre-state assertions (abort if prerequisites not met)
--   2. rpc_create_financial_adjustment: replace as SECURITY DEFINER boundary (Option A compat)
--   3. REVOKE direct authenticated EXECUTE on fn_finance_outbox_emit
--   4. rpc_request_table_fill: whole-effect idempotency hardening + fill.recorded emission
--   5. rpc_request_table_credit: whole-effect idempotency hardening + credit.recorded emission
--
-- ADR-055 intra-category parity: fill and credit producers ship in the same transaction.
-- ADR-054 D2: Dependency Events (fill.recorded, credit.recorded).
-- ADR-052 R5: player_id unconditionally NULL for Dependency Events.
-- DEC-UL-2: origin_label='estimated' is a provenance label, not an accuracy qualifier.

BEGIN;

-- ===========================================================================
-- Pre-state assertions (abort migration if prerequisites not met)
-- ===========================================================================
DO $$
BEGIN
  -- 1. fn_finance_outbox_emit exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_finance_outbox_emit'
  ) THEN
    RAISE EXCEPTION 'PRE-STATE FAIL: fn_finance_outbox_emit not found. Apply Phase 2.1 migrations first.';
  END IF;

  -- 2. uq_finance_outbox_aggregate_event constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'uq_finance_outbox_aggregate_event'
  ) THEN
    RAISE EXCEPTION 'PRE-STATE FAIL: uq_finance_outbox_aggregate_event missing. Apply Phase 2.1 migrations (20260517234015) first.';
  END IF;

  -- 3. rpc_request_table_fill canonical signature (ADR-040 / ADR-024)
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_request_table_fill'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid)
        = 'p_table_id uuid, p_chipset jsonb, p_amount_cents integer, p_delivered_by uuid, p_received_by uuid, p_slip_no text, p_request_id text'
  ) THEN
    RAISE EXCEPTION 'PRE-STATE FAIL: canonical rpc_request_table_fill signature not found.';
  END IF;

  -- 4. rpc_request_table_credit canonical signature
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_request_table_credit'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid)
        = 'p_table_id uuid, p_chipset jsonb, p_amount_cents integer, p_sent_by uuid, p_received_by uuid, p_slip_no text, p_request_id text'
  ) THEN
    RAISE EXCEPTION 'PRE-STATE FAIL: canonical rpc_request_table_credit signature not found.';
  END IF;
END;
$$;

-- ===========================================================================
-- Adjustment producer compatibility block (MUST precede helper revocation)
-- ===========================================================================
-- Replace the Phase 2.1 public adjustment producer as a governed SECURITY DEFINER
-- boundary before removing authenticated direct EXECUTE on fn_finance_outbox_emit.
-- This block is not optional: without it, authenticated adjustment calls can no
-- longer emit adjustment.recorded because the Phase 2.1 function is SECURITY INVOKER.
--
-- Preserves Phase 2.1 semantics exactly:
--   - ADR-057 eligibility gating (unchanged)
--   - DO NOTHING insert + SELECT replay idempotency pattern (unchanged)
--   - conditional adjustment.recorded emission through fn_finance_outbox_emit
-- Changes:
--   - SECURITY INVOKER → SECURITY DEFINER
--   - SET search_path = pg_catalog, public → SET search_path = ''
--   - All non-pg_catalog objects fully qualified
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
  -- ADR-024 + ADR-040: authoritative context derivation; no caller-supplied identity
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

      -- fn_finance_outbox_emit ON CONFLICT DO NOTHING handles duplicate guard (idempotency)
      ASSERT v_row.player_id IS NOT NULL,
        'INVARIANT VIOLATION: player_id is NULL on adjustment outbox row';

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
        )
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
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_create_financial_adjustment(
  uuid, uuid, numeric, public.adjustment_reason_code, text, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.rpc_create_financial_adjustment(
  uuid, uuid, numeric, public.adjustment_reason_code, text, uuid, text
) IS
  'PRD-085 Wave 2 Phase 2.2: adjustment producer upgraded to SECURITY DEFINER (Option A compat). '
  'SET search_path='''' + fully qualified objects. Preserves PRD-083 WS4 Phase 2.1 semantics exactly: '
  'ADR-057 conditional emission, DO NOTHING idempotency, authenticated call path preserved.';

-- Required post-state assertions (adjustment must be SECURITY DEFINER with correct posture
-- before fn_finance_outbox_emit authenticated privilege is revoked)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'rpc_create_financial_adjustment'
       AND pg_catalog.pg_get_function_identity_arguments(p.oid)
         = 'p_player_id uuid, p_visit_id uuid, p_delta_amount numeric, p_reason_code adjustment_reason_code, p_note text, p_original_txn_id uuid, p_idempotency_key text'
       AND p.prosecdef IS TRUE
       AND array_to_string(p.proconfig, ',') = 'search_path='
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: rpc_create_financial_adjustment must be SECURITY DEFINER with search_path='''' before helper revoke.';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.rpc_create_financial_adjustment(uuid,uuid,numeric,adjustment_reason_code,text,uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: authenticated cannot execute rpc_create_financial_adjustment after hardening.';
  END IF;
END;
$$;

-- ADR-018 / Option A hardening:
-- Fill/credit producers execute this helper from governed SECURITY DEFINER RPCs.
-- PUBLIC, anon, and authenticated must not have direct helper EXECUTE.
-- The adjustment producer above is already a governed SECURITY DEFINER boundary.
REVOKE ALL ON FUNCTION public.fn_finance_outbox_emit(
  uuid, text, text, text, uuid, uuid, uuid, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_finance_outbox_emit(
  uuid, text, text, text, uuid, uuid, uuid, jsonb
) TO service_role;

DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.fn_finance_outbox_emit(uuid,text,text,text,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: authenticated can execute fn_finance_outbox_emit directly.';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.fn_finance_outbox_emit(uuid,text,text,text,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: anon can execute fn_finance_outbox_emit directly.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'fn_finance_outbox_emit'
       AND pg_catalog.pg_function_is_visible(p.oid)
       AND p.proacl::text LIKE '%=X/%'
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: PUBLIC has EXECUTE on fn_finance_outbox_emit.';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.fn_finance_outbox_emit(uuid,text,text,text,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: service_role cannot execute fn_finance_outbox_emit.';
  END IF;
END;
$$;

-- ===========================================================================
-- rpc_request_table_fill — idempotency hardening + outbox emission
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
  v_casino_id        uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_session_id       uuid;
  v_result           public.table_fill;
  v_existing         public.table_fill;
  v_report_finalized boolean;
BEGIN
  -- ADR-024: authoritative context injection
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

  -- FR-7: amount validation at database boundary (direct RPC callers bypass TS validation)
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_amount_cents must be > 0, got: %',
      COALESCE(p_amount_cents::text, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  -- FR-8 / FR-9 / FR-11: Replay lookup BEFORE active-session resolution.
  -- If the row already exists: exact payload match → return existing row (no writes);
  -- divergent payload → IDEMPOTENCY_CONFLICT (no writes, no session/audit mutation).
  -- Uses SELECT ... FOR UPDATE to serialize concurrent same-key calls.
  SELECT * INTO v_existing
    FROM public.table_fill
   WHERE casino_id  = v_casino_id
     AND request_id = p_request_id
   FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    -- FR-9: compare against stored source-row truth, not mutable external state
    IF v_existing.amount_cents  = p_amount_cents
       AND v_existing.table_id  = p_table_id
       AND v_existing.chipset   = p_chipset
       AND v_existing.delivered_by = p_delivered_by
       AND v_existing.received_by  = p_received_by
       AND v_existing.slip_no      = p_slip_no
    THEN
      -- Exact replay: return existing row, no mutations
      RETURN v_existing;
    ELSE
      -- FR-12: divergent replay — stable error before any mutation
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: fill request_id=% already committed with different payload. '
        'existing amount_cents=%, incoming amount_cents=%',
        p_request_id, v_existing.amount_cents, p_amount_cents
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ADR-040 INV-8b: Category B same-casino validation.
  -- New requests only. Exact replay above must survive participant staff lifecycle changes
  -- because the stored source row is the idempotency source of truth.
  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_delivered_by AND casino_id = v_casino_id) THEN
    RAISE EXCEPTION 'SEC-007: staff % does not belong to casino context', p_delivered_by;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_received_by AND casino_id = v_casino_id) THEN
    RAISE EXCEPTION 'SEC-007: staff % does not belong to casino context', p_received_by;
  END IF;

  -- New request only: resolve active session (SELECT INTO STRICT fails loud if none)
  SELECT id INTO STRICT v_session_id
    FROM public.table_session
   WHERE casino_id       = v_casino_id
     AND gaming_table_id = p_table_id
     AND status IN ('OPEN', 'ACTIVE', 'RUNDOWN');

  -- FR-10: insert-wins pattern; DO NOTHING on race; losing transaction re-reads via FOR UPDATE path above
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
    -- Lost concurrent race; lock/read winning row and apply the same semantic comparison.
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

  -- New-request-only writes: session total delta + late-event audit
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

  -- Wave 2 Phase 2.2: Dependency Event outbox emission (ADR-054 D2)
  -- fact_class='operational', origin_label='estimated' — provenance labels (DEC-UL-2).
  -- Fills are operationally auditable to the cent; 'estimated' is NOT an accuracy qualifier.
  -- player_id=NULL unconditional — Dependency Events have no player attribution (ADR-052 R5).
  -- casino_id derived from app.casino_id session GUC — no caller-supplied casino_id.
  PERFORM public.fn_finance_outbox_emit(
    public.generate_uuid_v7(),
    'fill.recorded',
    'operational',
    'estimated',
    p_table_id,
    NULL,
    v_result.id,
    jsonb_build_object('amount_cents', p_amount_cents, 'session_id', v_session_id)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL    ON FUNCTION public.rpc_request_table_fill(uuid, jsonb, integer, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_table_fill(uuid, jsonb, integer, uuid, uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_request_table_fill(uuid, jsonb, integer, uuid, uuid, text, text) IS
  'PRD-085 Wave 2 Phase 2.2 — Dependency Event producer. '
  'Whole-effect idempotency hardened: DO NOTHING + SELECT FOR UPDATE conflict path. '
  'Replay lookup before active-session resolution (FR-11). '
  'Emits fill.recorded via fn_finance_outbox_emit (Option A, ADR-054 D2). '
  'fact_class=operational, origin_label=estimated, player_id=NULL (ADR-052 R5, ADR-054 D5, DEC-UL-2). '
  'amount validated > 0 at DB boundary (FR-7). No TypeScript fallback INSERT path.';

-- ===========================================================================
-- rpc_request_table_credit — idempotency hardening + outbox emission
-- Same pattern as fill; event_type='credit.recorded', table_credit row.
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
  v_casino_id        uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_session_id       uuid;
  v_result           public.table_credit;
  v_existing         public.table_credit;
  v_report_finalized boolean;
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

  -- Wave 2 Phase 2.2: Dependency Event outbox emission (ADR-054 D2)
  PERFORM public.fn_finance_outbox_emit(
    public.generate_uuid_v7(),
    'credit.recorded',
    'operational',
    'estimated',
    p_table_id,
    NULL,
    v_result.id,
    jsonb_build_object('amount_cents', p_amount_cents, 'session_id', v_session_id)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL    ON FUNCTION public.rpc_request_table_credit(uuid, jsonb, integer, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_table_credit(uuid, jsonb, integer, uuid, uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_request_table_credit(uuid, jsonb, integer, uuid, uuid, text, text) IS
  'PRD-085 Wave 2 Phase 2.2 — Dependency Event producer. '
  'Whole-effect idempotency hardened: DO NOTHING + SELECT FOR UPDATE conflict path. '
  'Replay lookup before active-session resolution (FR-11). '
  'Emits credit.recorded via fn_finance_outbox_emit (Option A, ADR-054 D2). '
  'fact_class=operational, origin_label=estimated, player_id=NULL (ADR-052 R5, ADR-054 D5, DEC-UL-2). '
  'amount validated > 0 at DB boundary (FR-7). No TypeScript fallback INSERT path.';

NOTIFY pgrst, 'reload schema';

COMMIT;

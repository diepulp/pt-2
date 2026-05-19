---
id: EXEC-085
title: Wave 2 Phase 2.2 — Fill + Credit Producer Extension (Dependency Events)
prd: PRD-085
prd_path: docs/10-prd/PRD-085-wave2-phase-2.2-dependency-event-producer-expansion-v0.md
fib_h: FIB-H-W2-OUTBOX-001
fib_s: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/wave-2/FIB-S-TRANSACTIONAL-OUTBOX.json
status: pending
created: 2026-05-18
complexity_prescreen: full
fib_s_loaded: true
write_path_classification: detected
gov010_check: "waived:phase-2.2-continuation-upstream-documented"
workstreams:
  WS1_MIGRATION:
    name: "SQL Producer Extension — Fill + Credit (Idempotency Hardening + Outbox Emission)"
    executor: backend-service-builder
    executor_type: skill
    bounded_context: PlayerFinancialService / TableContextService
    depends_on: []
    traces_to: [CAP-1, RULE-1, RULE-2, RULE-6, STEP-1, STEP-2, OUT-1, OUT-2, OUT-6]
    estimated_complexity: medium
    outputs:
      - supabase/migrations/20260518134715_wave2_fill_credit_producer_ext.sql
    gate: schema-validation

  WS2_TESTS:
    name: "I1 Atomicity Proof + Semantic Contract Tests — Fill + Credit Paths"
    executor: qa-specialist
    executor_type: skill
    bounded_context: PlayerFinancialService
    depends_on: [WS1_MIGRATION]
    traces_to: [CAP-1, CAP-5, RULE-1, RULE-5, RULE-6, RULE-7, OUT-1, OUT-2, OUT-6, OUT-7]
    estimated_complexity: medium
    outputs:
      - tests/failure/i1-atomicity-fill.test.ts
      - tests/failure/i1-atomicity-credit.test.ts
      - services/table-context/chip-custody.ts
      - services/table-context/__tests__/chip-custody.test.ts
    gate: test-pass

  WS3_GOVERNANCE:
    name: "Phase 2.2 Governance Closure — Tracker + Cursor Updates"
    executor: lead-architect
    executor_type: skill
    bounded_context: governance
    depends_on: [WS2_TESTS]
    traces_to: [infrastructure]
    estimated_complexity: small
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json
      - docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md
      - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
    gate: build

execution_phases:
  - phase: 1
    parallel: [WS1_MIGRATION]
    description: Combined SQL migration with pre-state assertions, idempotency hardening, and outbox emission for fill and credit
  - phase: 2
    parallel: [WS2_TESTS]
    description: I1 atomicity proof tests + full semantic contract test suite for fill and credit paths
  - phase: 3
    parallel: [WS3_GOVERNANCE]
    description: WAVE-2-TRACKER.json Phase 2.2 closure + ROLLOUT-TRACKER.json cursor advance to Phase 2.3

gates:
  migration-pre-post-state:
    type: migration
    commands:
      - "npm run db:types-local"
      - "npm run validate:matrix-schema"
      - "npm run type-check"
      - "npm run lint"
      - "npm run build"
    passing_criteria: "All exit 0; pre-state assertions in migration DO NOT raise; post-state assertions confirm fill+credit bodies contain fn_finance_outbox_emit call and helper grant hardening"
  schema-verification:
    type: test
    commands:
      - "npm run validate:matrix-schema"
    passing_criteria: "Schema ownership/matrix validation exits 0 after the migration and regenerated types"
  i1-proof-fill-credit:
    type: test
    commands:
      - "RUN_INTEGRATION_TESTS=true npm run test -- tests/failure/i1-atomicity-fill.test.ts --silent > /tmp/i1-fill.log 2>&1"
      - "RUN_INTEGRATION_TESTS=true npm run test -- tests/failure/i1-atomicity-credit.test.ts --silent > /tmp/i1-credit.log 2>&1"
      - "npm run test -- services/table-context/__tests__/chip-custody.test.ts --silent > /tmp/chip-custody.log 2>&1"
      - "npm run test -- services/player-financial/__tests__/ --silent > /tmp/player-financial.log 2>&1"
    passing_criteria: "All test files green; fill/credit DB-backed integration cases run and prove source/session/outbox counts; chip-custody propagates IDEMPOTENCY_CONFLICT without legacy 23505-only assumptions; no regression in services/player-financial/__tests__/"
  security-helper-hardening:
    type: test
    commands:
      - "RUN_INTEGRATION_TESTS=true npm run test -- tests/failure/i1-atomicity-fill.test.ts --silent > /tmp/i1-fill-security.log 2>&1"
      - "RUN_INTEGRATION_TESTS=true npm run test -- tests/failure/i1-atomicity-credit.test.ts --silent > /tmp/i1-credit-security.log 2>&1"
      - "RUN_INTEGRATION_TESTS=true npm run test -- services/player-financial/__tests__/outbox-adjustment-producer.test.ts --silent > /tmp/outbox-adjustment-producer.log 2>&1"
    passing_criteria: "PUBLIC, anon, and authenticated have no direct helper EXECUTE privilege; adjustment.recorded emission still works through a governed producer boundary; direct authenticated forgery attempt after set_rls_context_from_staff() is denied; both rewritten RPCs use search_path='' and fully qualified public/auth objects"
  relay-operability-smoke:
    type: test
    commands:
      - "npm run test -- services/player-financial/__tests__/outbox-relay.test.ts --silent > /tmp/outbox-relay.log 2>&1"
    passing_criteria: "Relay tests remain green; poison-row/backlog retry risk is either proven non-starving for healthy rows or explicitly logged as a Phase 2.3 bounded-retry/dead-letter follow-up with owner/date"
  governance-closure:
    type: manual
    passing_criteria: "WAVE-2-TRACKER.json cursor.active_phase='2.3'; Phase 2.2 status='complete'; ROLLOUT-TRACKER.json active_phase='2.3'"
---

# EXEC-085 — Wave 2 Phase 2.2: Fill + Credit Dependency Event Producer Extension

## Overview

Extends `rpc_request_table_fill` and `rpc_request_table_credit` to emit `finance_outbox` rows atomically within their existing transaction boundaries. This is the third and final producer rollout in Wave 2 Phase 2.2 — both RPCs ship in a single combined migration as a symmetric Dependency Event pair under ADR-055 intra-category parity. No relay, consumer, DTO, or DDL changes are in scope. The only TypeScript service-layer change admitted is `services/table-context/chip-custody.ts` error mapping so `IDEMPOTENCY_CONFLICT:` survives the new DB contract instead of being treated as a generic rejection.

The transport infrastructure (DDL, relay, `fn_finance_outbox_emit`, `uq_finance_outbox_aggregate_event`, I2–I4 baseline) is fully in place from Phases 2.0–2.1. This EXEC-SPEC delivers: (1) whole-effect idempotency hardening on both RPCs, (2) outbox emission via the governed SECURITY DEFINER helper, and (3) I1 proof tests per producer path.

## Scope Clarification — Idempotency Hardening

Although PRD-085 is primarily an outbox producer-extension slice, fill/credit outbox emission cannot be made safe while the current RPCs mutate source/session totals on idempotent replay. Therefore, whole-effect idempotency hardening is admitted as enabling work for atomic producer correctness, not as a new product behavior.

**Phase 2.2 authorization:** Phase 2.1 exit — PRD-083/EXEC-083 certified 2026-05-18, 20/20 PASS.

---

## Workstream 1: SQL Producer Extension (WS1_MIGRATION)

**Executor:** `backend-service-builder`

### Context

Target migration file: `supabase/migrations/20260518134715_wave2_fill_credit_producer_ext.sql`

**Current state problem (R-7, R-8):** Both RPCs use `ON CONFLICT (casino_id, request_id) DO UPDATE SET amount_cents=..., delivered_by=...` — this mutates semantic fields on replay and re-increments `table_session` totals. The `fn_finance_outbox_emit` `ON CONFLICT DO NOTHING` guard silences the duplicate outbox row, but session rollups diverge.

**Required transformation:**
1. Replace `ON CONFLICT DO UPDATE` with `DO NOTHING RETURNING *` + `SELECT ... FOR UPDATE` conflict-path fallback
2. Move replay lookup + semantic comparison **before** `SELECT INTO STRICT v_session_id` (active session resolution)
3. Move participant staff same-casino validation after exact replay handling; exact replay compares stored source-row truth and must not fail because participant staff lifecycle changed after the original commit
4. Add `p_amount_cents > 0` validation before any mutation (FR-7)
5. Add divergent-replay `IDEMPOTENCY_CONFLICT:` raise (P0001, FR-12)
6. Session-total delta and late-event audit only on the new-row path, never on replay path
7. `fn_finance_outbox_emit(...)` call after session-total update and late-event audit, before `RETURN v_result`
8. Harden SECURITY DEFINER posture: `SET search_path = ''`, fully qualify all non-`pg_catalog` objects, and revoke direct `PUBLIC`, `anon`, and `authenticated` execution on `fn_finance_outbox_emit`
9. Preserve Phase 2.1 adjustment producer compatibility before helper revocation through the chosen compatibility path below; authenticated clients must not be able to call `fn_finance_outbox_emit(...)` directly after setting ADR-024 context

### Compatibility Path Decision — Adjustment Producer

**Chosen path: Option A — replace `rpc_create_financial_adjustment(...)` as a governed `SECURITY DEFINER` producer boundary.**

The migration must update the existing public `rpc_create_financial_adjustment(uuid, uuid, numeric, adjustment_reason_code, text, uuid, text)` function before revoking authenticated helper execution:
- Preserve the existing public signature and authenticated call path.
- Change the function to `SECURITY DEFINER`.
- Set `SET search_path = ''`.
- Fully qualify all non-`pg_catalog` objects, including `public.set_rls_context_from_staff()`, `public.player_financial_transaction`, `public.rating_slip`, `public.fn_finance_outbox_emit(...)`, and enum casts as needed.
- Preserve all existing adjustment producer semantics from Phase 2.1, including ADR-057 eligibility, idempotency behavior, and `adjustment.recorded` emission.
- Re-emit `REVOKE ALL ... FROM PUBLIC, anon` and `GRANT EXECUTE ... TO authenticated, service_role` for the public adjustment RPC.
- Ensure only governed producer RPCs can reach `fn_finance_outbox_emit(...)`; no client-executable function may accept arbitrary outbox envelope fields.

Rejected path: Option B private internal emit wrapper. Reason: it adds a new abstraction and extra callable surface when the existing adjustment producer can be made compatible by hardening its security boundary in place.

### Required Migration Structure

```sql
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
-- longer emit adjustment.recorded because the current Phase 2.1 function is
-- SECURITY INVOKER.
--
-- Required implementation:
--   1. CREATE OR REPLACE FUNCTION public.rpc_create_financial_adjustment(
--        uuid, uuid, numeric, public.adjustment_reason_code, text, uuid, text
--      )
--   2. Preserve the existing public signature and authenticated call path.
--   3. Use LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''.
--   4. Fully qualify all non-pg_catalog objects:
--      public.set_rls_context_from_staff(), auth.uid(),
--      public.player_financial_transaction, public.rating_slip,
--      public.fn_finance_outbox_emit(...), public.generate_uuid_v7(),
--      public.adjustment_reason_code, and all enum casts.
--   5. Preserve Phase 2.1 semantics exactly:
--      ADR-057 eligibility, existing idempotency behavior, and conditional
--      adjustment.recorded emission for eligible linked adjustments.
--   6. Re-emit function privileges:
--      REVOKE ALL FROM PUBLIC, anon;
--      GRANT EXECUTE TO authenticated, service_role.
--   7. Do not add any client-callable function that accepts arbitrary outbox
--      envelope fields.
--
-- Required post-state assertions:
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
-- Existing adjustment.recorded emission must be preserved by replacing the Phase 2.1
-- adjustment producer as a governed SECURITY DEFINER boundary before this revoke lands.
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
    IF v_existing.amount_cents = p_amount_cents
       AND v_existing.table_id = p_table_id
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

    IF v_existing.amount_cents = p_amount_cents
       AND v_existing.table_id = p_table_id
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
    IF v_existing.amount_cents = p_amount_cents
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

    IF v_existing.amount_cents = p_amount_cents
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
```

### Acceptance Criteria — WS1

- [ ] Pre-state assertions DO NOT raise (helper, uniqueness constraint, and both canonical RPC signatures confirmed)
- [ ] Migration includes the full executable `CREATE OR REPLACE FUNCTION public.rpc_create_financial_adjustment(...)` body before `REVOKE ALL ON FUNCTION public.fn_finance_outbox_emit(...) FROM PUBLIC, anon, authenticated`
- [ ] Post-state helper grant assertion confirms `PUBLIC`, `anon`, and `authenticated` lack direct `fn_finance_outbox_emit(...)` EXECUTE, while `service_role` remains executable
- [ ] `rpc_create_financial_adjustment(...)` is replaced as `SECURITY DEFINER`, uses `SET search_path = ''`, fully qualifies all non-`pg_catalog` objects, preserves the existing public signature, and remains executable by authenticated callers through the RPC
- [ ] `rpc_create_financial_adjustment(...)` emits `adjustment.recorded` after authenticated helper EXECUTE is revoked
- [ ] Catalog assertion confirms `rpc_create_financial_adjustment(...)` has `prosecdef=true`, `search_path=''`, no `PUBLIC` or `anon` EXECUTE, and authenticated/service_role EXECUTE
- [ ] No client-executable function accepts arbitrary `event_type`, `fact_class`, `origin_label`, `table_id`, `player_id`, or `aggregate_id`
- [ ] Both rewritten RPCs use `SET search_path = ''`
- [ ] Both rewritten RPCs fully qualify public/auth objects and return `public.table_fill` / `public.table_credit`
- [ ] Both function bodies contain `fn_finance_outbox_emit` call with hardcoded discriminators
- [ ] `ON CONFLICT DO UPDATE` absent from both function bodies (verify via `\sf` or source inspection)
- [ ] `p_amount_cents > 0` check present in both function bodies before any mutation
- [ ] `SELECT ... FOR UPDATE` replay path present before active-session resolution in both bodies
- [ ] `DO NOTHING RETURNING` null branch re-reads `(casino_id, request_id) FOR UPDATE`, compares semantic payload, and returns exact replay instead of raising
- [ ] `IDEMPOTENCY_CONFLICT:` message prefix on divergent replay in both bodies
- [ ] `npm run db:types-local` exits 0
- [ ] `npm run type-check` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0

### Rollback / Recovery — WS1

If the helper revoke or adjustment hardening fails validation, rollback must restore the last known-good Phase 2.1 adjustment producer and direct helper privilege posture in the same deployment window:
- Re-apply the previous `rpc_create_financial_adjustment(...)` body from `supabase/migrations/20260517234015_wave2_adj_producer_ext.sql` or the hardened replacement, whichever is certified by the failing gate.
- Temporarily restore `GRANT EXECUTE ON FUNCTION public.fn_finance_outbox_emit(uuid, text, text, text, uuid, uuid, uuid, jsonb) TO authenticated` only if needed to unblock existing Phase 2.1 adjustment emission during rollback.
- Re-run the authenticated eligible linked-adjustment integration test and confirm exactly one `adjustment.recorded` row.
- Do not advance WS3 governance closure until helper grants and adjustment emission pass the post-state assertions again.

---

## Workstream 2: I1 Proof + Semantic Contract Tests (WS2_TESTS)

**Executor:** `qa-specialist`

### Context

Follow `tests/failure/i1-atomicity-adjustment.test.ts` as the direct template **only for the TypeScript boundary smoke pattern**. Mock-based tests prove no TypeScript fallback path for outbox writes; they do **not** prove I1 atomicity, rollback, session-total mutation, durable outbox rows, or database concurrency.

Each new file must include both:
1. Static/mock smoke tests for the TypeScript boundary (`RUN_INTEGRATION_TESTS` not required)
2. DB-backed integration tests (`RUN_INTEGRATION_TESTS=true`) that prove source row, `table_session` total, `finance_outbox`, and late-event/audit effects commit or roll back together

Required gate split:
- Unit gate: mock boundary tests must always run in CI.
- Integration gate: DB-backed T1–T12 suites run with `RUN_INTEGRATION_TESTS=true` and are required before merge of the migration. A green static/mock-only run is not sufficient for merge.

TypeScript boundary update:
- `services/table-context/chip-custody.ts` must map database errors whose message starts with `IDEMPOTENCY_CONFLICT:` to the service's idempotency/conflict error contract instead of falling through to generic `TABLE_FILL_REJECTED` / `TABLE_CREDIT_REJECTED`.
- The legacy `23505` fallback may remain for compatibility, but it must not be the only idempotency/conflict path tested after this migration.
- `services/table-context/__tests__/chip-custody.test.ts` must add fill and credit cases proving `IDEMPOTENCY_CONFLICT:` propagation without any direct `finance_outbox` write.

Rollback injection mechanism:
- Use a local/test-only, service-role-only test helper or temporary validation migration that sets a transaction-local GUC such as `app.test_fail_before_fill_credit_outbox=true` and invokes the target RPC in the same transaction.
- Any GUC check must exist only in the temporary validation artifact immediately before `fn_finance_outbox_emit(...)`, raise a controlled `P0001` exception, and be absent from the final production RPC body.
- The helper must be executable by `service_role` only; `PUBLIC`, `anon`, and `authenticated` must be revoked, and integration tests must prove those roles cannot activate the hook.
- Preferred final posture: the helper and GUC branch are local/test-only and are absent from the final production schema. If the helper is not shipped in production, the migration or test setup must drop it before merge and the test must assert it is absent from the final schema.
- If a temporary production-visible GUC branch is used during validation, the final migration must remove it before merge; no production RPC body may retain an activatable failure-injection branch.

Two new test files are required — one per producer path:

### Output Files

**`tests/failure/i1-atomicity-fill.test.ts`** — 12 tests covering:
- T1: Rollback/error — DB-backed rollback injection proves 0 `table_fill`, 0 `finance_outbox`, 0 session-total delta, 0 late-event/audit mutation; mock smoke also proves no TypeScript `from('finance_outbox').insert()` fallback
- T2: Success — DB-backed success proves 1 `table_fill`, 1 `fill.recorded` outbox row, exactly 1 session-total delta, and no separate TS outbox write
- T3: Idempotent replay (same payload) — existing row returned, no source/session/audit/outbox mutation
- T4: Concurrent idempotent replay — both callers receive the same committed row; 1 source row, 1 outbox row, exactly 1 session-total delta
- T5: Delayed replay (session closed) — existing row returned before active-session resolution, no mutation
- T6: Staff lifecycle replay — existing row returned before participant staff validation, no mutation
- T7: Divergent replay — error with `IDEMPOTENCY_CONFLICT:` prefix, no source/session/audit/outbox mutation
- T8: Divergent replay error prefix — asserts SQLSTATE `P0001` and error message starts with `IDEMPOTENCY_CONFLICT:`
- T9: Cross-casino rejection — casino B table or staff participant rejected, no source/session/audit/outbox mutation
- T10: Amount validation — `p_amount_cents <= 0` error raised before mutation
- T11: Semantic contract + helper hardening — outbox has `player_id IS NULL`, approved envelope fields only; `PUBLIC`, `anon`, and `authenticated` lack direct helper EXECUTE; authenticated direct forgery after `set_rls_context_from_staff()` is denied; adjustment producer compatibility remains intact through a governed producer boundary
- T12: Same-casino wrong-table replay — same `request_id` and otherwise identical payload with a different `p_table_id` raises `IDEMPOTENCY_CONFLICT:` and performs no mutation

**`tests/failure/i1-atomicity-credit.test.ts`** — identical structure, `rpc_request_table_credit` as subject, `credit.recorded` discriminators

### Test Pattern

The following is the static TypeScript-boundary smoke pattern only. It is not sufficient as the I1 proof by itself. Add a `RUN_INTEGRATION_TESTS=true` describe block in each file for the DB-backed cases listed above.

```typescript
/** @jest-environment node */
// I1 — Atomicity: rpc_request_table_fill co-locates the finance_outbox INSERT
// inside a single PG transaction boundary (via fn_finance_outbox_emit helper).
// TypeScript layer has NO separate outbox INSERT path.
// T1–T12 per PRD-085 §8 Appendix B plus EXEC-085 same-casino wrong-table replay hardening.
// Phase 2.0 exemplar proof and Phase 2.1 adjustment proof do NOT certify this path.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

function makeSupabase() {
  return {
    rpc: jest.fn(),
    from: jest.fn(),
  } as unknown as SupabaseClient<Database>;
}

const BASE_FILL_ARGS = {
  p_table_id: 'table-fill-1',
  p_chipset: { '25': 4, '100': 2 },
  p_amount_cents: 120000,
  p_delivered_by: 'staff-cashier-1',
  p_received_by:  'staff-pitboss-1',
  p_slip_no: 'FILL-001',
  p_request_id: 'req-fill-001',
};

describe('I1 — Atomicity: rpc_request_table_fill (Phase 2.2)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('T1: RPC error leaves no orphaned outbox row via TypeScript fallback', async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'FORBIDDEN: role cashier cannot request table fills', code: 'P0001' },
    });
    const { error } = await supabase.rpc('rpc_request_table_fill', BASE_FILL_ARGS as never);
    expect(error).toBeTruthy();
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
    expect((supabase.rpc as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('T7: divergent replay — error has IDEMPOTENCY_CONFLICT: prefix', async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        message: 'IDEMPOTENCY_CONFLICT: fill request_id=req-fill-001 already committed with different payload. existing amount_cents=120000, incoming amount_cents=50000',
        code: 'P0001',
      },
    });
    const { error } = await supabase.rpc('rpc_request_table_fill', {
      ...BASE_FILL_ARGS, p_amount_cents: 50000,
    } as never);
    expect(error!.message).toMatch(/^IDEMPOTENCY_CONFLICT:/);
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
  });

  // ... remaining tests follow same mock pattern
});
```

### Acceptance Criteria — WS2

- [ ] `tests/failure/i1-atomicity-fill.test.ts` — 12 tests, all green
- [ ] `tests/failure/i1-atomicity-credit.test.ts` — 12 tests, all green
- [ ] Both files include `RUN_INTEGRATION_TESTS=true` DB-backed suites proving source/session/outbox counts and rollback behavior
- [ ] T7/T8 in both files assert `error.message` matches `/^IDEMPOTENCY_CONFLICT:/`
- [ ] T10 in both files assert error on `p_amount_cents <= 0`
- [ ] T12 in both files asserts same-casino wrong-table replay raises `IDEMPOTENCY_CONFLICT:` and leaves source/session/audit/outbox state unchanged
- [ ] All tests assert `(supabase.from as jest.Mock).mock.calls.toHaveLength(0)` — no TS outbox fallback
- [ ] Concurrent replay tests prove both same-key callers receive the same aggregate id and exactly one session-total delta
- [ ] Security tests prove `PUBLIC`, `anon`, and `authenticated` helper EXECUTE is denied, including an authenticated direct forgery attempt that calls `set_rls_context_from_staff()` before `fn_finance_outbox_emit(...)`
- [ ] `services/player-financial/__tests__/outbox-adjustment-producer.test.ts` proves authenticated eligible linked adjustment still emits one `adjustment.recorded` row after helper grant hardening
- [ ] Catalog test proves `rpc_create_financial_adjustment(...)` is `SECURITY DEFINER`, uses `search_path=''`, and remains executable by authenticated callers after helper revoke
- [ ] Final schema inspection proves no production RPC body retains an activatable failure-injection GUC branch
- [ ] Catalog/source inspection proves both rewritten RPCs use `search_path = ''` and fully qualified public/auth objects
- [ ] No consumer, projection, replay harness, or service test synthesizes `fill.recorded` or `credit.recorded`
- [ ] `services/table-context/__tests__/chip-custody.test.ts` asserts fill/credit `IDEMPOTENCY_CONFLICT:` propagation and does not rely only on legacy `23505` fallback behavior
- [ ] Relay operability smoke remains green; poison-row/backlog bounded-retry/dead-letter risk is explicitly accepted or deferred to Phase 2.3 with owner/date
- [ ] `services/player-financial/__tests__/` suite remains green (no regression)
- [ ] Existing `tests/failure/` suite remains green

---

## Workstream 3: Phase 2.2 Governance Closure (WS3_GOVERNANCE)

**Executor:** `lead-architect`

### Changes Required

**`WAVE-2-TRACKER.json`:**
- Add Phase 2.2 entry to `phases` array with `status: "complete"`
- Update `cursor.active_phase` → `"2.3"`
- Update `cursor.phase_status` → `"complete_2_2_phase_2_3_pending"`
- Update `cursor.last_closed_phase` → `"2.2"`, `last_closed_date` → `"2026-05-18"`, `last_closed_prd` → `"PRD-085"`, `last_closed_exec` → `"EXEC-085"`
- Add I1 validation matrix entries for `rpc_request_table_fill` and `rpc_request_table_credit` (phase: "2.2", harness_result: "PASS")
- Update `deferred_register.WS_PRODUCER_FILL.status` → `"complete"` (if entry exists)
- Update `deferred_register.WS_PRODUCER_CREDIT.status` → `"complete"` (if entry exists)

**`WAVE-2-PROGRESS-TRACKER.md`:**
- Update Phase 2.2 status to complete with same commit/date

**`ROLLOUT-TRACKER.json`:**
- Update `active_phase` → `"2.3"`
- Update `last_closed_phase` → `"2.2"`

### Acceptance Criteria — WS3

- [ ] `cursor.active_phase` = `"2.3"` in WAVE-2-TRACKER.json
- [ ] Phase 2.2 entry in `phases` array with `status: "complete"`
- [ ] ROLLOUT-TRACKER.json `active_phase` = `"2.3"`
- [ ] WAVE-2-PROGRESS-TRACKER.md reflects Phase 2.2 completion

---

## Intake Traceability Audit (FIB-S gate)

```
[INTAKE TRACEABILITY] EXEC-085 vs FIB-S FIB-S-W2-OUTBOX-001
─────────────────────────────────────────────────────────────
Workstream coverage:    3/5 capabilities (CAP-1, CAP-5 covered by WS1+WS2; CAP-2 inherited
                        Phase 2.0/2.1; CAP-3 inherited; CAP-4 Phase 2.3+)
Anti-invention (desc):  clean — no new surfaces beyond authoring RPC transaction boundary
Anti-invention (paths): 0 API output paths — http_boundary: false, no new routes
Open questions:         0 open — all resolved per PRD-085 §7 (none outstanding)
Hard rule visibility:   RULE-1 ✓ (WS1 AC), RULE-2 ✓ (WS1 AC simultaneous landing),
                        RULE-5 ✓ (WS2 T11 immutability), RULE-6 ✓ (WS1 hardcoded discriminators)
─────────────────────────────────────────────────────────────
STATUS: PASS (CAP-2, CAP-3, CAP-4 are transport-substrate inherited; WS3 is infrastructure)
```

---

## Validation Script

```bash
python .claude/skills/build-pipeline/scripts/validate-execution-spec.py \
    docs/21-exec-spec/EXEC-085-wave2-phase2-2-fill-credit-producer-ext.md
```

---

## Definition of Done Cross-Reference

All DoD items from PRD-085 §8 map to workstreams:
- Functionality (fill/credit atomicity, simultaneous landing) → WS1_MIGRATION
- Data & Integrity (discriminator fields, idempotency, payload contract) → WS1_MIGRATION + WS2_TESTS
- Security (no TS fallback, hardcoded labels) → WS1_MIGRATION + WS2_TESTS (T1)
- Testing (I1 proof, contract, conflict, cross-casino, amount) → WS2_TESTS
- Operational Readiness (db:types-local, type-check, lint, build) → WS1_MIGRATION gate
- Governance (WAVE-2-TRACKER, ROLLOUT-TRACKER updates) → WS3_GOVERNANCE

---
id: EXEC-087
title: Wave 2 Phase 2.3 — Class A Lifecycle Completeness Proof
prd: PRD-087
prd_path: docs/10-prd/PRD-087-wave2-phase-2.3-class-a-lifecycle-completeness-proof-v1.md
fib_h: FIB-H-W2-OUTBOX-001
fib_s: null
status: pending
created: 2026-05-19
complexity_prescreen: full
fib_s_loaded: false
write_path_classification: detected
e2e_mandate_waiver: "relay-cron-internal-no-user-trigger — write paths are internal relay/consumer RPCs; no browser-triggerable operator write surface added; write-path coverage via WS3_ROUTES route tests + WS4_TESTS Jest integration invariant tests (I3/I4)"
gov010_check: "waived:wave-2-phase-2.3-continuation-governing-adrs-in-affects-field"
workstreams:
  WS1A_GATE_A_DB:
    name: "Gate A — Envelope Schema & Producer Amendment"
    executor: backend-service-builder
    executor_type: skill
    bounded_context: PlayerFinancialService
    depends_on: []
    estimated_complexity: high
    outputs:
      - supabase/migrations/{timestamp}_add_finance_outbox_gaming_day_nullable.sql
      - supabase/migrations/{timestamp}_amend_fn_finance_outbox_emit_gaming_day.sql
      - supabase/migrations/{timestamp}_amend_all_producers_gaming_day.sql
      - supabase/migrations/{timestamp}_backfill_finance_outbox_gaming_day.sql
      - supabase/migrations/{timestamp}_harden_finance_outbox_gaming_day_not_null.sql
      - supabase/migrations/{timestamp}_update_finance_outbox_immutability.sql
      - services/player-financial/dtos.ts
    gate: schema-validation

  WS1B_GATE_B_DB:
    name: "Gate B — Projection Store, Lifecycle Signal & Consumer RPC"
    executor: backend-service-builder
    executor_type: skill
    bounded_context: PlayerFinancialService
    depends_on: [WS1A_GATE_A_DB]
    estimated_complexity: high
    outputs:
      - supabase/migrations/{timestamp}_create_visit_class_a_projection.sql
      - supabase/migrations/{timestamp}_create_gaming_day_lifecycle.sql
      - supabase/migrations/{timestamp}_create_rpc_process_class_a_projection.sql
      - supabase/migrations/{timestamp}_create_rpc_close_gaming_day.sql
      - supabase/migrations/{timestamp}_create_rpc_claim_class_a_outbox_batch.sql
    gate: schema-validation

  WS2_CONSUMER:
    name: "Class A Consumer Service Integration"
    executor: backend-service-builder
    executor_type: skill
    bounded_context: PlayerFinancialService
    depends_on: [WS1B_GATE_B_DB]
    estimated_complexity: medium
    outputs:
      - services/player-financial/outbox-consumer.ts
    gate: type-check

  WS3_ROUTES:
    name: "Completeness Logic — Financial Summary & Modal Routes"
    executor: api-builder
    executor_type: skill
    bounded_context: PlayerFinancialService
    depends_on: [WS1B_GATE_B_DB]
    estimated_complexity: medium
    outputs:
      - services/player-financial/crud.ts
      - services/player-financial/mappers.ts
      - app/api/v1/visits/[visitId]/financial-summary/route.ts
      - app/api/v1/rating-slips/[id]/modal-data/route.ts
    gate: type-check

  WS4_TESTS:
    name: "I3/I4 Invariant Tests & Producer Amendment Tests"
    executor: qa-specialist
    executor_type: skill
    bounded_context: PlayerFinancialService
    depends_on: [WS2_CONSUMER, WS3_ROUTES]
    estimated_complexity: medium
    outputs:
      - services/player-financial/__tests__/outbox-consumer.test.ts
      - services/player-financial/__tests__/outbox-producers.test.ts
      - services/player-financial/__tests__/outbox-adjustment-producer.test.ts
      - services/player-financial/__tests__/class-a-projection.int.test.ts
    gate: test-pass

  WS5_TRACKER:
    name: "Wave 2 Tracker & Rollout Map Update"
    executor: lead-architect
    executor_type: skill
    bounded_context: governance
    depends_on: [WS4_TESTS]
    estimated_complexity: low
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json
      - docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md
    gate: build

execution_phases:
  - phase: 1
    parallel: [WS1A_GATE_A_DB]
    description: "Gate A envelope schema — add gaming_day (nullable), amend fn + all 5 producers, backfill, harden NOT NULL, update immutability trigger. Human gate: Gate A proofs pass."
  - phase: 2
    parallel: [WS1B_GATE_B_DB]
    description: "Gate B schema — create visit_class_a_projection, gaming_day_lifecycle, rpc_process_class_a_projection, rpc_close_gaming_day. Human gate: schema ready, db:types-local exits 0."
  - phase: 3
    parallel: [WS2_CONSUMER, WS3_ROUTES]
    description: "Consumer service routing (ledger-only) + completeness logic in financial-summary and modal-data routes. Parallel execution."
  - phase: 4
    parallel: [WS4_TESTS]
    description: "I3/I4 invariant tests, producer regression tests, non-ledger preservation test."
  - phase: 5
    parallel: [WS5_TRACKER]
    description: "Wave 2 tracker Phase 2.3 closure + rollout map update."

gates:
  schema-validation:
    type: migration
    human_gate: true
    commands:
      - "npm run db:types-local"
      - "npm run type-check"
      - "npm run lint"
    passing_criteria: |
      Gate A proofs (after WS1A):
      - finance_outbox.gaming_day NOT NULL on all rows (SELECT COUNT(*) WHERE gaming_day IS NULL = 0)
      - fn_finance_outbox_emit (8-param) does NOT exist in pg_proc
      - fn_finance_outbox_emit (9-param) exists as SECURITY DEFINER, service_role EXECUTE only
      - All 5 producers pass their existing test suites
      - fn_finance_outbox_immutable_envelope body covers gaming_day
      - FinancialOutboxEventDTO.gaming_day resolves from db:types-local
      - All producer write-path integration tests pass after helper privilege/signature changes; no permission-denied regressions
      Gate B proofs (after WS1B):
      - visit_class_a_projection exists with service_role-only RLS
      - gaming_day_lifecycle exists with service_role-only RLS
      - rpc_process_class_a_projection is SECURITY DEFINER, EXECUTE to service_role only
      - rpc_close_gaming_day is SECURITY DEFINER, EXECUTE to service_role only
      - db:types-local exits 0 with new tables in generated types
  type-check:
    type: build
    commands:
      - "npm run type-check"
      - "npm run lint"
    passing_criteria: "All exit 0; no as-any casts introduced"
  test-pass:
    type: test
    commands:
      - "RUN_INTEGRATION_TESTS=true npx jest --testPathPattern='class-a-projection' --forceExit > /tmp/test-class-a.log 2>&1"
      - "npx jest --testPathPattern='outbox-consumer' --forceExit > /tmp/test-consumer.log 2>&1"
      - "npx jest --testPathPattern='outbox-producers|outbox-adjustment-producer' --forceExit > /tmp/test-producers.log 2>&1"
    passing_criteria: "I3 duplicate delivery, I4 replay, non-ledger preservation, amount-unit, backlog-empty completeness, and producer regression tests pass"
  build:
    type: build
    commands:
      - "npm run type-check"
      - "npm run lint"
      - "npm run build"
    passing_criteria: "All exit 0"
---

# EXEC-087 — Wave 2 Phase 2.3: Class A Lifecycle Completeness Proof

## Overview

This EXEC-SPEC implements PRD-087: resolve DEC-1 by proving that one ledger-authoritative Class A outbox stream can update one visit-level projection and emit a lifecycle-aware completeness signal. This slice does **not** consume operational events, does not build grind/fill/credit projections, and does not introduce any operator-facing UI.

Work is structured as two hard-sequential gates. **Gate B must not be activated before Gate A proofs pass.**

```
Gate A (envelope compat) → [HUMAN PROOF GATE] → Gate B (projection + lifecycle) → [HUMAN PROOF GATE] → Consumer + Routes (parallel) → Tests → Tracker
```

**Vertical collapse boundary**: One Class A event stream (`fact_class = 'ledger'`) → one projection store → one lifecycle-aware completeness signal. All other paths remain Phase 2.4.

---

## Architectural Decisions (for EXEC-087)

### DEC-EXEC-1: Gaming-Day Lifecycle Close Signal Mechanism

**Decision**: Dedicated `gaming_day_lifecycle` table with `(casino_id, gaming_day)` PK. Row presence = closed. No additional column or signal needed.

**Rationale**: Simplest possible mechanism with no operator UI requirement. INSERT-only semantic. Testable via direct service_role INSERT. Queryable in single LEFT JOIN with projection store.

**Implementation contract**:
- `rpc_close_gaming_day(p_casino_id UUID, p_gaming_day DATE)` SECURITY DEFINER, service_role only
- `p_casino_id` is a trusted parameter — service_role callers do not have `app.casino_id` automatically; the caller provides it explicitly
- INSERT ON CONFLICT DO NOTHING (idempotent close)

### DEC-EXEC-2: Consumer Projection RPC vs. TypeScript-side Merge

**Decision**: All projection writes go through `rpc_process_class_a_projection(p_message_id UUID)` SECURITY DEFINER PostgreSQL RPC. No TypeScript-level split between processed_messages write and projection write.

**Rationale**: The I3 atomicity invariant (processed_messages INSERT + projection UPSERT in same PG transaction) cannot be guaranteed by TypeScript. The RPC is the single atomicity boundary, identical to `rpc_commit_consumer_receipt` pattern established in Phase 2.0.

### DEC-EXEC-3: Backfill Strategy for Operational Rows in Gate A

**Decision for ledger rows**: `UPDATE finance_outbox fo SET gaming_day = pft.gaming_day FROM player_financial_transaction pft WHERE pft.id = fo.aggregate_id AND fo.fact_class = 'ledger'` — authoritative from PFT source.

**Decision for grind.observed**: `aggregate_id` → `player_financial_transaction.id` (GRIND_BUYIN row created by `rpc_record_grind_observation`). Same join as ledger rows. Authoritative.

**Decision for fill.recorded / credit.recorded**: `aggregate_id` → `table_fill.id` / `table_credit.id`. These tables do **not** have a `gaming_day` column. `compute_gaming_day(fo.casino_id, fill.created_at)` is **not permitted** — that is timestamp inference and is banned by the PRD authoritative-derivation rule.

Gate A fails closed for existing `fill.recorded` and `credit.recorded` rows unless one of the following is true:
1. The authoring source table (`table_fill` / `table_credit`) is amended with a stable `gaming_day` column in a remediation migration that runs before the backfill; or
2. The environment is local-disposable only — existing operational rows may be cleared before rerunning migrations (this is **not** a shared/staging/remote remediation strategy); or
3. No `fill.recorded` or `credit.recorded` rows exist in the environment (pre-state assertion: `SELECT COUNT(*) FROM finance_outbox WHERE event_type IN ('fill.recorded', 'credit.recorded')` = 0 → proceed; else → `RAISE EXCEPTION` and halt Gate A).

The backfill migration must `RAISE EXCEPTION` for any outbox row with no resolved `gaming_day` after applying all rules. Gate A fails closed; do not harden NOT NULL while NULL rows remain.

**Fail-closed rule**: No timestamp inference (`created_at → compute_gaming_day`), no synthetic placeholder, no NULL-resolved fake value is permitted in the backfill for any event type.

### DEC-EXEC-4: `rpc_process_class_a_projection` Return Values

`'processed'` — new event, both writes committed
`'duplicate'` — message_id already in processed_messages, no-op
`'skipped_operational'` — `fact_class != 'ledger'`, row untouched (processed_at IS NULL preserved)
`'not_found'` — no outbox row with matching event_id

Consumer treats `'duplicate'` as success (prior commit is durable), `'skipped_operational'` as internal error (routing should have prevented this), `'not_found'` as error to log.

### DEC-EXEC-5: Mixed-Source Surface Classification

Both affected surfaces are **Class-A-only** for the completeness-gated fields:

| Surface | Fields | Classification | Basis |
|---------|--------|----------------|-------|
| `GET /api/v1/visits/{visitId}/financial-summary` | `total_in`, `total_out`, `net_amount` | Class-A-only | Aggregates `player_financial_transaction` rows; buyin/cashout/adjustment/grind_buyin are all `fact_class='ledger'`; fill/credit do not create PFT rows |
| `GET /api/v1/rating-slips/{id}/modal-data` (FinancialSectionDTO) | `totalCashIn`, `totalCashOut`, `netPosition` | Class-A-only | Same PFT source scoped to visit |

Both surfaces may emit `'complete'` after Gate B when gaming_day is closed, projection data exists, **and** the Class A backlog (pending ledger events in `finance_outbox` for that `casino_id` + `gaming_day` with `processed_at IS NULL`) is zero.

---

## Workstream Specifications

### WS1A_GATE_A_DB — Gate A: Envelope Schema & Producer Amendment

**Executor**: `backend-service-builder`

#### Migration Sequence (ordered)

All timestamps must sort after `20260519160443`. Use `date +%Y%m%d%H%M%S` at implementation time.

| Order | Migration Name Pattern | Purpose |
|-------|----------------------|---------|
| 1 | `{ts}_add_finance_outbox_gaming_day_nullable.sql` | `ALTER TABLE finance_outbox ADD COLUMN gaming_day DATE NULL` — safe first DDL; no impact on existing rows or functions |
| 2 | `{ts}_amend_fn_finance_outbox_emit_gaming_day.sql` | DROP old 8-param `fn_finance_outbox_emit`; CREATE new 9-param with `p_gaming_day DATE NOT NULL`; REVOKE/GRANT to service_role only; validate arg in body (`IF p_gaming_day IS NULL THEN RAISE`); INSERT passes `p_gaming_day` to `finance_outbox.gaming_day` |
| 3 | `{ts}_amend_all_producers_gaming_day.sql` | Amend all 5 producers atomically (single migration) to pass `gaming_day` to the 9-param `fn_finance_outbox_emit`. **Privilege triangle must close before this migration ships**: since `fn_finance_outbox_emit` EXECUTE is service_role-only (revoked from authenticated in Phase 2.2), any SECURITY INVOKER producer that an authenticated role can execute creates a broken path. **Pre-state assertion**: verify `rpc_create_financial_txn` EXECUTE is NOT grantable to authenticated role (PostgREST permission denied). If `rpc_create_financial_txn` is executable by authenticated, this migration must upgrade it to SECURITY DEFINER before proceeding. Do not ship the gaming_day amendment while the privilege triangle is open. |
| 4 | `{ts}_backfill_finance_outbox_gaming_day.sql` | Backfill per DEC-EXEC-3 rules. UPDATE in two authoritative passes: (a) ledger rows (`fact_class='ledger'`) via PFT join on aggregate_id; (b) grind.observed via PFT join on aggregate_id. For fill.recorded and credit.recorded: pre-assert row count = 0; if non-zero → RAISE EXCEPTION (timestamp derivation banned; see DEC-EXEC-3 options). Post-assert: `SELECT COUNT(*) FROM finance_outbox WHERE gaming_day IS NULL = 0` → RAISE EXCEPTION if non-zero (Gate A fails closed). |
| 5 | `{ts}_harden_finance_outbox_gaming_day_not_null.sql` | `ALTER TABLE finance_outbox ALTER COLUMN gaming_day SET NOT NULL` — safe only after backfill confirms zero NULLs |
| 6 | `{ts}_update_finance_outbox_immutability.sql` | `CREATE OR REPLACE FUNCTION fn_finance_outbox_immutable_envelope()` adding `OLD.gaming_day IS DISTINCT FROM NEW.gaming_day OR` to the immutability guard body |

#### FinancialOutboxEventDTO Update (after M5, db:types-local)

File: `services/player-financial/dtos.ts`

Add `'gaming_day'` to the `FinancialOutboxEventDTO` Pick:

```ts
export type FinancialOutboxEventDTO = Pick<
  FinancialOutboxRow,
  | 'event_id'
  | 'event_type'
  | 'casino_id'
  | 'table_id'
  | 'player_id'
  | 'aggregate_id'
  | 'gaming_day'      // ← add after Gate A migrations + db:types-local
  | 'created_at'
  | 'processed_at'
> & {
  fact_class: 'ledger' | 'operational';
  origin_label: 'actual' | 'estimated' | 'observed' | 'compliance';
  payload: Record<string, unknown>;
};
```

#### Gate A Acceptance Criteria

- [ ] `finance_outbox.gaming_day` is NOT NULL constraint active after M5
- [ ] `SELECT COUNT(*) FROM finance_outbox WHERE gaming_day IS NULL` = 0
- [ ] `fn_finance_outbox_emit(uuid,text,text,text,uuid,uuid,uuid,jsonb)` (8-param) does NOT exist in `pg_proc`
- [ ] `fn_finance_outbox_emit` (9-param) exists as SECURITY DEFINER, EXECUTE to service_role only
- [ ] All 5 producers compile and pass their existing test suites after amendment
- [ ] `fn_finance_outbox_immutable_envelope` trigger body covers `gaming_day`
- [ ] Helper privilege triangle is closed: either `rpc_create_financial_txn` authenticated EXECUTE is denied (PostgREST test), or it has been upgraded to SECURITY DEFINER
- [ ] All producer write paths pass integration tests post-amendment (no `permission denied` errors)
- [ ] `FinancialOutboxEventDTO.gaming_day` resolves to the generated DB type for `finance_outbox.gaming_day`; after NOT NULL hardening this type must not be nullable
- [ ] `npm run db:types-local` exits 0
- [ ] `npm run type-check` exits 0

---

### WS1B_GATE_B_DB — Gate B: Projection Store, Lifecycle Signal & Consumer RPC

**Executor**: `backend-service-builder`
**Depends on**: WS1A_GATE_A_DB (Gate A proofs passed)

#### Table: `visit_class_a_projection`

```
casino_id       UUID        NOT NULL REFERENCES casino(id) ON DELETE CASCADE
visit_id        UUID        NOT NULL REFERENCES visit(id) ON DELETE CASCADE
gaming_day      DATE        NOT NULL
total_in        BIGINT      NOT NULL DEFAULT 0   -- integer cents; buyin events (direction='in')
total_out       BIGINT      NOT NULL DEFAULT 0   -- integer cents; cashout events (direction='out')
adjustment_net  BIGINT      NOT NULL DEFAULT 0   -- integer cents; signed: positive adj adds, negative adj subtracts
event_count     INT         NOT NULL DEFAULT 0
updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
PRIMARY KEY (casino_id, visit_id, gaming_day)
```

RLS: `service_role` SELECT, INSERT, UPDATE only. No `authenticated` policies. All access via `rpc_process_class_a_projection` (SECURITY DEFINER).

Note: `origin_label` is an outbox **envelope** column — it is NOT payload content. It is NOT stored in the projection (ADR-054 D5). It must not be upgraded or inferred in the projection path. Route/mapper output for Class A-only projection values has `origin_label = 'actual'` for the projection authority signal — tests must assert no `estimated` or `observed` event can enter this path.

#### Table: `gaming_day_lifecycle`

```
casino_id   UUID        NOT NULL REFERENCES casino(id) ON DELETE CASCADE
gaming_day  DATE        NOT NULL
closed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
PRIMARY KEY (casino_id, gaming_day)
```

RLS: `service_role` SELECT, INSERT only. No `authenticated` policies. Closed window = row present. No UPDATE or DELETE policies (close is permanent within Phase 2.3).

#### RPC: `rpc_process_class_a_projection(p_message_id UUID) RETURNS TEXT`

Security: `SECURITY DEFINER SET search_path = ''`
Grant: EXECUTE to `service_role` only
`casino_id` is derived exclusively from the locked `finance_outbox` row selected by `p_message_id`; the caller supplies no tenant or projection fields. No `app.casino_id` session context is required for this consumer RPC.

**Body logic** (single PG transaction):

```
1. SELECT event_id, fact_class, origin_label, casino_id, player_id, gaming_day, payload
   FROM finance_outbox WHERE event_id = p_message_id
   -- v_casino_id, v_gaming_day, v_visit_id all derived from this row; caller supplies nothing
   → if no row: RETURN 'not_found'

2. IF fact_class != 'ledger': RETURN 'skipped_operational'
   (processed_at IS NULL preserved; no writes)

3. SELECT 1 FROM processed_messages WHERE message_id = p_message_id
   → if found: RETURN 'duplicate'

4. BEGIN atomic block:
   a. INSERT INTO processed_messages (message_id, casino_id, processed_at)
      VALUES (p_message_id, v_casino_id, NOW())
      ON CONFLICT DO NOTHING  -- belt-and-suspenders; step 3 already checked

   b. Extract from payload: v_amount_cents, v_direction (or event_type for adjustment routing)
      Pre-state assertion in migration: verify payload shape includes `amount_cents` and
      `direction` (or equivalent) for all three event types (buyin.recorded, cashout.recorded,
      adjustment.recorded) before coding the UPSERT. Do not assume field names without proof.

   c. UPSERT INTO visit_class_a_projection (casino_id, visit_id, gaming_day,
                                             total_in, total_out, adjustment_net,
                                             event_count, updated_at)
      VALUES (v_casino_id, v_visit_id, v_gaming_day,
              CASE WHEN v_direction = 'in' THEN v_amount_cents ELSE 0 END,
              CASE WHEN v_direction = 'out' THEN v_amount_cents ELSE 0 END,
              CASE WHEN v_event_type = 'adjustment.recorded' THEN v_signed_delta ELSE 0 END,
              1, NOW())
      ON CONFLICT (casino_id, visit_id, gaming_day)
      DO UPDATE SET
        total_in = visit_class_a_projection.total_in + EXCLUDED.total_in,
        total_out = visit_class_a_projection.total_out + EXCLUDED.total_out,
        adjustment_net = visit_class_a_projection.adjustment_net + EXCLUDED.adjustment_net,
        event_count = visit_class_a_projection.event_count + 1,
        updated_at = NOW()

   d. UPDATE finance_outbox SET processed_at = NOW() WHERE event_id = p_message_id
      On duplicate delivery, processed_at is already set from the first successful processing; acceptable.
      On projection failure, processed_at remains NULL so the row can be retried.
   COMMIT (all three writes or neither)

5. RETURN 'processed'
```

Notes:
- `visit_id` extracted from `payload->>'visit_id'` (proven present in all ledger rows)
- `amount` extracted from payload in integer cents (same unit as PFT source)
- `fact_class` read from outbox **envelope** column — never from payload content
- `origin_label` read from outbox **envelope** column — not from payload. NOT stored in projection.
- Adjustment routing: implementer must verify the payload field name and sign convention for `adjustment.recorded` events before writing CASE logic. If adjustments carry signed `amount_delta` rather than `direction + amount`, UPSERT arithmetic changes accordingly.

#### RPC: `rpc_claim_class_a_outbox_batch(p_batch_size INT DEFAULT 10) RETURNS SETOF finance_outbox`

Security: `SECURITY DEFINER SET search_path = ''`
Grant: EXECUTE to `service_role` only

Purpose: Ledger-only claim for Phase 2.3 consumer. Claims only `fact_class = 'ledger'` rows with `processed_at IS NULL`. Do not reuse or modify `rpc_claim_outbox_batch` (which Phase 2.4 will use for operational events).

Body: `SELECT ... FROM finance_outbox WHERE fact_class = 'ledger' AND processed_at IS NULL ORDER BY event_id LIMIT p_batch_size FOR UPDATE SKIP LOCKED`

Ordering note: events are ordered globally by `event_id` (UUIDv7, time-sortable). If I4 replay tests use `(casino_id, table_id, event_id)` scoped ordering, align this ORDER BY to match so claim order and replay order are consistent.

The Phase 2.3 relay worker must call `rpc_claim_class_a_outbox_batch` — not `rpc_claim_outbox_batch`. TypeScript-side skip of operational events in `runConsumer` is a defensive guard only; primary containment is at the claim level.

#### RPC: `rpc_close_gaming_day(p_casino_id UUID, p_gaming_day DATE) RETURNS VOID`

Security: `SECURITY DEFINER SET search_path = ''`
Grant: EXECUTE to `service_role` only

`p_casino_id` is a trusted parameter (service_role-only; no authenticated path). Service_role callers do not have `app.casino_id` set automatically — the caller provides it explicitly.

Body: `INSERT INTO gaming_day_lifecycle (casino_id, gaming_day) VALUES (p_casino_id, p_gaming_day) ON CONFLICT DO NOTHING`

#### Gate B Acceptance Criteria

- [ ] `visit_class_a_projection` table exists, service_role-only RLS, NOT NULL constraints enforced
- [ ] `gaming_day_lifecycle` table exists, service_role-only RLS
- [ ] `rpc_process_class_a_projection` is SECURITY DEFINER, EXECUTE to service_role only
- [ ] `rpc_process_class_a_projection` returns `'duplicate'` on second call with same `message_id` (I3 proof at SQL layer)
- [ ] `rpc_process_class_a_projection` returns `'skipped_operational'` for `fact_class='operational'` rows without modifying `processed_at`
- [ ] `rpc_close_gaming_day` is SECURITY DEFINER, EXECUTE to service_role only, accepts `p_casino_id`
- [ ] `rpc_claim_class_a_outbox_batch` is SECURITY DEFINER, claims only `fact_class='ledger'` rows
- [ ] `processed_messages.message_id` key shape verified: UUID matches `finance_outbox.event_id`
- [ ] `rpc_process_class_a_projection` sets `finance_outbox.processed_at` for successfully processed ledger rows, and leaves it NULL on projection failure or skipped operational rows
- [ ] `npm run db:types-local` exits 0 (new tables in generated types)

---

### WS2_CONSUMER — Class A Consumer Service Integration

**Executor**: `backend-service-builder`
**Depends on**: WS1B_GATE_B_DB

#### File: `services/player-financial/outbox-consumer.ts`

**Primary containment is at the claim level**: the Phase 2.3 relay worker must call `rpc_claim_class_a_outbox_batch` (ledger-only), not `rpc_claim_outbox_batch`. Operational rows are never claimed by this consumer; they cannot loop.

`runConsumer` receives only ledger events from the claim. The `fact_class !== 'ledger'` guard in `runConsumer` is a **defensive backstop only** — it protects against misconfiguration, not normal operation.

Two changes required:
1. Update relay worker (wherever `rpc_claim_outbox_batch` is called) to call `rpc_claim_class_a_outbox_batch` for Phase 2.3
2. `runConsumer`: replace `rpc_commit_consumer_receipt` with `rpc_process_class_a_projection` for ledger events; defensive `fact_class` guard remains

The `rpc_commit_consumer_receipt` call is **replaced** by `rpc_process_class_a_projection`. They are not both called.

Updated return type: `'processed' | 'duplicate' | 'skipped' | Error`

#### Ledger-Only Claim Path

```ts
export type ConsumerResult = 'processed' | 'duplicate' | 'skipped' | Error;

export async function runConsumer(
  supabase: SupabaseClient<Database>,
  event: FinancialOutboxEventDTO,
): Promise<ConsumerResult> {
  if (event.fact_class !== 'ledger') {
    return 'skipped'; // Non-ledger rows belong to Phase 2.4
  }

  const { data, error } = await supabase.rpc('rpc_process_class_a_projection', {
    p_message_id: event.event_id,
  });

  if (error) return error;
  if (data === 'skipped_operational') return error ?? new Error('unexpected: ledger routed to skipped_operational');
  return data as 'processed' | 'duplicate';
}
```

#### Consumer Acceptance Criteria

- [ ] Consumer returns `'skipped'` for `fact_class='operational'` events without calling any RPC
- [ ] Consumer calls `rpc_process_class_a_projection` (not `rpc_commit_consumer_receipt`) for `fact_class='ledger'` events
- [ ] Consumer handles `'duplicate'` from RPC without error (durable prior commit is success)
- [ ] Existing `outbox-consumer.test.ts` tests pass after modification (update mocks as needed)
- [ ] `ConsumerResult` type includes `'skipped'`
- [ ] `npm run type-check` exits 0

---

### WS3_ROUTES — Completeness Logic: Financial Summary & Modal Routes

**Executor**: `api-builder`
**Depends on**: WS1B_GATE_B_DB

No new routes. No OpenAPI changes. DTO shape unchanged — completeness field already exists; only the emitted value changes.

#### Service Layer Addition: `services/player-financial/crud.ts`

Add function `getVisitClassACompleteness(supabase, visitId: string, casinoId: string)`:
- Query: LEFT JOIN `visit_class_a_projection` + `gaming_day_lifecycle` for the visit's current gaming_day
- Returns: `'complete' | 'partial' | 'unknown'`
- Logic (see §Completeness Derivation Logic below)

#### Completeness Derivation Logic

```
Inputs:
  - visit_class_a_projection row for (casino_id, visit_id, gaming_day)
  - gaming_day_lifecycle row for (casino_id, gaming_day)
  - pending Class A backlog count: SELECT COUNT(*) FROM finance_outbox
      WHERE casino_id = :casino_id
        AND gaming_day = :gaming_day
        AND fact_class = 'ledger'
        AND processed_at IS NULL

Logic:
  1. If no projection row exists for visit → return 'unknown'
  2. If projection row exists AND gaming_day is open (no gaming_day_lifecycle row) → return 'partial'
  3. If projection row exists AND gaming_day is closed AND backlog count > 0 → return 'partial'
  4. If projection row exists AND gaming_day is closed AND backlog count = 0 → return 'complete'

Note: 'complete' is only safe when the window is closed AND no pending Class A events remain.
Deferring the backlog check to Phase 2.5 would allow false-complete emission during drain lag —
that is the semantic lie this system exists to prevent.
```

**Visit scoping for backlog check**: If `visit_id` is indexed on `finance_outbox.payload->>'visit_id'`, scope the backlog query to the visit. If not, `casino_id + gaming_day + ledger` is the acceptable conservative scope for Phase 2.3.

**gaming_day for the query**: Use the visit's `gaming_day` from the `visit_class_a_projection` row (i.e., the gaming_day of the most recent projection update). For a visit spanning multiple gaming days, this returns the status of the most recently active gaming day. Phase 2.4 handles multi-day visit aggregation.

#### Mapper Updates: `services/player-financial/mappers.ts`

Replace hardcoded `completeness: { status: 'unknown' }` in financial summary mapper and FinancialSectionDTO mapper with the result of `getVisitClassACompleteness`. If the completeness query fails, fall back to `'unknown'` (existing behaviour is safe default).

#### Route Updates

**`app/api/v1/visits/[visitId]/financial-summary/route.ts`**: No structural change. `service.getVisitSummary(visitId)` already returns the DTO — update the service/mapper layer to populate completeness, not the route handler.

**`app/api/v1/rating-slips/[id]/modal-data/route.ts`**: Same pattern — completeness derived in mapper/service layer, not in route handler.

#### WS3 Acceptance Criteria

- [ ] `GET /api/v1/visits/{visitId}/financial-summary` returns `completeness.status: 'partial'` when gaming_day is open and projection data exists
- [ ] `GET /api/v1/visits/{visitId}/financial-summary` returns `completeness.status: 'partial'` when gaming_day is closed but pending Class A backlog > 0
- [ ] `GET /api/v1/visits/{visitId}/financial-summary` returns `completeness.status: 'complete'` when gaming_day is closed AND pending Class A backlog = 0 AND projection data exists
- [ ] `GET /api/v1/visits/{visitId}/financial-summary` returns `completeness.status: 'unknown'` when no projection data exists
- [ ] `GET /api/v1/rating-slips/{id}/modal-data` FinancialSectionDTO fields follow same logic
- [ ] No `'unknown'` emitted when projection data exists (regression guard for DEC-1)
- [ ] No `as any` casts introduced
- [ ] `npm run type-check` exits 0

---

### WS4_TESTS — I3/I4 Invariant Tests & Producer Amendment Tests

**Executor**: `qa-specialist`
**Depends on**: WS2_CONSUMER, WS3_ROUTES

#### New Test File: `services/player-financial/__tests__/class-a-projection.int.test.ts`

Integration tests (Node environment, real Supabase schema):

**I3 — Duplicate delivery test (consumer re-verification)**:
- Setup: insert one ledger event into `finance_outbox`
- Action: call `rpc_process_class_a_projection` twice with same `message_id`
- Assert: second call returns `'duplicate'`; `SELECT COUNT(*) FROM visit_class_a_projection` = 1 (not 2); `SELECT COUNT(*) FROM processed_messages WHERE message_id = ?` = 1; `finance_outbox.processed_at IS NOT NULL` after first successful call; duplicate call leaves projection count unchanged; operational skipped rows remain `processed_at IS NULL`

**I4 — Replay test (consumer re-verification)**:
- Setup: process 3 ledger events; record projection state
- Action: truncate `visit_class_a_projection`; delete/reset `processed_messages` for the replay fixture; set `finance_outbox.processed_at = NULL` for the same replay fixture events; replay all 3 events in the same ordering used by the claim path
- Assert: resulting projection total_in, total_out, event_count matches pre-truncation state

**Non-ledger preservation test**:
- Setup: insert one `fact_class='operational'` event into `finance_outbox`
- Action: call `runConsumer` with this event
- Assert: returns `'skipped'`; `finance_outbox.processed_at IS NULL` for that row; no `processed_messages` row inserted

**Amount unit test**:
- Setup: insert one ledger event with `amount_cents=1000` in payload
- Action: call `rpc_process_class_a_projection`
- Assert: `visit_class_a_projection.total_in = 1000` (not 100000 or 10) — no 100× corruption

**Backlog-empty completeness test** (guards P0-2 correctness):
- Setup: process one ledger event for visit A; call `rpc_close_gaming_day(casino_id, gaming_day)` to close the window; insert a second unprocessed ledger event for same visit + gaming_day (simulating drain lag)
- Action: call `getVisitClassACompleteness` for visit A
- Assert: returns `'partial'` (not `'complete'`) — closed window + non-empty backlog must not emit `'complete'`
- Action: process the second event; call `getVisitClassACompleteness` again
- Assert: returns `'complete'` — closed window + empty backlog is the only path to `'complete'`

#### Updated Tests

**`outbox-consumer.test.ts`**: Update mocks to reflect new `rpc_process_class_a_projection` call for ledger events; add `'skipped'` result assertion for operational events.

**`outbox-producers.test.ts`** and **`outbox-adjustment-producer.test.ts`**: Update to pass `gaming_day` argument to `fn_finance_outbox_emit` mock; assert non-null `gaming_day` in captured emit calls.

#### WS4 Acceptance Criteria

- [ ] I3 (duplicate delivery) test passes
- [ ] I4 (replay) test passes
- [ ] Non-ledger row preservation test passes (operational rows remain with `processed_at IS NULL`)
- [ ] Amount unit test passes (no 100× corruption)
- [ ] Backlog-empty completeness test passes (closed window + pending events = `'partial'`; drain + closed = `'complete'`)
- [ ] Producer regression tests pass (all producers emit non-null gaming_day)
- [ ] All existing `outbox-consumer.test.ts` and `outbox-producers.test.ts` tests pass

---

### WS5_TRACKER — Wave 2 Tracker & Rollout Map Update

**Executor**: `lead-architect`
**Depends on**: WS4_TESTS

#### Files to Update

**`docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json`**:
- Phase 2.3 status: `"complete"`
- DEC-1 resolution: `"resolved"` with date

**`docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md`**:
- Phase 2.3 entry: mark complete
- Phase 2.4 cursor: advance to next

---

## Consumer Constraints (Non-Negotiable, from PRD Appendix C)

These constraints bind this EXEC-SPEC and cannot be overridden by any workstream:

1. `processed_messages` idempotency check must occur before any projection side effect (enforced in `rpc_process_class_a_projection` body)
2. `origin_label` travels unchanged; no upgrade from `'estimated'` to `'actual'` at any layer
3. Consumer must not write to `player_financial_transaction` or any authoring store
4. Consumer must not perform reconciliation
5. Consumer reads `fact_class` and `origin_label` directly from the outbox row — never infers from payload
6. Consumer claims only `fact_class = 'ledger'`; non-ledger rows remain with `processed_at IS NULL`

---

## DoD Checklist

**Gate A — Envelope Compatibility**
- [ ] `finance_outbox.gaming_day` NOT NULL (migration applied, all rows backfilled, constraint hardened)
- [ ] All 5 existing producers emit non-null `gaming_day` (producer unit tests passing after amendment)
- [ ] Producer SECURITY posture verified and helper privileges aligned (8-param gone, 9-param service_role only)
- [ ] No old `fn_finance_outbox_emit` 8-param call site remains
- [ ] `gaming_day` protected by immutability trigger
- [ ] No authenticated write path broken (all affected producer test suites pass)

**Gate B — Class A Projection**
- [ ] `processed_messages` physical idempotency key shape verified (UUID PK = `finance_outbox.event_id`; citation: `supabase/migrations/20260511134418_wave2_processed_messages.sql` — `message_id UUID NOT NULL PRIMARY KEY` with comment "Matches finance_outbox.event_id")
- [ ] DEC-1 resolved: `VisitFinancialSummaryDTO` and `FinancialSectionDTO` emit `'complete'` or `'partial'` for visits with Class A projection data
- [ ] Duplicate delivery does not double-project (I3 re-verification test passes)
- [ ] Replay from `finance_outbox` produces identical completeness state (I4 re-verification test passes)
- [ ] Non-ledger rows remain with `processed_at IS NULL` after consumer runs
- [ ] No amount unit corruption (projection amounts match PFT source in integer cents)
- [ ] `origin_label` travels unchanged through projection path and rendered surface
- [ ] `rpc_process_class_a_projection` sets `finance_outbox.processed_at` for successfully processed ledger rows and leaves it NULL on failure or skipped operational rows
- [ ] Closed gaming day with pending Class A backlog returns `partial`; closed gaming day with backlog count zero returns `complete`

**Scope Containment**
- [ ] No consumer reads `grind.observed`, `fill.recorded`, or `credit.recorded`
- [ ] No operator-facing gaming-day close UI introduced

**Quality Gates**
- [ ] `npm run db:types-local` exits 0 after all migrations
- [ ] `type-check`, `lint`, `build` exit 0

---

## Scope Containment Boundary (from Cadence Directive)

EXEC-087 **may not** introduce:
- Consumer for `grind.observed`, `fill.recorded`, or `credit.recorded`
- Operational telemetry projections
- Mixed-source financial surface completion
- Replay UI
- Operator-facing gaming-day close UI
- Phase 2.4 completeness semantics

If newly surfaced coupling appears during implementation, do not widen the slice. Treat it as a Phase 2.4 input.

---

## References

- PRD-087: `docs/10-prd/PRD-087-wave2-phase-2.3-class-a-lifecycle-completeness-proof-v1.md`
- Cadence directive: `docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2.3/EXEC-087-CADENCE-DIRECTIVE.md`
- Containment: `docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2.3/PRD-CONTAINMENT.md`
- Outbox knowledge base: `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-knowledge-base.md`
- ADR-052–055: `docs/80-adrs/ADR-052-*` through `ADR-055-*`
- Transport proof: `docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/WAVE-2-INTEGRATION-PROOF-SIGNOFF.md`
- Phase 2.0 transport substrate: PRD-081 (commit 8a1b8741)
- Phase 2.1 adjustment producer: PRD-083 (certified 2026-05-18)
- Phase 2.2 fill/credit producers: PRD-085 (complete 2026-05-19)

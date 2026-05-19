---
id: PRD-085
title: Wave 2 Phase 2.2 — Dependency Event Producer Expansion (Fills + Credits)
owner: Lead Architect
status: Draft
affects: [PRD-081, PRD-083, ADR-052, ADR-054, ADR-055, FIB-H-W2-OUTBOX-001]
created: 2026-05-18
last_review: 2026-05-18
phase: Phase 2.2 (Wave 2 Financial Data Distribution)
http_boundary: false
---

# PRD-085 — Wave 2 Phase 2.2 — Dependency Event Producer Expansion (Fills + Credits)

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Parent FIB:** FIB-H-W2-OUTBOX-001 (containment loop STEP-3, CAP-2)
- **Wave 2 authorization:** Phase 2.1 exit (PRD-083 / PRD-084 certified 2026-05-18, 20/20 PASS)
- **Summary:** This PRD wires `rpc_request_table_fill` and `rpc_request_table_credit` to emit `finance_outbox` rows atomically within their existing transaction boundaries. Both producers must ship in the same PR and database deployment — they form a **symmetric Dependency Event rollout pair** and asymmetric landing is not permitted under ADR-055 intra-category parity. Fills and credits carry `fact_class = 'operational'` and `origin_label = 'estimated'` — provenance labels reflecting their non-ledger operational status, not accuracy claims; both are operationally auditable to the cent. `player_id` is `NULL` unconditionally — Dependency Events have no player attribution. The event catalog entries for `fill.recorded` and `credit.recorded` are already registered in INT-002. The transport infrastructure (DDL, relay, idempotent consumer, `fn_finance_outbox_emit` helper, uniqueness constraint, I2–I4 baseline) is fully in place from Phases 2.0–2.1. No relay, consumer, DTO, or DDL schema changes are in scope.

---

## 2. Problem & Goals

### Problem Statement

`rpc_request_table_fill` and `rpc_request_table_credit` are the two remaining Dependency Event authoring paths not yet wired to `finance_outbox`. Fills and credits affect shift-level financial telemetry projections — the operational view of chips-in and chips-out at a table for a session. Without their outbox emission, Phase 2.4 (Operational Telemetry Projection) cannot consume these Dependency Events from the relay; it would be forced to poll authoring stores directly, violating the Wave 2 principle of transport-before-consumers. Filling this gap completes the currently scoped Wave 2 producer rollout defined by the rollout map and opens Phase 2.3 (First Consumer Slice) and Phase 2.4 (Operational Telemetry Projection) for PRD authoring.

Both producers must ship together. ADR-055 prohibits asymmetric rollout of fills without credits or credits without fills — they are a single semantic category (Dependency Events) and intra-category parity requires simultaneous landing.

### Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: `rpc_request_table_fill` emits one `finance_outbox` row atomically for each fill request within the same transaction boundary as the `table_fill` insert and session-total update | I1 atomicity proof passes for fill path: success case confirms 1 fill row + 1 outbox row + exactly 1 session-total delta; rollback injection confirms 0 rows and 0 session-total delta |
| **G2**: `rpc_request_table_credit` emits one `finance_outbox` row atomically for each credit request within the same transaction boundary as the `table_credit` insert and session-total update | I1 atomicity proof passes for credit path: same structure as G1 |
| **G3**: Both producers ship simultaneously; neither is merged without the other | Both migrations are applied in the same deployment; no state exists where one is wired and the other is not |
| **G4**: Dependency Event semantic contract is enforced at the database boundary | Migration text for both RPCs hardcodes `fact_class = 'operational'`, `origin_label = 'estimated'`, `player_id = NULL` — verified in post-state assertion |
| **G5**: Phase 2.3 and Phase 2.4 entry gates are unblocked | Phase 2.2 exit passes; fill and credit events appear in `finance_outbox` during normal authoring |

### Non-Goals

- Any projection consumer, projection store, or completeness projection — **Phase 2.3 / 2.4**.
- DEC-1 resolution (`completeness.status: 'unknown'` on visit-level aggregates) — **Phase 2.3**.
- Relay worker changes — transport substrate inherited from Phase 2.0; no modifications needed.
- `FinancialOutboxEventDTO` shape changes — DTO is unchanged.
- `origin_label` upgrade to `'actual'` — Dependency Events permanently carry `'estimated'`; this is a provenance label, not an accuracy qualifier; upgrading it is a protocol violation.
- Player attribution on fill/credit events — `player_id = NULL` is unconditional for Dependency Events; this constraint is non-negotiable.
- Any operator-visible UI or API surface changes.
- `rpc_commit_consumer_receipt` changes — inherited from Phase 2.0; no modifications.
- CDC / WAL relay, external consumer contracts, event sourcing, authoritative totals — explicit non-goals per WAVE-2-ROLLOUT-MAP.md §6.
- Synthetic reconstruction of `fill.recorded` or `credit.recorded` events from projections, telemetry deltas, inferred cash movement, or replay-derived state — prohibited; events must be authored exclusively through the RPC write boundary.

---

## 3. Users & Use Cases

### Primary User: System — Fill and Credit Authoring Paths

Fills and credits are authored by pit floor staff through the existing table management UI. The authoring RPCs are the triggers; no direct operator interaction at the outbox layer.

**Jobs:**
1. Pit boss or cashier requests a table fill through the existing UI → system calls `rpc_request_table_fill` → `table_fill` row and `finance_outbox` row with `event_type = 'fill.recorded'` commit atomically; relay picks up the event on its next cycle.
2. Pit boss or cashier requests a table credit → system calls `rpc_request_table_credit` → `table_credit` row and `finance_outbox` row with `event_type = 'credit.recorded'` commit atomically; relay picks up the event on its next cycle.
3. If a fill or credit RPC fails or rolls back after the table row insert but before the outbox insert → neither the table row nor the `finance_outbox` row exists; no partial state.
4. Idempotent replay with the same `request_id` → replay is an exact-payload no-op. The durable table row, session rollup totals, and existing `finance_outbox` row remain unchanged. A replay with different semantic inputs (`amount_cents`, `chipset`, staff ids, or `slip_no`) is rejected as an idempotency conflict before any table, rollup, audit, or outbox mutation occurs.

### Secondary User: Phase 2.4 Implementer

The operational telemetry projection (Phase 2.4) consumes `fill.recorded`, `credit.recorded`, and `grind.observed` events from `finance_outbox`. Phase 2.4 cannot process fills and credits unless this producer is wired.

**Jobs:**
1. Confirm `fill.recorded` and `credit.recorded` appear in `finance_outbox` with correct discriminator fields before beginning Phase 2.4 consumer implementation.
2. Verify `fact_class = 'operational'` and `origin_label = 'estimated'` on both event types — required for the Dependency Event consumer branch.
3. Verify `player_id = NULL` unconditionally — required invariant for Dependency Event consumers.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Fill Producer Wiring:**
- [ ] A SQL migration extends `rpc_request_table_fill` to call `fn_finance_outbox_emit()` after the `table_fill` INSERT/UPSERT, inside the same plpgsql function body (same transaction boundary). `event_type = 'fill.recorded'`, `fact_class = 'operational'`, `origin_label = 'estimated'`, `player_id = NULL`, `table_id = p_table_id`, `aggregate_id = v_result.id`.
- [ ] `fn_finance_outbox_emit` derives `casino_id` from the `app.casino_id` session GUC (set by `set_rls_context_from_staff()` already called in the same RPC body) — no caller-supplied casino id is passed to the helper.
- [ ] All discriminator fields hardcoded in the migration — not derived from caller input, not configurable at runtime.
- [ ] Idempotent replay is safe at the whole-RPC effect level, not only the outbox level: same `request_id` + same semantic payload is a no-op after returning the existing row; same `request_id` + different semantic payload is rejected before mutating the source row, `table_session` totals, late-event audit state, or `finance_outbox`.
- [ ] Idempotent replay is concurrency-safe: under simultaneous same-key calls, exactly one transaction creates the source row, applies the session-total delta, handles late-event audit if applicable, and emits outbox; all conflict-path transactions lock/read the existing source row, verify semantic equality, return it, and perform no writes.

**Credit Producer Wiring:**
- [ ] A SQL migration (same deployment as fill) extends `rpc_request_table_credit` with identical outbox emission pattern: `event_type = 'credit.recorded'`, same discriminator fields, `aggregate_id = v_result.id` (the `table_credit` row id).

**Simultaneous Landing (ADR-055):**
- [ ] Both producer migrations are in the same deployment unit (single migration file or two files applied in the same `supabase db push` invocation). No state may exist where fill is wired and credit is not, or vice versa.

**Payload:**
- [ ] `fill.recorded` payload includes `amount_cents` (from `p_amount_cents`) and `session_id` (from `v_session_id`).
- [ ] `credit.recorded` payload includes `amount_cents` (from `p_amount_cents`) and `session_id` (from `v_session_id`).
- [ ] Payload must not include player-identifying fields — `player_id` is unconditionally absent from Dependency Event payloads.

**Testing:**
- [ ] I1 atomicity proof test for fill path (unit + failure injection).
- [ ] I1 atomicity proof test for credit path (unit + failure injection).
- [ ] Semantic contract tests: outbox rows for both producers carry `origin_label = 'estimated'`, `fact_class = 'operational'`, `player_id = NULL`.
- [ ] Authority immutability test: producer/envelope assertion that `origin_label` stays `'estimated'` and cannot be updated to `'actual'`.
- [ ] Idempotency test: same `request_id` + same payload produces one source row, one session-total effect, and one outbox row per aggregate, not two.
- [ ] Concurrent idempotency test: two simultaneous same-key fill calls and two simultaneous same-key credit calls produce one source row, one session-total effect, and one outbox row; both callers receive the same aggregate id.
- [ ] Idempotency conflict test: same `request_id` + different amount/chipset/staff/slip fields is rejected with zero additional source-row, session-total, audit, or outbox mutation.
- [ ] Delayed replay test: a same-key exact replay after the original table session is no longer in `OPEN`, `ACTIVE`, or `RUNDOWN` returns the existing source row and performs no mutation; divergent delayed replay is rejected.
- [ ] Cross-casino test: authenticated staff from casino A requesting a table or staff participant from casino B is rejected with zero table rows, zero session-total mutation, zero audit mutation, and zero outbox rows.
- [ ] Direct RPC validation test: authenticated direct RPC calls with `p_amount_cents <= 0` are rejected before any source-row, session-total, audit, or outbox mutation.

**Build gates:**
- [ ] `npm run db:types-local` exits 0 after migrations.
- [ ] `npm run type-check` exits 0.
- [ ] `npm run lint` exits 0.
- [ ] `npm run build` exits 0.

### 4.2 Out of Scope

- Relay, consumer, or DDL changes to `finance_outbox` / `processed_messages`
- Any new migration to `fn_finance_outbox_emit` — already updated in `20260518105926`
- `FinancialOutboxEventDTO` shape changes
- Any TypeScript service layer changes beyond updating tests
- Event catalog updates — `fill.recorded` and `credit.recorded` are already registered in INT-002
- `player_id` population on fill/credit outbox rows — unconditionally NULL; no exception
- `origin_label = 'actual'` on fill/credit rows — prohibited

---

## 5. Requirements

### Functional Requirements

**FR-1 — Atomic outbox emission for fill.** `rpc_request_table_fill` must call `fn_finance_outbox_emit()` inside the same plpgsql function body after the `table_fill` INSERT/UPSERT `RETURNING` clause and after all existing write effects that define the fill request outcome (`table_session.fills_total_cents` update and late-event audit handling), before the `RETURN v_result` statement. The source-row write, session rollup write, late-event audit write if applicable, and outbox write share the RPC's single PostgreSQL transaction boundary. If any write fails, the entire transaction rolls back with no partial state.

**FR-2 — Atomic outbox emission for credit.** Same requirement as FR-1 applied to `rpc_request_table_credit` and the `table_credit` INSERT/UPSERT.

**FR-3 — Discriminator fields hardcoded unconditionally.** Every `finance_outbox` row emitted by either producer must set the following values unconditionally, not derived from caller input:
- `event_type`: `'fill.recorded'` (fill) / `'credit.recorded'` (credit)
- `fact_class`: `'operational'`
- `origin_label`: `'estimated'`
- `player_id`: `NULL` — no player attribution for Dependency Events; a non-NULL `player_id` on a fill or credit outbox row is a protocol violation

**FR-4 — Table-first anchoring.** `table_id` must be set to `p_table_id` (already in scope in both RPCs after session resolution). It must never be NULL. The existing cross-casino table membership validation in each RPC (which raises on cross-casino access) provides the anchor security boundary.

**FR-5 — `aggregate_id` is the authoring row id.** `aggregate_id` must be `v_result.id` — the `table_fill.id` or `table_credit.id` returned from the INSERT/UPSERT `RETURNING` clause. It must not be `request_id`, `slip_no`, or any caller-supplied identifier.

**FR-6 — `casino_id` from session GUC.** `fn_finance_outbox_emit` derives `casino_id` from the `app.casino_id` session GUC, set by `set_rls_context_from_staff()` already called earlier in the same RPC body. No caller-supplied casino id may be passed to `fn_finance_outbox_emit`.

**FR-7 — Direct RPC input validation.** Both RPCs must reject `p_amount_cents <= 0` inside the SQL function body before any source-row, session-total, late-event audit, or outbox mutation. API-layer Zod validation is defense-in-depth only; the database boundary must enforce this for authenticated direct RPC callers.

**FR-8 — Idempotent replay safety.** The existing `ON CONFLICT (casino_id, request_id)` behavior in both RPCs must be hardened so replay safety applies to the whole authoring effect, not only the outbox helper. A replay with the same `request_id` and identical semantic payload (`amount_cents`, `chipset`, participant staff ids, `slip_no`, table/session context) returns the existing row without changing the source row, session totals, late-event audit state, or outbox row. A replay with the same `request_id` and different semantic payload must fail with an idempotency-conflict error before any mutation. `fn_finance_outbox_emit`'s `ON CONFLICT (aggregate_id, event_type) DO NOTHING` (migration `20260518105926`) remains a defense-in-depth guard, but it is not sufficient by itself because `finance_outbox.payload` is immutable and session rollups can otherwise diverge.

**FR-9 — Exact replay uses stored source-row truth.** After an existing `(casino_id, request_id)` row is found, exact replay comparison is performed against the stored source row, not against mutable external state. Staff rows may have changed role/status/casino membership after the original request; exact replay still returns the existing source row if the incoming semantic payload matches the stored row. Divergent replay remains rejected. New requests still validate current staff same-casino membership before insert.

**FR-10 — Concurrency-safe replay primitive.** Only the transaction that creates a new `table_fill` / `table_credit` source row may apply the `table_session` total delta, update late-event audit state, and call `fn_finance_outbox_emit`. The implementation must use `INSERT ... ON CONFLICT DO NOTHING RETURNING *` followed by `SELECT ... FOR UPDATE` on the existing `(casino_id, request_id)` row for conflict-path verification, or a documented equivalent with row-level locking proof. It must not use a non-atomic precheck or `ON CONFLICT DO UPDATE` that mutates semantic fields on replay.

**FR-11 — Delayed exact replay after session lifecycle change.** Exact replay lookup for an existing `(casino_id, request_id)` row must happen before active-session resolution for new requests. If the row already exists and the semantic payload matches, the RPC returns the existing row even when the original session is no longer in `OPEN`, `ACTIVE`, or `RUNDOWN`. New requests still require active-session resolution; divergent replay still fails before mutation.

**FR-12 — Stable idempotency-conflict error.** Divergent replay must raise SQLSTATE `P0001` with message prefix `IDEMPOTENCY_CONFLICT:` and no source-row, session-total, late-event audit, or outbox mutation. Route/service tests must assert this prefix so divergent replay is distinguishable from generic validation failures.

**FR-13 — Simultaneous deployment.** Both RPC extensions must land in the same database deployment. Both migrations must be applied together or as a single combined migration. No partial-wiring state is permitted. This is an ADR-055 intra-category parity requirement — not a suggestion.

**FR-14 — No TypeScript producer fallback path.** No application code, service layer, or route handler may insert into `finance_outbox` on behalf of fill or credit producers. The only write path for fill/credit outbox rows is the governed SQL producer boundary via `fn_finance_outbox_emit`. The existing Option A security posture (no direct authenticated INSERT) from Phase 2.1 already enforces this at the database level.

**FR-15 — Payload contract.** Fill payload must include `amount_cents` (the fill amount in cents as ingested) and `session_id` (the resolved active session). Credit payload must include the same fields. Neither payload may include player-identifying information.

**FR-16 — Projection-consumer guard.** Consumers and projections must consume authored `fill.recorded` and `credit.recorded` events only. Projection-side reconstruction or inferred Dependency Event synthesis is prohibited. A projection that derives a fill or credit amount from telemetry deltas, inventory snapshots, or replay-derived state and writes it as a `fill.recorded` / `credit.recorded` fact violates the authoring boundary established by this PRD and ADR-054 D6. This constraint applies to Phase 2.4 and any subsequent consumer phases.

**FR-17 — Pre-state assertion.** The producer extension migration(s) must include a pre-state assertion confirming:
1. The `uq_finance_outbox_aggregate_event` unique constraint exists on `finance_outbox` (added in Phase 2.1 migration `20260517234015`).
2. `fn_finance_outbox_emit` exists in `public` schema.
3. The live `rpc_request_table_fill` and `rpc_request_table_credit` signatures match the ADR-040/ADR-024 current signatures: `(uuid, jsonb, integer, uuid, uuid, text, text)` with no caller-supplied `p_casino_id`.

If any assertion fails, the migration must abort with a clear error message before any producer code is modified.

### Non-Functional Requirements

**NFR-1 — I1 atomicity re-proven per producer.** I2–I4 are inherited transport-substrate invariants from Phase 2.0. I1 is producer-scoped and must be re-proven for both the fill path and the credit path independently. The Phase 2.0 exemplar proof and the Phase 2.1 adjustment proof do not certify fill or credit. Minimum for each path: controlled failure injection confirms zero rows in the table and `finance_outbox` and zero session-total delta post-rollback; success path confirms one row in each plus exactly one session-total delta; sequential and concurrent idempotent replay confirm one row in each and exactly one session-total effect (not two).

Phase 2.2 inherits the Phase 2.0 replay substrate and does not re-prove relay-level replayability mechanics (I4 baseline). However, `fill.recorded` and `credit.recorded` must still participate correctly in deterministic replay ordering under the existing `(table_id, event_id)` replay contract.

**NFR-2 — No performance regression.** The outbox INSERT adds one additional row write per fill or credit request through the existing `fn_finance_outbox_emit` SECURITY DEFINER boundary. No batching, background job, or asynchronous path is introduced.

**NFR-3 — Type-check and lint clean.** `npm run type-check` and `npm run lint` must exit 0. No `as any`, no `console.*` in production code paths. No new TypeScript service-layer changes beyond test updates.

---

## 6. UX / Flow Overview

This PRD introduces no operator-visible surface changes. The internal flow post-Phase 2.2:

**Fill path:**
1. Pit boss requests a fill through existing UI → route handler calls `rpc_request_table_fill`.
2. `rpc_request_table_fill` executes within one PostgreSQL RPC transaction: sets RLS context → validates casino/role → rejects non-positive amounts → checks for an existing `(casino_id, request_id)` row before active-session resolution → compares incoming semantic payload to the stored source row → returns that row on exact replay without writes, even after session/staff lifecycle changes → rejects divergent replay with `IDEMPOTENCY_CONFLICT:` before mutation → resolves active session for new requests → inserts `table_fill` row → applies exactly one session-total delta for the new request → handles late-event audit if applicable → calls `fn_finance_outbox_emit('fill.recorded', 'operational', 'estimated', p_table_id, NULL, v_result.id, payload)` → commits atomically.
3. Relay worker polls `finance_outbox WHERE processed_at IS NULL` → claims the `fill.recorded` row → delivers to `runConsumer` → marks processed.
4. (Phase 2.4 will wire an operational telemetry projection consumer here; for now, `runConsumer` executes the Wave 2 placeholder.)

**Credit path:** identical structure with `rpc_request_table_credit`, `table_credit`, and `credit.recorded`.

**Operator-observable effect:** none at Phase 2.2. Operational telemetry surfaces remain as-is until Phase 2.4 builds the operational projection consumer.

---

## 7. Dependencies & Risks

### Prerequisites

| Prerequisite | Status | Notes |
|---|---|---|
| Phase 2.0 complete (PRD-081) | ✅ DONE | `finance_outbox` DDL, relay, consumer, I1–I4 harness — all live. Commit `8a1b8741`. |
| Phase 2.1 complete (PRD-083 / PRD-084 certified) | ✅ DONE | `fn_finance_outbox_emit` Option A SD helper, `uq_finance_outbox_aggregate_event`, `ON CONFLICT DO NOTHING` idempotency fix. 20/20 certified 2026-05-18. |
| `fn_finance_outbox_emit` ON CONFLICT DO NOTHING fix | ✅ DONE | Migration `20260518105926`. Safe for SECURITY DEFINER callers that cannot SELECT from `finance_outbox`. Inherited. |
| `uq_finance_outbox_aggregate_event` constraint | ✅ DONE | Added in Phase 2.1 migration `20260517234015`. No fill/credit rows exist yet to conflict. |
| Event catalog entries | ✅ DONE | `fill.recorded` and `credit.recorded` registered in `docs/35-integration/INT-002-event-catalog.md` Wave 2 Finance Outbox registry. No catalog update needed. |
| Existing fill/credit RPC bodies | ✅ PRESENT | Latest live definitions for `rpc_request_table_fill` and `rpc_request_table_credit` are in `20260307114448_adr040_category_b_staff_validation.sql`, superseding the older PRD-038 body. Both are SECURITY DEFINER, call `set_rls_context_from_staff()`, validate same-casino staff participants, resolve `v_session_id`, update `table_session` rollups, and handle late-event audit state. The Phase 2.2 migration must preserve those behaviors while adding whole-effect idempotency hardening and outbox emission. |

### Risks

**R-1 — Asymmetric rollout.** If fill and credit are merged separately (even minutes apart), the system is in a non-conformant partial state for the duration. ADR-055 prohibits this. Mitigation: both producer migrations in the same deployment; CI gate must verify both are present.

**R-2 — I1 proof scope confusion.** Phase 2.0 and Phase 2.1 I1 proofs do not certify fill or credit. Each new producer must ship with its own I1 atomicity proof test. Mitigation: I1 proof tests for both fill and credit paths are required exit gate items.

**R-3 — `origin_label` upgrade.** A consumer or projection in a later phase could misinterpret `'estimated'` as an epistemic claim and attempt to upgrade fills/credits to `'actual'` once their amounts are confirmed operationally. This is a protocol violation. Mitigation: authority immutability test verifies `origin_label` stays `'estimated'`; Wave 2 UL clarification is cross-referenced in migration comments.

**R-4 — `player_id` inadvertent population.** The RPC body already has `v_context_actor_id` in scope; a developer could mistakenly pass it as `player_id` to `fn_finance_outbox_emit`. Fills and credits have no player attribution. Mitigation: migration explicitly passes `NULL` for `player_id`; semantic contract test asserts `player_id IS NULL` on all fill/credit outbox rows.

**R-5 — `aggregate_id` mismatch.** If `aggregate_id` is set to `request_id` (text/uuid mismatch) or `v_session_id` instead of `v_result.id`, the uniqueness constraint and downstream projection joins will break silently. Mitigation: I1 proof test checks `aggregate_id` against the returned `table_fill.id` / `table_credit.id`.

**R-6 — Outbox-level idempotency is not enough.** `fn_finance_outbox_emit`'s `ON CONFLICT DO NOTHING` silences duplicate outbox attempts, but it cannot protect source rows or `table_session` rollups from replay-side mutations. Mitigation: exact replay must return the existing row without additional side effects; divergent replay must fail before mutation; tests assert one source row, one session-total effect, and one outbox row.

**R-7 — Whole-effect idempotency drift.** The current fill/credit RPC bodies perform `ON CONFLICT DO UPDATE` and then update `table_session` totals after the upsert. If replay is not hardened, a repeated `request_id` can mutate the source row and increment session totals while `fn_finance_outbox_emit` suppresses the duplicate immutable outbox row. Mitigation: exact replay returns without additional side effects; divergent replay raises an idempotency conflict before mutation; tests assert source row, session rollup, and outbox payload remain consistent.

**R-8 — Concurrent duplicate request race.** A non-atomic precheck or semantic-field `ON CONFLICT DO UPDATE` can still double-apply session totals under simultaneous same-key calls. Mitigation: use an insert-wins pattern with conflict-path row locking and add concurrent replay tests for both producers.

**R-9 — Delayed replay after session close.** If replay lookup happens after active-session resolution, a safe retry of an already-committed request can fail once the original session has closed. Mitigation: exact replay lookup and semantic comparison happen before active-session resolution; only new requests require an active session.

**R-10 — Mutable staff-state replay drift.** If exact replay re-validates current staff rows instead of comparing against the stored source row, a valid retry can fail after a staff transfer/deactivation even though the original request committed correctly. Mitigation: existing-row replay uses stored source-row truth; only new requests validate current staff membership.

**R-11 — Direct RPC amount bypass.** API schemas reject non-positive amounts, but authenticated direct RPC callers can bypass TypeScript validation unless the SQL function enforces `p_amount_cents > 0`. Mitigation: add RPC-level validation and tests.

**R-12 — GUC visibility across SECURITY DEFINER boundary.** `fn_finance_outbox_emit` reads `app.casino_id` set by `set_rls_context_from_staff()`. Since both functions run within the same transaction, `SET LOCAL` propagates correctly. However, if a future PostgreSQL upgrade changes `SET LOCAL` scoping within nested SECURITY DEFINER calls, this assumption breaks. Mitigation: existing Phase 2.0/2.1 tests already validate this pattern; no new risk surface in Phase 2.2.

### Open Questions

None. All design decisions relevant to this phase are locked:
- Q1–Q4 resolved 2026-05-06 (ROLLOUT-TRACKER.json)
- `origin_label = 'estimated'` for Dependency Events locked in Wave 2 UL (DEC-UL-2)
- `player_id = NULL` unconditional for Dependency Events locked in ADR-052 and UL classification
- Option A security posture (SECURITY DEFINER outbox boundary) locked in Phase 2.1 (no re-decision needed)
- Fills and credits as a symmetric pair locked in FIB-H §G (RULE-6)

---

## 8. Definition of Done

The release is considered **Done** when:

**Functionality**
- [ ] `rpc_request_table_fill` emits one `finance_outbox` row per fill request, atomically with the `table_fill` INSERT/UPSERT, carrying `event_type = 'fill.recorded'`, `fact_class = 'operational'`, `origin_label = 'estimated'`, `player_id = NULL`, `table_id = p_table_id`, `aggregate_id = table_fill.id`
- [ ] `rpc_request_table_credit` emits one `finance_outbox` row per credit request, atomically with the `table_credit` INSERT/UPSERT, carrying `event_type = 'credit.recorded'`, same discriminator fields
- [ ] A failed or rolled-back fill/credit produces zero rows in both the table and `finance_outbox`, zero session-total delta, and zero late-event audit mutation
- [ ] Both producers ship in the same deployment; no state exists where one is wired and the other is not

**Data & Integrity**
- [ ] `fill.recorded` and `credit.recorded` are verified in `docs/35-integration/INT-002-event-catalog.md` (already registered; confirm before merge)
- [ ] `event_id` on fill/credit outbox rows is a UUIDv7 value generated at insert time
- [ ] `player_id` is `NULL` on all fill and credit outbox rows
- [ ] `table_id` is non-NULL on all fill and credit outbox rows
- [ ] `aggregate_id` equals `table_fill.id` / `table_credit.id` — confirmed by I1 proof test
- [ ] Idempotent replay with same `request_id` and identical payload produces one source row, one session-total effect, and one outbox row, not two
- [ ] Concurrent idempotent replay with same `request_id` and identical payload produces one source row, one session-total effect, and one outbox row; both callers receive the same aggregate id
- [ ] Delayed idempotent replay after session lifecycle change returns the existing row and performs no mutation
- [ ] Exact replay after staff lifecycle change returns the existing row when incoming semantic payload matches the stored row; new requests still validate current same-casino staff membership
- [ ] Divergent replay with same `request_id` and different semantic payload is rejected before mutating the source row, session totals, late-event audit state, or outbox
- [ ] Divergent replay raises SQLSTATE `P0001` with message prefix `IDEMPOTENCY_CONFLICT:`
- [ ] `finance_outbox.payload.amount_cents` and `payload.session_id` match the durable authoring row and the resolved active session

**Security & Access**
- [ ] No TypeScript-layer fill or credit producer insert path exists for `finance_outbox` — confirmed by unit test; existing Option A denial remains in effect
- [ ] `player_id = NULL` enforced by migration text, not caller trust — no caller parameter is consulted for player attribution
- [ ] `origin_label = 'estimated'` is hardcoded in migration text — not caller-derived; no upgrade path exists

**Testing**
- [ ] I1 atomicity proof test for `rpc_request_table_fill`: rollback injection (zero rows both tables, zero session-total delta) + success path (1 `table_fill` row + 1 `fill.recorded` outbox row + exactly 1 session-total delta)
- [ ] I1 atomicity proof test for `rpc_request_table_credit`: same structure
- [ ] Semantic contract test: fill and credit outbox rows carry `origin_label = 'estimated'`, `fact_class = 'operational'`, `player_id = NULL`
- [ ] Authority immutability test: producer/envelope assertion confirms `origin_label = 'estimated'` on fill/credit rows and the immutable-envelope trigger rejects attempts to update it to `'actual'`
- [ ] Idempotency test: same `request_id` + same semantic payload → 1 source row, 1 session-total effect, 1 outbox row per producer path
- [ ] Concurrent idempotency test: simultaneous same-key calls → 1 source row, 1 session-total effect, 1 outbox row, same aggregate id returned to both callers
- [ ] Delayed replay test: exact replay after the original session leaves `OPEN`/`ACTIVE`/`RUNDOWN` → existing row returned, no mutation
- [ ] Staff lifecycle replay test: exact replay after participant staff record changes → existing row returned when incoming payload matches stored source row
- [ ] Idempotency conflict test: same `request_id` + different amount/chipset/staff/slip fields → exception raised, 0 additional table rows, 0 additional session-total delta, 0 additional audit mutation, 0 additional outbox rows
- [ ] Idempotency conflict error test: divergent replay error uses SQLSTATE `P0001` and message prefix `IDEMPOTENCY_CONFLICT:`
- [ ] Cross-casino test: authenticated staff from casino A uses wrong-casino table or staff participant from casino B → exception raised, 0 table rows, 0 session-total delta, 0 audit mutation, 0 outbox rows
- [ ] Direct RPC amount validation test: `p_amount_cents <= 0` → exception raised, 0 table rows, 0 session-total delta, 0 audit mutation, 0 outbox rows
- [ ] Migration source inspection: function body does not contain `ON CONFLICT ... DO UPDATE` mutating `amount_cents`, `chipset`, `delivered_by`, `sent_by`, `received_by`, `slip_no`, `status`, or `session_id` on replay
- [ ] Replay-order participation verified for `fill.recorded` and `credit.recorded` under existing `(table_id, event_id)` deterministic replay contract — confirmed by asserting `event_id` is a UUIDv7 and `table_id` is non-NULL on all emitted rows
- [ ] Existing I1–I4 harness (`tests/failure/`) remains green — no regression
- [ ] Existing `services/player-financial/__tests__/` suite remains green

**Operational Readiness**
- [ ] `npm run db:types-local` exits 0
- [ ] `npm run type-check` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0

**Governance**
- [ ] I1 validation matrix entries for `rpc_request_table_fill` and `rpc_request_table_credit` updated in `WAVE-2-TRACKER.json` with `harness_result` and `phase: "2.2"`
- [ ] `WAVE-2-TRACKER.json` Phase 2.2 status → `complete`; `WAVE-2-PROGRESS-TRACKER.md` updated equivalently
- [ ] `ROLLOUT-TRACKER.json` cursor updated: `active_phase → "2.3"`, `last_closed_phase → "2.2"`
- [ ] WS_PRODUCER_FILL and WS_PRODUCER_CREDIT in `deferred_register` updated to `status: "complete"`
- [ ] Phase 2.2 introduces no projection store, consumer branch, generic event bus, envelope change, or producer business-semantics rewrite beyond outbox emission

---

## 9. Related Documents

| Document | Role |
|---|---|
| `docs/35-integration/INT-002-event-catalog.md` | Canonical Wave 2 event catalog — `fill.recorded` and `credit.recorded` already registered |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md §4` | Phase 2.2 scope, deliverables, exit gate |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json` | Machine-readable phase state and validation matrix |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md` | Human-readable companion — update at phase close |
| `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json` | Parent tracker — update cursor on phase transition |
| `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/wave-2/FIB-H-TRANSACTIONAL-OUTBOX.md` | Parent FIB — scope authority |
| `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/wave-2/FIB-S-TRANSACTIONAL-OUTBOX.json` | Structured FIB companion |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-knowledge-base.md` | Outbox implementation contract — DDL, relay, consumer, D2 vs D6 trigger classification |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/PRE-WAVE-2-UBIQUITOUS-LANGUAGE-PROPOSITION.md` | Wave 2 UL — Dependency Event category definition, DEC-UL-2 |
| `supabase/migrations/20260307114448_adr040_category_b_staff_validation.sql` | Current fill/credit RPC bodies — the target for outbox extension; supersedes the older PRD-038 body |
| `supabase/migrations/20260517234015_wave2_adj_producer_ext.sql` | Phase 2.1 exemplar — `fn_finance_outbox_emit` call pattern and pre-state assertions |
| `supabase/migrations/20260518105926_fix_fn_finance_outbox_emit_idempotency.sql` | `ON CONFLICT (aggregate_id, event_type) DO NOTHING` — inherited idempotency guard |
| `tests/failure/i1-atomicity.test.ts` | I1 harness pattern — follow for fill and credit proof tests |
| `tests/failure/i1-atomicity-adjustment.test.ts` | Phase 2.1 I1 proof — directly analogous structure for fill/credit |
| `docs/80-adrs/ADR-052` through `ADR-055` | Frozen ADR set — governs all Wave 2 transport decisions |

---

## Appendix A: Migration Authoring Notes

### Combined or paired migration strategy

ADR-055 intra-category parity requires both producers to ship simultaneously. The implementation may use either:
- **Single migration file** containing both `CREATE OR REPLACE FUNCTION rpc_request_table_fill` and `CREATE OR REPLACE FUNCTION rpc_request_table_credit` — preferred for atomic guarantees.
- **Two migration files** applied in the same `supabase db push` invocation in the same PR, never separated across different deployments.

Single file is preferred: it makes ADR-055 compliance self-evident and eliminates merge-ordering risk.

### Extension pattern — both producers

The pattern follows Phase 2.1 (`20260517234015_wave2_adj_producer_ext.sql`) but without eligibility gating. Emission is unconditional:

```sql
-- Pre-state assertions (before any CREATE OR REPLACE)
DO $$
BEGIN
  -- 1. fn_finance_outbox_emit exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_finance_outbox_emit'
  ) THEN
    RAISE EXCEPTION 'PRE-STATE FAIL: fn_finance_outbox_emit not found. '
      'Apply Phase 2.1 migrations (20260517234015) first.';
  END IF;

  -- 2. uq_finance_outbox_aggregate_event constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'uq_finance_outbox_aggregate_event'
  ) THEN
    RAISE EXCEPTION 'PRE-STATE FAIL: uq_finance_outbox_aggregate_event missing. '
      'Apply Phase 2.1 migrations (20260517234015) first.';
  END IF;

  -- 3. Current fill/credit RPC signatures exist (ADR-040 / ADR-024 posture)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_request_table_fill'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid)
        = 'p_table_id uuid, p_chipset jsonb, p_amount_cents integer, p_delivered_by uuid, p_received_by uuid, p_slip_no text, p_request_id text'
  ) THEN
    RAISE EXCEPTION 'PRE-STATE FAIL: current rpc_request_table_fill signature not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_request_table_credit'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid)
        = 'p_table_id uuid, p_chipset jsonb, p_amount_cents integer, p_sent_by uuid, p_received_by uuid, p_slip_no text, p_request_id text'
  ) THEN
    RAISE EXCEPTION 'PRE-STATE FAIL: current rpc_request_table_credit signature not found.';
  END IF;
END;
$$;
```

Inside each RPC body, after the new-row path has inserted the source row and after the session-total update / late-event audit handling, before `RETURN v_result`:

```sql
-- Wave 2 Phase 2.2: Dependency Event outbox emission (ADR-054 D2)
-- fact_class = 'operational', origin_label = 'estimated' — provenance labels,
-- not accuracy qualifiers. Fills/credits are operationally auditable to the cent.
-- player_id = NULL unconditional — Dependency Events have no player attribution (ADR-052 R5).
-- casino_id derived from app.casino_id session GUC — no caller-supplied casino id.
PERFORM public.fn_finance_outbox_emit(
  public.generate_uuid_v7(),      -- event_id: UUIDv7 monotonic
  'fill.recorded',                -- event_type: hardcoded (INT-002 registry)
  'operational',                  -- fact_class: hardcoded (ADR-052 Class B / Dep Event)
  'estimated',                    -- origin_label: hardcoded (ADR-054 D5 provenance)
  p_table_id,                     -- table_id: table-first anchoring (ADR-052 R1)
  NULL,                           -- player_id: unconditionally NULL (Dependency Event)
  v_result.id,                    -- aggregate_id: table_fill.id
  jsonb_build_object(
    'amount_cents', p_amount_cents,
    'session_id',   v_session_id
  )
);
```

Credit follows the same pattern with `'credit.recorded'` and `v_result.id` as `table_credit.id`.

### What does NOT need to change

- No legacy `p_casino_id` signature remediation — fill/credit RPCs have their canonical ADR-024 / ADR-040 signatures already: `(uuid, jsonb, integer, uuid, uuid, text, text)`.
- No Option A re-hardening — direct authenticated INSERT is already denied from Phase 2.1.
- No uniqueness constraint addition — `uq_finance_outbox_aggregate_event` already in place.
- No event catalog update — both events already registered in INT-002.
- No `fn_finance_outbox_emit` modification — already has `ON CONFLICT DO NOTHING`.
- No DTO changes — `FinancialOutboxEventDTO` covers both producers.

### Required idempotency implementation shape

The migration must avoid semantic-field mutation on replay. The implementation should follow this shape:

1. Validate context, role, staff same-casino membership, and `p_amount_cents > 0`.
2. Attempt to lock/read an existing source row by `(casino_id, request_id)` before active-session resolution. If found, compare semantic payload fields against the stored source row. Exact match returns existing row even if related staff/session lifecycle state has changed; mismatch raises SQLSTATE `P0001` with message prefix `IDEMPOTENCY_CONFLICT:`; no writes occur.
3. For new requests only, resolve active session, insert the source row, update session totals, handle late-event audit if applicable, emit outbox, and return the new row.
4. If insert loses a concurrent race on `(casino_id, request_id)`, lock/read the winning row, compare semantic payload fields against the stored row, return on exact match, or raise `IDEMPOTENCY_CONFLICT:` on mismatch. Do not update session totals, audit state, source semantic fields, or outbox on the conflict path.

---

## Appendix B: I1 Proof Test Sketch

Follow `tests/failure/i1-atomicity-adjustment.test.ts` (Phase 2.1) as the direct template. For each producer (fill and credit):

1. **Success path** — call RPC with valid inputs → assert 1 `table_fill`/`table_credit` row + 1 `fill.recorded`/`credit.recorded` outbox row + exactly 1 `table_session` total delta. Assert envelope fields: `event_type`, `fact_class = 'operational'`, `origin_label = 'estimated'`, `player_id IS NULL`, `table_id = p_table_id`, `aggregate_id = table_row.id`.

2. **Rollback path** — inject a controlled failure after the source-row mutation and session-total mutation, before the outbox emit, via a test-only service-role helper or migration-local test hook that is not executable by `authenticated` or `anon`. Assert: 0 rows in `table_fill`/`table_credit`; 0 rows in `finance_outbox`; 0 session-total delta; 0 late-event audit mutation. Include a companion production-safety assertion proving authenticated callers cannot activate the hook.

3. **Idempotent replay** — call same RPC with same `request_id` and identical semantic payload twice. Assert: 1 table row, 1 outbox row, and exactly 1 session-total delta. The second call returns the existing row and performs no additional mutation.

4. **Concurrent idempotent replay** — issue two simultaneous same-key calls with identical semantic payload. Assert: 1 table row, 1 outbox row, exactly 1 session-total delta, and both callers receive the same aggregate id.

5. **Delayed idempotent replay** — create a fill/credit, move the original session out of `OPEN`/`ACTIVE`/`RUNDOWN`, then replay the same request. Assert: existing row returned; no source-row, session-total, audit, or outbox mutation.

6. **Staff lifecycle replay** — create a fill/credit, change one participant staff row's lifecycle state after commit, then replay the same request. Assert: existing row returned because semantic payload matches the stored source row; no source-row, session-total, audit, or outbox mutation.

7. **Idempotency conflict** — call same RPC with same `request_id` but different `amount_cents`, `chipset`, staff participant, or `slip_no`. Assert: SQLSTATE `P0001` with message prefix `IDEMPOTENCY_CONFLICT:` before mutation; durable source row, session totals, late-event audit state, and `finance_outbox` remain unchanged.

8. **Cross-casino rejection** — authenticate as casino A staff and call the RPC with a casino B table or casino B staff participant. Assert: exception raised; 0 table rows; 0 session-total delta; 0 late-event audit mutation; 0 outbox rows.

9. **Direct RPC validation** — authenticated direct RPC call with `p_amount_cents <= 0`. Assert: exception raised before mutation; 0 table rows; 0 session-total delta; 0 late-event audit mutation; 0 outbox rows.

10. **Semantic contract** — after success path, read the outbox row and assert: `origin_label = 'estimated'` (not 'actual'), `fact_class = 'operational'` (not 'ledger'), `player_id IS NULL`, and payload contains exactly the approved producer fields (`amount_cents`, `session_id`) with values matching the durable authoring row.

11. **Authority immutability** — producer/envelope test verifies a fill/credit outbox row cannot be updated from `origin_label = 'estimated'` to `'actual'` because the immutable-envelope trigger rejects envelope mutation.

The proof does not re-certify I2–I4 (transport-substrate invariants, inherited from Phase 2.0/2.1) unless relay worker or consumer architecture has materially changed — which it has not.

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| v0 | 2026-05-18 | Lead Architect | Initial draft |

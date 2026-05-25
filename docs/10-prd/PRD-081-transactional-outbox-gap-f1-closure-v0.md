---
id: PRD-081
title: "Transactional Outbox — GAP-F1 Closure (Wave 2 Transport)"
owner: Engineering
status: Amended — Exemplar Slice (2026-05-11)
affects:
  - ADR-052
  - ADR-053
  - ADR-054
  - ADR-055
  - ADR-056
  - FIB-H-W2-OUTBOX-001
  - SEC-NOTE-TRANSACTIONAL-OUTBOX
  - ARCH-SRM
created: 2026-05-10
last_review: 2026-05-11
phase: Wave 2 — Transport Slice (GAP-F1)
http_boundary: true
---

# PRD-081 — Transactional Outbox (GAP-F1 Closure)

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Phase:** Wave 2 — Transport Slice (first infrastructure slice)
- **Priority:** P0 — structural prerequisite for all Wave 2 projection consumer work

This PRD covers the minimal infrastructure slice that closes GAP-F1: every table-scoped
financial fact authored by PT-2 RPCs — Wave-2-eligible Class A ledger transactions (where
`rating_slip_id` resolves to same-casino `rating_slip.table_id`), Class B operational
telemetry, and fill/credit Dependency Events — must durably emit a `finance_outbox` row in the
same database transaction as the authoring write. Non-table-scoped or ineligible Class A writes
(cage cashouts, cage markers, unlinked adjustments, unrated pit buy-ins) are authored as valid
PFT rows but excluded from Wave 2 outbox emission. *(Per ADR-057.)* A polling relay worker delivers events to an internal
idempotent receipt consumer with at-least-once semantics. Consumers deduplicate via `processed_messages`.

The implementation is **not greenfield DDL**. `finance_outbox` and `table_buyin_telemetry`
already exist in the repository with legacy shapes. This PRD requires explicit migration from
the existing objects to the Wave 2 contract; `CREATE TABLE IF NOT EXISTS` alone is not an
acceptable implementation because it would silently preserve incompatible columns and indexes.

No operator-facing surface is introduced. The observable outcome for operators — completeness
labels changing from `'unknown'` to `'complete'`/`'partial'` — is a consequence of downstream
projection consumer slices, which depend on this transport layer as a prerequisite. This PRD
delivers the transport layer only.

---

## 1a. Vertical Collapse — Exemplar-First Transport Proof

PRD-081 will be implemented as an exemplar-first transport proof slice before full producer expansion.

The initial implementation scope is intentionally limited to a symmetric producer pair:

- Class A exemplar: `rpc_create_financial_txn`
- Class B exemplar: `rpc_record_grind_observation`

The purpose of this slice is to establish a functional transactional outbox in the system and prove I1–I4 under real execution conditions:

- I1 atomicity
- I2 durability
- I3 idempotency
- I4 replayability

This containment does not relax ADR-055 parity. The exemplar slice must still demonstrate one shared envelope shape, identical transaction discipline, identical relay semantics, identical idempotent-consumer semantics, and replayability across both fact classes.

The following producer expansions are deferred until the exemplar slice passes I1–I4:

- `rpc_create_financial_adjustment`
- `rpc_request_table_fill`
- `rpc_request_table_credit`

Dependency Events remain in the Wave 2 taxonomy and event catalog, but their producer wiring is not part of the exemplar proof unless explicitly pulled into a successor slice.

No projection surface, operator-visible completeness change, observability dashboard, replay UI, fan-out registry, or external consumer contract may be introduced under the exemplar slice.

After the exemplar slice passes, producer expansion proceeds as a bounded follow-on rollout, not as a reopening of the transport architecture.

---

## 2. Problem & Goals

### Problem Statement

Every visit-level financial aggregate in PT-2 today returns `completeness.status: 'unknown'`.
Wave 1 established correct authority labeling and surface contracts, but the system has no
lifecycle-aware delivery mechanism: when a Class A or Class B fact is authored, no guaranteed
path exists to notify projection consumers. Consumers either poll authoring stores directly
(coupling and DB load) or return stale data indefinitely. Additionally, projection state cannot
be safely rebuilt after an error because there is no replay surface — reading authoring stores
directly is the only option, which violates bounded context boundaries.

GAP-F1 records that `finance_outbox` has zero producers. ADR-054 is decided but not enforced
in code. This PRD enforces it.

### Goals

1. **Atomicity:** Every Wave-2-eligible Class A, every Class B, and every Dependency Event
   authoring write is atomic with its `finance_outbox` emission — no window exists between
   authoring store insert and outbox insert. Non-table-scoped Class A writes (cage cashouts,
   cage markers, unlinked adjustments, unrated pit buy-ins) are authored normally with no outbox
   emission. *(ADR-057 D5.)*
2. **Durability:** Committed outbox rows survive relay worker process crashes and are re-delivered
   on the next poll cycle without manual intervention.
3. **Idempotency:** Consumers processing the same event twice apply their side effect exactly once,
   enforced by the `processed_messages` deduplication mechanism.
4. **Replayability:** Projection consumers can truncate their derived state and rebuild it
   deterministically from `finance_outbox` history in UUIDv7 event order.
5. **Transport readiness:** The relay worker is operational, authenticated, and scheduled — ready
   to deliver events the moment the first projection consumer slice is built.

### Non-Goals

All items in FIB-H-W2-OUTBOX-001 §G apply without exception:

- No external consumer contract — `finance_outbox` is internal PT-2 infrastructure
- No event sourcing — outbox is propagation, not authoritative state reconstruction
- No authoritative totals or settlement surfaces
- No CDC / WAL replication (Debezium, pg_logical, pg_notify)
- No schema changes to `player_financial_transaction`
- No UI changes — backend/infrastructure only
- No compliance domain scope — `mtl_entry` / MTLService is parallel and isolated
- No reconciliation logic on fills/credits — Dependency Events only, `origin_label = 'estimated'`
- No `player_id` on Class B or Dependency Event rows
- No non-table-scoped Class A propagation in Wave 2 — Class A events without a resolvable
  `rating_slip.table_id` are out of scope for this transport slice and must not fabricate
  `table_id`
- No projection consumer implementation — transport layer only
- No multi-consumer fan-out, subscription registry, dynamic routing, generic event bus, replay UI,
  alerting platform, or observability dashboard — the active containment artifact is
  `docs/issues/gaps/financial-data-distribution-standard/OVERENGINEERING_GUARDRAIL_OUTBOX_WAVE2.md`
- No operator-visible completeness status change in this PRD

---

## 3. Users & Use Cases

This feature has no direct operator interaction. The actors are system processes.

### Actor 1: Authoring RPCs (Class A — PlayerFinancialService)

**Jobs:**
- When `rpc_create_financial_txn` commits a Wave-2-eligible table-scoped buy-in, also commit a
  `finance_outbox` row in the same transaction with `fact_class = 'ledger'`,
  `origin_label = 'actual'`. Current cage cashout paths are non-table-scoped and emit no Wave 2
  outbox row.
- When `rpc_create_financial_adjustment` commits a linked adjustment whose original PFT recomputes
  as Wave-2-eligible under ADR-057, also commit a `finance_outbox` row in the same transaction.
  Unlinked adjustments and adjustments linked to excluded originals emit no Wave 2 outbox row.
- Class A producer wiring is limited to table-scoped transactions where `rating_slip_id` resolves
  to same-casino `rating_slip.table_id`. If `rating_slip_id` is `NULL`, the RPC must skip Wave 2
  outbox emission for that row and record no fabricated table anchor. If a supplied
  `rating_slip_id` is nonexistent, cross-casino, or otherwise invalid, the RPC must reject the
  financial write and emit no outbox row. Non-table-scoped Class A propagation requires a future
  FIB/ADR because the Wave 2 replay key is `(table_id, event_id)`.

### Actor 2: Authoring RPCs (Class B + Dependency Events — TableContextService)

**Jobs:**
- When `rpc_record_grind_observation` inserts into `table_buyin_telemetry`, also commit a
  `finance_outbox` row in the same transaction with `fact_class = 'operational'`,
  `origin_label = 'estimated'`, `player_id = NULL`.
- When `rpc_request_table_fill` or `rpc_request_table_credit` commits, also commit a
  `finance_outbox` row with `event_type = 'fill.recorded'`/`'credit.recorded'`,
  `fact_class = 'operational'`, `origin_label = 'estimated'`, `player_id = NULL`.

### Actor 3: Relay Worker (`/api/internal/outbox-relay`)

**Jobs:**
- Poll `finance_outbox WHERE processed_at IS NULL ORDER BY event_id` on a Vercel cron schedule.
- Claim rows with `FOR UPDATE SKIP LOCKED`; deliver each as `FinancialOutboxEventDTO` to the
  configured idempotent receipt consumer.
- Record `processed_at` only after durable consumer commit acknowledgment; leave rows unprocessed
  on delivery or consumer-commit failure (re-delivered on next cycle — I2 durability).

### Actor 4: Projection Consumer (idempotent consumer backbone)

**Jobs:**
- Receive `FinancialOutboxEventDTO`; check `processed_messages` for `event_id`.
- If duplicate: discard silently. If new: insert into `processed_messages` and apply projection
  side effect in one transaction — both commit or both roll back.
- Never upgrade `origin_label`; read `fact_class` and `origin_label` from envelope fields only.
- Wave 2 has exactly one internal consumer topology. `processed_messages.message_id` is global for
  this pilot by design; multi-consumer fan-out requires a future FIB/schema evolution and is not
  part of this PRD.

---

## 4. Scope & Feature List

### Database layer

- [ ] `finance_outbox` migration: transform the existing legacy table shape
  (`id`, `ledger_id`, `attempt_count`, `created_at` ordering index) into the Wave 2 contract
  (`event_id`, `fact_class`, `origin_label`, `table_id`, `player_id`, `aggregate_id`,
  `delivery_attempts`, `last_attempted_at`, `last_error`) with explicit compatibility and
  rollback notes; do not rely on `CREATE TABLE IF NOT EXISTS`; `last_error` must be bounded
  (`varchar(2000)` or equivalent check) so poison-event diagnostics cannot create unbounded row
  growth
- [ ] `finance_outbox` indexes: relay-poll partial index (`WHERE processed_at IS NULL`) ordered
  by UUIDv7 `event_id`, plus per-entity ordering index (`table_id, event_id`)
- [ ] `finance_outbox` integrity constraints: DB-enforced checks for valid class/provenance
  combinations, including Class A `fact_class = 'ledger'`, `origin_label = 'actual'`,
  `player_id IS NOT NULL`, `table_id IS NOT NULL`; Class B and Dependency Events
  `fact_class = 'operational'`, `origin_label = 'estimated'`, `player_id IS NULL`,
  `table_id IS NOT NULL`
- [ ] `finance_outbox` immutability guard: event envelope columns (`event_id`, `event_type`,
  `fact_class`, `origin_label`, `casino_id`, `table_id`, `player_id`, `aggregate_id`, `payload`,
  `created_at`) are immutable after insert; only relay lifecycle columns may be updated
- [ ] `table_buyin_telemetry` migration: reconcile the existing production schema/RPC surface
  with the Wave 2 Class B contract; no `player_id` column may be added, and no existing required
  column or caller may be dropped without an explicit call-site migration plan. The new
  `rpc_record_grind_observation` must preserve the current required-field semantics by populating
  `actor_id`, `gaming_day`, and `telemetry_kind` rather than reducing the table to the RFC sketch
- [ ] `processed_messages` DDL: consumer idempotency store; single-consumer Wave 2 assumption
  encoded explicitly by global `message_id` primary key and documented as non-fan-out pilot scope

### Producer wiring

- [ ] `rpc_create_financial_txn` extended: `finance_outbox` INSERT in same transaction boundary
  only when `rating_slip_id` resolves to same-casino `rating_slip.table_id`; no outbox row is
  emitted for non-table-scoped Class A rows in Wave 2
- [ ] Class A producer idempotency: retrying an RPC with the same `(casino_id, idempotency_key)`
  must return the existing authoring row and must not create a second `finance_outbox` row
- [ ] Class B grind authoring path resolved: either migrate the existing
  `rpc_log_table_buyin_telemetry` callers to new SECURITY DEFINER
  `rpc_record_grind_observation`, or keep a backward-compatible wrapper that delegates to the
  new atomic implementation; two independent grind-write paths are not permitted
- [ ] SECURITY DEFINER `rpc_record_grind_observation`: inserts into `table_buyin_telemetry`
  and `finance_outbox` atomically in one transaction boundary
- [ ] Class A and Class B exemplar producers land simultaneously per ADR-055 P4 — no asymmetric rollout

### Producer wiring — deferred to producer expansion slice

These items are deferred until the exemplar pair (`rpc_create_financial_txn` +
`rpc_record_grind_observation`) passes I1–I4.

- [ ] `rpc_create_financial_adjustment` extended: `finance_outbox` INSERT in same transaction
  boundary only when the original PFT recomputes as Wave-2-eligible under ADR-057 and the inherited
  `rating_slip_id` resolves to same-casino `rating_slip.table_id`
- [ ] `rpc_request_table_fill` extended: `finance_outbox` INSERT with Dependency Event
  classification frozen (`fact_class = 'operational'`, `origin_label = 'estimated'`,
  `player_id = NULL`, `event_type = 'fill.recorded'`)
- [ ] `rpc_request_table_credit` extended: same discipline as fill, `event_type = 'credit.recorded'`

### Relay worker

- [ ] `/api/internal/outbox-relay` POST route: validates
  `Authorization: Bearer ${CRON_SECRET}` before any DB access, returns HTTP 401 on mismatch
- [ ] Polling + row claiming: `SELECT … FOR UPDATE SKIP LOCKED ORDER BY event_id LIMIT {batch}`
  implemented through a SECURITY DEFINER claim RPC that owns the lock/update transaction; a plain
  Supabase JS query-builder implementation is not acceptable because row locking is required.
  Direct `pg` connection polling is explicitly deferred unless a future ADR/FIB amends ADR-056
- [ ] Delivery loop: delivers `FinancialOutboxEventDTO` to configured consumer; sets
  `processed_at` only after the consumer returns a durable success acknowledgment, defined as:
  `processed_messages` insert and consumer side effect committed in the same transaction
- [ ] Failure path: increments `delivery_attempts`, records `last_error`, leaves
  `processed_at IS NULL` — row re-delivered on next poll cycle
- [ ] Relay diagnostics remain bounded by the Wave 2 guardrail: per-batch logs, backlog count,
  per-row retry metadata, and failure-harness evidence only; no dashboard, alerting system, replay
  UI, or generic observability platform in this PRD
- [ ] Batch/time budget: EXEC-SPEC must define a fixed initial batch size and stop-before-deadline
  guard that keeps the route within the existing Vercel 30s max duration
- [ ] Missing-consumer path: if no internal receipt consumer is configured, relay fails closed
  before marking any row processed; it must leave `processed_at IS NULL` and record diagnostic
  state only
- [ ] Vercel cron entry in `vercel.json` targeting `/api/internal/outbox-relay`

### TypeScript contracts

- [ ] `FinancialOutboxEventDTO` interface defined in PlayerFinancialService; includes `event_id`,
  `event_type`, `fact_class`, `origin_label`, `casino_id`, `table_id`, `player_id`,
  `aggregate_id`, `payload`, `created_at`, `processed_at`
- [ ] Wave 2 event catalog artifact: static bounded registry of allowed `event_type` values
  at `docs/35-integration/INT-002-event-catalog.md`; exemplar event types (`buyin.recorded`,
  `buyin.observed`, `grind.observed`) must be registered before EXEC-SPEC execution; remaining
  entries (`cashout.recorded`, `adjustment.recorded`, `fill.recorded`, `credit.recorded`) are
  catalog reservations — present for taxonomy completeness, not a pre-execution gate for the
  exemplar slice
- [ ] UUIDv7 generation mechanism identified before EXEC-SPEC execution: either reuse an existing
  approved database/helper function or add a migration that creates `public.generate_uuid_v7()`;
  `gen_random_uuid()` UUIDv4 is not acceptable for `event_id` because relay/replay ordering
  depends on UUIDv7. The EXEC-SPEC must include a SQL assertion that generated `event_id` values
  match UUIDv7 version bits (`xxxxxxxx-xxxx-7xxx-[89ab]xxx-xxxxxxxxxxxx`) and sort in generation
  order for a same-session sample
- [ ] `npm run db:types` run after migrations and TypeScript DTOs updated from
  `types/remote/database.types.ts`

### Consumer backbone

- [ ] Idempotent consumer module: `ON CONFLICT DO NOTHING RETURNING message_id` deduplication
  primitive; consumer side effect and `processed_messages` insert commit atomically; the module
  must return success to the relay only after that transaction commits

---

## 5. Requirements

### Functional

| ID | Requirement |
|----|-------------|
| F1 | `finance_outbox` INSERT and authoring store INSERT are in one `pg_current_xact_id()` for every table-scoped Class A write where `rating_slip_id` resolves to same-casino `rating_slip.table_id` (I1 atomicity — Class A) |
| F2 | `finance_outbox` INSERT and `table_buyin_telemetry` INSERT are in one `pg_current_xact_id()` for every Class B write (I1 atomicity — Class B) |
| F3 | *(Deferred — producer expansion slice)* `finance_outbox` INSERT and fill/credit authoring INSERT are in one `pg_current_xact_id()` (I1 atomicity — Dependency Events) |
| F4 | Relay worker re-delivers unprocessed rows after process crash (I2 durability) |
| F5 | Consumer applying a duplicate `event_id` produces no additional side effect (I3 idempotency), and relay marks `processed_at` only after the consumer commits `processed_messages` plus consumer side effect |
| F6 | Truncating and replaying `finance_outbox` in `(table_id, event_id)` order produces identical derived state (I4 replayability); replayability is scoped to exemplar-derived state only — no generalized replay platform, event versioning, migration semantics, or snapshotting may be introduced under I4 |
| F7 | `origin_label` value at authoring boundary equals `origin_label` value received by consumer — no upgrade permitted |
| F8 | `player_id` is `NULL` on every Class B row and every Dependency Event row |
| F9 | Relay endpoint returns HTTP 401 on any request without a valid `CRON_SECRET` header |
| F10 | All `event_type` values used by producer RPCs appear in the Wave 2 event catalog before EXEC-SPEC execution |
| F11 | Legacy `finance_outbox` schema cannot remain after migration; the Wave 2 required columns and indexes are present and legacy-only relay ordering by `created_at` is removed or unused |
| F12 | Existing `rpc_log_table_buyin_telemetry` call sites are migrated or delegated through a wrapper; no second non-outbox Class B write path remains |
| F13 | Valid non-table-scoped Class A writes with `rating_slip_id IS NULL` do not emit Wave 2 outbox rows; they neither fail the authoring write nor fabricate a `table_id` |
| F14 | Supplied nonexistent, cross-casino, or otherwise invalid `rating_slip_id` rejects the financial write and emits no outbox row |
| F15 | Repeating a producer RPC with the same idempotency key does not create duplicate `finance_outbox` rows |
| F16 | Two concurrent relay invocations cannot claim the same outbox row; the implementation proves the chosen claim mechanism actually executes `FOR UPDATE SKIP LOCKED` semantics |

### Non-Functional

| ID | Requirement |
|----|-------------|
| NF1 | All new SECURITY DEFINER functions include `SET search_path = ''` (ADR-018; pre-commit hook enforced) |
| NF2 | `finance_outbox`, `table_buyin_telemetry`, `processed_messages` carry `casino_id NOT NULL`; no authenticated-role INSERT grants |
| NF3 | `FOR UPDATE SKIP LOCKED` on relay poll — concurrent cron invocations do not double-claim rows |
| NF4 | Relay lifecycle metadata (`processed_at`, `delivery_attempts`, `last_attempted_at`, `last_error`) is transport diagnostic state only — never used as financial authority or completeness signal (ADR-056 D6) |
| NF5 | Migration timestamps generated with `date +"%Y%m%d%H%M%S"` at EXEC-SPEC creation time; no backdating |
| NF6 | No `console.*` in production code; no `as any` |
| NF7 | `finance_outbox` and `table_buyin_telemetry` migrations include explicit pre-state checks against the existing repository schema and fail loudly if the expected legacy shape is absent |
| NF8 | Relay uses the service-role server client only after `CRON_SECRET` validation succeeds; no authenticated-client table access is introduced for relay polling or lifecycle updates |
| NF9 | Existing authenticated-role `finance_outbox` RLS policies are dropped/replaced so direct authenticated SELECT/INSERT/UPDATE/DELETE is denied; service-role relay access remains internal only |
| NF10 | Relay execution is bounded by Vercel's configured 30s max duration through a fixed batch size and stop-before-deadline guard |
| NF11 | Migration scripts use `lock_timeout`/`statement_timeout` safeguards and run inside rollback-safe transactions unless a step is explicitly documented as non-transactional |
| NF12 | Wave 2 containment is enforced: no multi-consumer fan-out, consumer registry, dynamic routing, generic event bus, projection surface, replay UI, alerting platform, or observability dashboard may be added under this PRD |
| NF13 | `last_error` storage is bounded to prevent unbounded retry diagnostics from bloating `finance_outbox` rows |

---

## 6. Data Flow Overview

This feature has no operator UI. The flow is entirely system-to-system:

- **Authoring write** → RPC opens `BEGIN`, inserts authoring row, inserts `finance_outbox` row,
  `COMMIT` — both durable or both rolled back
- **Class A table anchoring** → for Class A rows, producer resolves `rating_slip_id` to
  same-casino `rating_slip.table_id`; if no table anchor exists, Wave 2 emits no outbox row
- **Relay poll** → `GET finance_outbox WHERE processed_at IS NULL ORDER BY event_id FOR UPDATE
  SKIP LOCKED` — batch of undelivered events claimed without blocking concurrent relay instances
- **Relay delivery** → each row serialized as `FinancialOutboxEventDTO`, posted to internal
  consumer module; on durable consumer commit, `UPDATE finance_outbox SET processed_at = NOW()`
- **Consumer check** → `INSERT INTO processed_messages … ON CONFLICT DO NOTHING RETURNING
  message_id` — no row returned = duplicate, discard; row returned = new, apply projection side
  effect in same transaction, commit; only after this commit may the relay treat delivery as
  successful
- **Relay crash recovery** → unclaimed rows (lock released on crash) re-polled on next cycle;
  `processed_messages` prevents duplicate side effects
- **Replay** → consumer truncates derived state, reads `finance_outbox ORDER BY (table_id,
  event_id)`, replays in order — derived state converges to same result

---

## 7. Dependencies & Risks

### Prerequisites

| Item | Status |
|------|--------|
| ADR-052–055 (financial fact model, scope, propagation, parity) | Frozen 2026-04-23 |
| ADR-056 (relay worker execution environment) | Frozen 2026-05-10 |
| FIB-H-W2-OUTBOX-001 (scope authority) | Approved 2026-05-10 |
| RFC-006 (detailed design) | Approved 2026-05-10 |
| SEC-NOTE-TRANSACTIONAL-OUTBOX | Accepted 2026-05-10 |
| Failure Simulation Harness scaffolding | EXEC-READY |
| `CRON_SECRET` env var provisioned in Vercel | Required before relay activation |

### Downstream dependencies (not in scope of this PRD)

- Shift telemetry projection consumer (first downstream slice after transport is live)
- Session summary completeness signal (`completeness.status: 'complete'`/`'partial'`)
- Any projection surface that reads `finance_outbox` events

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| ADR-055 P4 parity: Class B ships without Class A or vice versa | High | Both producers must land in same deploy; EXEC-SPEC gate enforces simultaneous delivery |
| `origin_label` upgrade in consumer implementation | High | ADR-056 D6 + SEC-NOTE T3/C3; code review gate |
| Relay endpoint exposed without `CRON_SECRET` in env | High | Deploy checklist item; relay returns 401 before DB access |
| Legacy authenticated `finance_outbox` policies remain active | High | Migration must drop/replace existing authenticated policies and SQL posture tests must prove direct table access is denied |
| Class A row lacks table anchor | High | Wave 2 emits only table-scoped Class A events resolved through same-casino `rating_slip.table_id`; non-table-scoped propagation is deferred |
| Outbox table bloat (unbounded `processed_at IS NULL` rows) | Medium | Partial index keeps relay poll lean; post-pilot cleanup strategy is a named future FIB |
| Poison event retries forever | Medium | Batch budget prevents route exhaustion; DLQ/alerting remains deferred, but `delivery_attempts`/`last_error` provide diagnostics |
| Duplicate `event_type` strings introduced outside catalog | Medium | Wave 2 event catalog produced before EXEC-SPEC; enforced by review gate |
| Reserved `cashout.recorded` accidentally emitted for cage cashouts | High | Event catalog may register `cashout.recorded` as reserved, but producer tests must prove current Wave 2 code emits no cashout events unless a same-casino `rating_slip.table_id` exists |
| SRM footnote ¹ still references ADR-016 for `finance_outbox` | Low | SRM update is a DoD item in this PRD |
| Infrastructure metastasis into event platform/projection work | High | Active guardrail `OVERENGINEERING_GUARDRAIL_OUTBOX_WAVE2.md`; PRD scope limited to authoring row + outbox row + durable relay + idempotent receipt |

---

## 8. Definition of Done

The release is considered **Done** when:

**Invariants (testable acceptance criteria)**
- [ ] I1 Atomicity: rollback injection test proves PFT/grind INSERT and `finance_outbox` INSERT are in one `pg_current_xact_id()` — verified by failure harness, not row-count assertion alone
- [ ] I2 Durability: process-crash simulation confirms committed outbox row is re-delivered on next poll cycle without manual intervention
- [ ] I3 Idempotency: `runConsumer()` called twice on the same `event_id` produces no duplicate consumer side effect
- [ ] I4 Replayability: truncate + replay from `finance_outbox ORDER BY (table_id, event_id)` produces identical derived state; replay proves deterministic rebuild of exemplar-derived state only — no event versioning, snapshotting, multi-consumer orchestration, or generalized replay tooling may be introduced under this invariant

**Functionality**
- [ ] Exemplar producer pair wires `finance_outbox` INSERT in their existing transaction boundary: Class A exemplar (`rpc_create_financial_txn`) and Class B exemplar (`rpc_record_grind_observation`); remaining producers (`rpc_create_financial_adjustment`, `rpc_request_table_fill`, `rpc_request_table_credit`) are deferred to the producer expansion slice
- [ ] Class A outbox emission is limited to table-scoped rows resolved through same-casino
  `rating_slip.table_id`; no `table_id` is fabricated for cashier/cage/non-slip transactions
- [ ] Producer retry idempotency verified: repeating the same `(casino_id, idempotency_key)` does
  not create a duplicate `finance_outbox` row
- [ ] Class A and Class B producers deployed simultaneously (ADR-055 P4)
- [ ] `rpc_record_grind_observation` is a new SECURITY DEFINER RPC returning the `table_buyin_telemetry` row UUID
  and deriving/populating required current columns (`actor_id`, `gaming_day`, `telemetry_kind`)
  without adding `player_id`
- [ ] Existing `rpc_log_table_buyin_telemetry` consumers are either migrated to
  `rpc_record_grind_observation` or routed through a compatibility wrapper that emits outbox rows
- [ ] Relay row claiming uses the EXEC-SPEC-defined SECURITY DEFINER claim RPC; plain Supabase
  query-builder polling without row locks is rejected
- [ ] Relay endpoint validates `CRON_SECRET` and returns HTTP 401 on mismatch before any DB access
- [ ] Vercel cron entry present in `vercel.json` targeting `/api/internal/outbox-relay`
- [ ] `FinancialOutboxEventDTO` TypeScript interface defined and exported from PlayerFinancialService
- [ ] Wave 2 event catalog artifact at `docs/35-integration/INT-002-event-catalog.md` registers
  exemplar `event_type` entries (`buyin.recorded`, `buyin.observed`, `grind.observed`) before
  EXEC-SPEC execution; remaining entries (`cashout.recorded`, `adjustment.recorded`,
  `fill.recorded`, `credit.recorded`) appear as catalog reservations — present for taxonomy
  completeness, not a pre-execution gate; `cashout.recorded` remains reserved/non-emitted
  in Wave 2 unless a future same-casino table-anchored cashout path is introduced
- [ ] Relay missing-consumer path verified: no configured consumer means no row is marked
  `processed_at`, and diagnostic state records the failure
- [ ] No new fan-out/router/registry/replay UI/observability dashboard files are introduced by this
  PRD; any such need is split into a future FIB after I1–I4 pass

**Data & Integrity**
- [ ] `finance_outbox`, `table_buyin_telemetry`, `processed_messages` DDL migrations applied; timestamps generated at EXEC-SPEC creation time, not fabricated
- [ ] `public.generate_uuid_v7()` migration applied unless an existing approved UUIDv7 helper is
  found; SQL assertions prove UUIDv7 version bits and same-session generation-order sorting
- [ ] `finance_outbox` migration verified against the existing legacy table: Wave 2 columns,
  constraints, and UUIDv7 relay/replay indexes are present; legacy `attempt_count`/`created_at`
  poll semantics no longer drive delivery
- [ ] Migration pre-state assertions verify the legacy `finance_outbox_select`,
  `finance_outbox_insert`, update, and delete policies exist or fail loudly with an explicit
  compatibility message before replacement
- [ ] `finance_outbox` class/provenance constraints enforce Class A vs Class B/Dependency
  invariants at the database layer
- [ ] `finance_outbox` envelope immutability enforced; attempts to update event envelope columns
  fail, while relay lifecycle metadata updates remain allowed
- [ ] `finance_outbox.last_error` rejects or truncates values above the chosen bounded length
- [ ] `table_buyin_telemetry` has no `player_id` column — absent by DDL construction
- [ ] `processed_messages` deduplication works atomically: insert + consumer side effect commit or both roll back
- [ ] Relay success acknowledgment is coupled to durable consumer commit; if consumer fails before
  commit, `finance_outbox.processed_at` remains `NULL`
- [ ] `origin_label` travels from authoring boundary to consumer unchanged; no consumer upgrade path exists
- [ ] `npm run db:types` completed after migrations and DTOs compile against
  `types/remote/database.types.ts`

**Security & Access**
- [ ] All new SECURITY DEFINER functions include `SET search_path = ''`; pre-commit hook passes
- [ ] No INSERT grants on the three new tables to `authenticated` role
- [ ] Existing `finance_outbox_select`, `finance_outbox_insert`, update, and delete policies are
  dropped or replaced; authenticated direct table access is denied by SQL posture test
- [ ] `casino_id NOT NULL` on all three tables
- [ ] SEC-NOTE-TRANSACTIONAL-OUTBOX validation gate checklist passes

**Testing**
- [ ] I1–I4 failure harness test files present and passing (`npm run test:failure` CI step)
- [ ] `package.json` defines `test:failure` and CI invokes it for the I1–I4 harness
- [ ] Integration tests for each extended/new producer RPC verify outbox row is committed in same transaction
- [ ] Class A no-table-anchor test covers a financial transaction with no resolvable
  `rating_slip.table_id`; authoring write succeeds or follows the explicit scoped behavior, and
  no fabricated outbox row is created
- [ ] Producer retry test verifies same idempotency key does not duplicate outbox emission
- [ ] Relay endpoint unit test covers: valid `Authorization: Bearer ${CRON_SECRET}` (200),
  missing/malformed header (401 before DB access), missing consumer path, delivery failure path
  (row remains unprocessed)
- [ ] Relay commit-boundary test covers consumer failure after delivery attempt but before
  `processed_messages` + projection commit; `processed_at` remains `NULL`
- [ ] Concurrent relay test starts two invocations against the same rows and proves no duplicate
  claim under the selected `FOR UPDATE SKIP LOCKED` implementation
- [ ] Relay budget test proves the configured batch size and stop-before-deadline guard stay within
  Vercel's 30s function duration
- [ ] SQL security tests in `supabase/tests/security/outbox_transport_access.test.sql` prove
  authenticated users cannot directly SELECT/INSERT/UPDATE/DELETE `finance_outbox`,
  `table_buyin_telemetry`, or `processed_messages`
- [ ] Migration regression assertions in
  `supabase/tests/migrations/outbox_legacy_shape.test.sql` prove the implementation handles the
  existing repository schema for `finance_outbox`, its current RLS policies, and
  `table_buyin_telemetry`

**Operational Readiness**
- [ ] Relay logs: per-batch success/failure line; `outbox_backlog_size` (count of `processed_at IS NULL`) per invocation
- [ ] `CRON_SECRET` env var documented in `.env.example` and Vercel env var checklist; route
  constructs the service-role client only after header validation passes
- [ ] Rollback path documented: disable cron entry in `vercel.json` or revoke `CRON_SECRET`

**Documentation**
- [ ] SRM footnote ¹ on `finance_outbox` updated: replace ADR-016 reference with ADR-054 + ADR-056
- [ ] Wave 2 event catalog artifact committed to repo at documented path
- [ ] ADR-056 status updated from Draft to Accepted (already Accepted as of 2026-05-10)
- [ ] PRD and EXEC-SPEC cite
  `docs/issues/gaps/financial-data-distribution-standard/OVERENGINEERING_GUARDRAIL_OUTBOX_WAVE2.md`
  as the active scope containment artifact

---

## 9. Related Documents

| Document | Category | Notes |
|----------|----------|-------|
| `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/wave-2/FIB-H-TRANSACTIONAL-OUTBOX.md` | Scope authority | FIB containment loop, exclusions, frozen decisions |
| `docs/02-design/RFC-006-transactional-outbox.md` | Design | Detailed DDL, RPC design, relay worker, alternatives |
| `docs/80-adrs/ADR-052-financial-fact-model-dual-layer.md` | ADR | Class A/B dual-layer fact model |
| `docs/80-adrs/ADR-053-financial-system-scope-boundary.md` | ADR | Scope boundary, non-financial exclusions |
| `docs/80-adrs/ADR-054-financial-event-propagation-surface-contract.md` | ADR | D2 atomicity, D5 immutability, transport contract |
| `docs/80-adrs/ADR-055-cross-class-authoring-parity.md` | ADR | P4 simultaneous rollout, parity invariants |
| `docs/80-adrs/ADR-056-relay-worker-execution-environment.md` | ADR | Option A decision, D1–D7 frozen decisions, I1–I4 |
| `docs/30-security/SEC-NOTE-TRANSACTIONAL-OUTBOX.md` | Security | Threat model, T1–T7, controls, deferred risks |
| `docs/issues/gaps/financial-data-distribution-standard/actions/FAILURE-SIMULATION-HARNESS.md` | QA | I1–I4 harness scaffolding (EXEC-READY) |
| `docs/issues/gaps/financial-data-distribution-standard/OVERENGINEERING_GUARDRAIL_OUTBOX_WAVE2.md` | Governance | Active Wave 2 guardrail — transport before projection |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-UBIQUITOUS-LANGUAGE-CLARIFICATION.md` | Governance | Dependency Event definition; `'estimated'` as provenance |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Architecture | SRM footnote ¹ update required (DoD item) |

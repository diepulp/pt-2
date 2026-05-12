---
id: RFC-006
title: "Design Brief: Transactional Outbox (GAP-F1 Closure)"
owner: Vladimir Ivanov
status: Draft
date: 2026-05-10
affects:
  - PlayerFinancialService
  - TableContextService
  - finance_outbox
  - table_buyin_telemetry
  - processed_messages
  - rpc_create_financial_txn
  - rpc_create_financial_adjustment
  - rpc_record_grind_observation
  - rpc_request_table_fill
  - rpc_request_table_credit
intake_ref: FIB-H-W2-OUTBOX-001
structured_ref: FIB-S-W2-OUTBOX-001
scaffold_ref: SCAFFOLD-TRANSACTIONAL-OUTBOX
frozen_adrs:
  - ADR-052
  - ADR-053
  - ADR-054
  - ADR-055
---

# Design Brief / RFC-006: Transactional Outbox (GAP-F1 Closure)

> **Scope authority:** FIB-H-W2-OUTBOX-001 (APPROVED 2026-05-10). All scope questions defer
> to that document. This RFC resolves the one open transport decision (relay worker execution
> environment) and provides the detailed design that makes Phase 3 (SEC Note) and Phase 4
> (ADR-056) actionable.

---

## 1) Context

### 1.1 The Dual-Write Problem (GAP-F1)

PT-2 records two kinds of financial facts:

- **Class A — Ledger** (`player_financial_transaction`): player-attributed buy-ins, cashouts, and
  adjustments. `fact_class = 'ledger'`, `origin_label = 'actual'`.
- **Class B — Operational** (`table_buyin_telemetry`): table-level grind observations. `fact_class
  = 'operational'`, `origin_label = 'estimated'`, `player_id = NULL` by construction (ADR-052 R5).

Additionally, table fills and credits are **Dependency Events** — domain events consumed as
Projection Inputs that carry no ledger authority: `fact_class = 'operational'`,
`origin_label = 'estimated'` (provenance, not accuracy qualifier), `player_id = NULL`.

Currently, when any of these facts is authored, there is no guaranteed delivery path to downstream
projection consumers. The gap (GAP-F1) is that `finance_outbox` has zero producers. ADR-054 is
decided but not yet enforced in code.

The consequence is visible on every visit-level financial surface today: `completeness.status:
'unknown'`. Wave 1 labeled the values correctly; it cannot signal completeness because no lifecycle
event reaches projection consumers. This is the DEC-1 state recorded in EXEC-080.

### 1.2 What the Outbox Resolves

Closing GAP-F1 makes event delivery a **durable, transactional property of the authoring write
itself**. Once producers are wired:

- Every Wave-2-eligible Class A authoring write (where `rating_slip_id` resolves to a same-casino
  `rating_slip.table_id`) and every Class B authoring write atomically produce a `finance_outbox`
  row in the same `pg_current_xact_id()` as the authoring store insert (ADR-054 D2, as amended by
  ADR-057 D5). Non-table-scoped or ineligible Class A writes are authored as valid PFT rows but
  emit no Wave 2 outbox row.
- A relay worker delivers events with at-least-once semantics to the configured internal
  projection consumer.
- Consumers deduplicate using `processed_messages`; projection updates are idempotent.
- Projection consumers can rebuild their state by replaying `finance_outbox` history in
  deterministic UUIDv7 event order.

### 1.3 Prior Art and Constraints

All architecture decisions governing this feature are frozen in ADR-052–055 (2026-04-23). The
one remaining open decision is the relay worker execution environment; everything else — schema,
insertion strategy, delivery semantics, consumer discipline — is locked. The ubiquitous language
(Authority Fact / Telemetry Fact / Dependency Event / Projection Input) is canonical per
WAVE-2-UBIQUITOUS-LANGUAGE-CLARIFICATION.md (2026-05-07).

---

## 2) Scope & Goals

### In scope

- `finance_outbox` DDL: table, constraints, relay-poll and per-entity-ordering indices.
- `table_buyin_telemetry` DDL: Class B authoring store (schema frozen in FIB §I).
- `processed_messages` DDL: consumer idempotency table (schema frozen in FIB §I).
- Class A producer wiring: `rpc_create_financial_txn` and `rpc_create_financial_adjustment`
  extended with `finance_outbox` INSERT in the same transaction boundary.
- Class B producer wiring: new `rpc_record_grind_observation` that inserts into
  `table_buyin_telemetry` and `finance_outbox` atomically.
- Dependency Event producer wiring: `rpc_request_table_fill` and `rpc_request_table_credit`
  extended with `finance_outbox` INSERT (`event_type = 'fill.recorded'`/`'credit.recorded'`,
  `fact_class = 'operational'`, `origin_label = 'estimated'`, `player_id = NULL`).
- `FinancialOutboxEventDTO` TypeScript definition.
- Internal relay worker: polling model, concurrency-safe row claiming, at-least-once delivery,
  records `processed_at` on successful relay dispatch acknowledgment.
- Idempotent consumer backbone: `processed_messages` deduplication atomic with projection side
  effect.
- Wave 2 event catalog artifact: static bounded registry of allowed `event_type` values.
- Relay worker execution environment decision (the one open transport question — §7).
- I1–I4 invariant definitions (Phase 4 ADR consequence; harness execution is EXEC-SPEC scope).

### Out of scope

All items in FIB §G (non-goals) apply without exception. Key boundaries:

- **No projection surfaces** — shift telemetry, session summary, and pit dashboard consumers are
  downstream slices. This RFC wires the transport layer only.
- **No lifecycle-aware completeness** — `completeness.status: 'complete'`/`'partial'` emission is
  a consequence of the first downstream consumer slice, not this RFC.
- **No external consumer contract** — `finance_outbox` is internal PT-2 infrastructure.
- **No event sourcing** — replay rebuilds derived projections; it does not reconstruct
  authoritative state or replace authoring stores.
- **No authoritative totals or settlement** — consumers MUST NOT derive settlement authority,
  perform reconciliation, or synthesize authoritative financial totals.
- **No CDC/WAL replication** — polling relay is the Wave 2 mechanism.
- **No schema changes to `player_financial_transaction`** — Class A write paths are extended, not
  schema-altered.
- **No UI changes**.
- **No compliance domain scope** — `mtl_entry`/MTLService is parallel and isolated.
- **No `player_id` on Class B rows** — `player_id = NULL` unconditionally on
  `table_buyin_telemetry` and corresponding outbox rows.
- **No trigger-based outbox insertion** — Q4 locked; RPC-coupled insertion is the pilot mechanism.

### Success criteria (I1–I4 invariants)

| Invariant | Statement |
|---|---|
| **I1 Atomicity** | PFT/grind INSERT and `finance_outbox` INSERT are in one `pg_current_xact_id()`; neither persists without the other. Proven by rollback injection, not row-count assertion alone. |
| **I2 Durability** | Committed outbox row survives relay worker process crash; delivered on next poll cycle. |
| **I3 Idempotency** | Consumer deduplicates via `processed_messages`; `runConsumer()` twice produces no duplicate side effects. |
| **I4 Replayability** | Projections rebuild deterministically from `finance_outbox` history; truncate + replay produces the same state. |

---

## 3) Proposed Direction

The outbox infrastructure is built in three coupled layers:

1. **Atomic producers** — each authoring RPC performs both the authoring store INSERT and the
   `finance_outbox` INSERT inside one `BEGIN…COMMIT` boundary. `event_id` is generated as UUID v7
   at the authoring boundary; `fact_class`, `origin_label`, and `player_id` are hardcoded per
   class, never inferred from payload content. Both Class A and Class B producers land
   simultaneously (ADR-055 P4 — no asymmetric rollout).

2. **Polling relay worker** — an authenticated internal endpoint polls
   `finance_outbox WHERE processed_at IS NULL ORDER BY event_id` using
   `SELECT ... FOR UPDATE SKIP LOCKED` for concurrency safety. It delivers each event as a
   `FinancialOutboxEventDTO` to the configured internal projection consumer and records
   `processed_at` only on successful relay dispatch acknowledgment. Consumer-side projection
   durability and side-effect completion are governed independently via `processed_messages`.
   Relay dispatch success is not projection durability; at-least-once semantics still permit
   duplicate delivery. The relay's delivery lifecycle state (`processed_at`, `delivery_attempts`,
   `last_attempted_at`, `last_error`) and the consumer's idempotency receipt
   (`processed_messages`) are distinct mechanisms serving distinct invariants and must not be
   collapsed.

3. **Idempotent consumer** — on receipt, the consumer atomically inserts into `processed_messages`
   and applies its projection side effect in the same transaction. `ON CONFLICT DO NOTHING
   RETURNING message_id` is the deduplication primitive: no row returned = duplicate, discard; row
   returned = new, proceed. `origin_label` travels unchanged from authoring boundary to consumer;
   no consumer may upgrade `'estimated'` to `'actual'`.

The relay worker execution environment (Next.js API route + Vercel cron vs Supabase Edge
Function) is the one open decision; §6 and §7 cover the tradeoffs and recommend Option A.

---

## 4) Detailed Design

### 4.1 Data model

#### `finance_outbox`

Owned by **PlayerFinancialService**. Written by both PlayerFinancialService and
TableContextService within their own SECURITY DEFINER RPC transaction boundaries.

```sql
CREATE TABLE finance_outbox (
  event_id          UUID        NOT NULL PRIMARY KEY,
  event_type        TEXT        NOT NULL,
  fact_class        TEXT        NOT NULL
                    CHECK (fact_class IN ('ledger', 'operational')),
  origin_label      TEXT        NOT NULL
                    CHECK (origin_label IN ('actual', 'estimated', 'observed', 'compliance')),
  casino_id         UUID        NOT NULL,
  table_id          UUID        NOT NULL,
  player_id         UUID        NULL,
  aggregate_id      UUID        NOT NULL,
  payload           JSONB       NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ NULL,
  delivery_attempts INTEGER     NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ NULL,
  last_error        TEXT        NULL
);

-- Relay worker poll: unprocessed rows in insertion order
CREATE INDEX idx_finance_outbox_relay
  ON finance_outbox (event_id)
  WHERE processed_at IS NULL;

-- Per-entity ordered replay: projection consumers use this for ordered event history
CREATE INDEX idx_finance_outbox_entity_order
  ON finance_outbox (table_id, event_id);
```

**Column invariants (ADR-054 + ADR-055):**
- `event_id`: UUID v7 generated at authoring boundary — never via `DEFAULT`, never at consumer.
- Relay ordering authority = `event_id` UUID v7 monotonic ordering. `created_at` is observational
  metadata only and MUST NOT be treated as replay ordering authority. Per-entity ordering derives
  from `(table_id, event_id)`; `created_at` remains useful for diagnostics and audit visibility
  only.
- `fact_class` and `origin_label`: hardcoded per class, set at insert, never updated (ADR-052 R4).
- `table_id NOT NULL`: table-first anchoring enforced at DB level (ADR-052 D2).
- `player_id NULL`: unconditionally `NULL` on every Class B and Dependency Event row. Class A is
  mandatory (NOT NULL constraint enforced at the RPC level, not the table DDL, since the shared
  table serves both classes).
- `delivery_attempts`, `last_attempted_at`, `last_error`: relay lifecycle diagnostics only — not
  a DLQ, observability platform, or alerting framework (consistent with Wave 2 guardrail §5.5).
- Append-only: the event envelope is immutable after insert (`event_id`, `event_type`,
  `fact_class`, `origin_label`, `casino_id`, `table_id`, `player_id`, `aggregate_id`, `payload`,
  `created_at`). Relay lifecycle metadata (`processed_at`, `delivery_attempts`,
  `last_attempted_at`, `last_error`) is mutable operational state and is excluded from append-only
  semantics.

#### `table_buyin_telemetry`

Owned by **TableContextService**. Schema frozen in FIB §I. Phase 2 RFC may not shrink or drop
any column without a FIB amendment.

```sql
CREATE TABLE table_buyin_telemetry (
  id           UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id    UUID        NOT NULL,
  table_id     UUID        NOT NULL,
  event_type   TEXT        NOT NULL
               CHECK (event_type IN ('buyin.observed', 'grind.observed')),
  amount_cents BIGINT      NOT NULL CHECK (amount_cents >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

No `player_id` column — absent by construction (ADR-052 R5). Partial attribution is a DDL-level
violation, not a runtime check.

#### `processed_messages`

Owned by the outbox consumer infrastructure layer. This is an infrastructure-owned
relay/consumer deduplication store, not financial-domain state and not projection-domain state.
Schema frozen in FIB §I. Single-consumer assumption is a named Wave 2 constraint; multi-consumer
fan-out requires future schema evolution.

```sql
CREATE TABLE processed_messages (
  message_id   UUID        NOT NULL PRIMARY KEY,  -- event_id from finance_outbox
  casino_id    UUID        NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Wave 2 event catalog

A new artifact (`docs/20-architecture/wave-2-event-catalog.md` or equivalent) must be produced
before EXEC-SPEC execution. The Wave 2 event catalog is a static bounded registry of allowed
`event_type` values for pilot transport discipline. It is not a dynamic event registry, runtime
discovery mechanism, orchestration framework, or governance subsystem. The catalog exists solely
to prevent ad-hoc semantic drift in producer and consumer implementations. No producer RPC and no
consumer may use an unregistered `event_type`.

Wave 2 assumes a bounded single-consumer topology: one configured internal projection consumer
module, no subscriber registry, no dynamic consumer orchestration, and no consumer plugin
framework.

Pilot-scoped event types (all must appear in catalog before EXEC-SPEC):

| `event_type` | Class | `fact_class` | `origin_label` | Producer RPC | Notes |
|---|---|---|---|---|---|
| `buyin.recorded` | A | `ledger` | `actual` | `rpc_create_financial_txn` | Emits when `rating_slip_id` resolves to same-casino `rating_slip.table_id` |
| `cashout.recorded` | A | `ledger` | `actual` | `rpc_create_financial_txn` | **Reserved — no current eligible producer.** All `direction='out'` Class A paths are cage-scoped and lack a deterministic table anchor per ADR-057 D2. Reserved for a future rated pit cashout path that carries a valid `rating_slip_id`. Must not emit for cage cashouts. |
| `adjustment.recorded` | A | `ledger` | `actual` | `rpc_create_financial_adjustment` | Emits only when inherited/current `rating_slip_id` resolves to same-casino `rating_slip.table_id` |
| `buyin.observed` | B | `operational` | `estimated` | `rpc_record_grind_observation` | |
| `grind.observed` | B | `operational` | `estimated` | `rpc_record_grind_observation` | |
| `fill.recorded` | Dep | `operational` | `estimated` | `rpc_request_table_fill` | |
| `credit.recorded` | Dep | `operational` | `estimated` | `rpc_request_table_credit` | |

All `event_type` values are to be governed centrally. Ad-hoc event strings, payload-inferred
semantics, and route-local event naming are prohibited (Wave 2 guardrail §5.8).

---

### 4.2 Service layer

#### Producer RPCs — Class A (PlayerFinancialService)

`rpc_create_financial_txn` and `rpc_create_financial_adjustment` are extended — no new RPC
interface. Within the existing `BEGIN…COMMIT` boundary:

```sql
-- Immediately after the PFT INSERT, before COMMIT,
-- only after ADR-057 Class A eligibility succeeds:
INSERT INTO finance_outbox (
  event_id, event_type, fact_class, origin_label,
  casino_id, table_id, player_id, aggregate_id, payload, created_at
) VALUES (
  /* UUID v7 generated at authoring boundary */,
  /* event_type derived from transaction type */,
  'ledger',
  'actual',
  p_casino_id,
  p_table_id,
  p_player_id,
  /* pft row id */,
  /* domain fact JSONB — NOT FinancialEnvelope */,
  NOW()
);
```

The RPC performs deterministic outbox construction only after ADR-057 eligibility succeeds — no
projection writes, no fan-out, no business logic beyond eligibility, table-anchor resolution, and
mapping to the outbox envelope. Current cage cashouts, cage markers, unrated pit buy-ins, and
unlinked adjustments emit no Wave 2 outbox row.

#### Producer RPC — Class B (TableContextService)

New SECURITY DEFINER RPC: `rpc_record_grind_observation(p_casino_id UUID, p_table_id UUID,
p_event_type TEXT, p_amount_cents BIGINT) RETURNS UUID`.

Within a single `BEGIN…COMMIT`:

```sql
INSERT INTO table_buyin_telemetry (casino_id, table_id, event_type, amount_cents)
  VALUES (p_casino_id, p_table_id, p_event_type, p_amount_cents)
  RETURNING id INTO v_grind_id;

INSERT INTO finance_outbox (
  event_id, event_type, fact_class, origin_label,
  casino_id, table_id, player_id, aggregate_id, payload, created_at
) VALUES (
  /* UUID v7 */,
  p_event_type,
  'operational',
  'estimated',
  p_casino_id,
  p_table_id,
  NULL,        -- player_id unconditionally NULL (ADR-052 R5)
  v_grind_id,
  jsonb_build_object('amount_cents', p_amount_cents),
  NOW()
);
```

ADR-055 P4 parity: this RPC is shipped simultaneously with Class A producer extensions. Neither
lands without the other.

#### Producer RPCs — Dependency Events (TableContextService)

`rpc_request_table_fill` and `rpc_request_table_credit` are extended with a `finance_outbox`
INSERT in their existing transaction boundary. Classification is frozen and must not be
re-opened:

| Field | Value |
|---|---|
| `fact_class` | `'operational'` |
| `origin_label` | `'estimated'` |
| `player_id` | `NULL` |
| `event_type` | `'fill.recorded'` / `'credit.recorded'` |

Fills and credits are Dependency Events (WAVE-2-UBIQUITOUS-LANGUAGE-CLARIFICATION.md): they
influence shift telemetry projections but carry no ledger authority. Their `'estimated'` label is
a provenance label, not an accuracy qualifier — fills may be operationally exact and still carry
`'estimated'` because they are not ledger settlement facts.

#### Relay worker

The relay worker is an authenticated internal process (execution environment decided in §7).

**Poll and claim:**
```sql
SELECT event_id, event_type, fact_class, origin_label,
       casino_id, table_id, player_id, aggregate_id, payload, created_at
FROM finance_outbox
WHERE processed_at IS NULL
ORDER BY event_id
LIMIT {batch_size}
FOR UPDATE SKIP LOCKED;
```

`FOR UPDATE SKIP LOCKED` ensures concurrent relay invocations do not claim the same row.
Relay ordering authority is `event_id` UUIDv7 monotonic ordering. `created_at` is observational
metadata only and MUST NOT be treated as replay ordering authority. Per-entity ordering for
projection consumers is maintained via the `(table_id, event_id)` index at replay time.

**Delivery loop:**
1. For each claimed row, deliver the `FinancialOutboxEventDTO` to the configured internal
   projection consumer.
2. Increment `delivery_attempts`, set `last_attempted_at = NOW()`.
3. On successful relay dispatch acknowledgment:
   `UPDATE finance_outbox SET processed_at = NOW() WHERE event_id = $1`.
4. On delivery failure: record `last_error`, do NOT set `processed_at` — row remains
   `processed_at IS NULL` and is re-delivered on next poll cycle (I2 durability).

**Claimed-but-not-acked recovery:** if the relay worker crashes after claiming rows but before
setting `processed_at`, the lock is released. On next poll, the same rows are re-claimed and
re-delivered. The consumer's `processed_messages` check prevents duplicate side effects (I3).

#### `FinancialOutboxEventDTO`

TypeScript DTO owned by PlayerFinancialService; consumed by the relay worker and all projection
consumers.

```ts
export interface FinancialOutboxEventDTO {
  event_id:     string        // UUID v7
  event_type:   string        // must be an allowed Wave 2 event catalog value
  fact_class:   'ledger' | 'operational'
  origin_label: 'actual' | 'estimated' | 'observed' | 'compliance'
  casino_id:    string
  table_id:     string
  player_id:    string | null
  aggregate_id: string
  payload:      Record<string, unknown>
  created_at:   string        // ISO 8601
  processed_at: string | null
}
```

Consumers read `fact_class` and `origin_label` directly — never infer from payload content.
`origin_label` travels unchanged; no consumer may upgrade `'estimated'` to `'actual'`.

#### Idempotent consumer module

```sql
BEGIN;
  INSERT INTO processed_messages (message_id, casino_id)
    VALUES ($event_id, $casino_id)
    ON CONFLICT DO NOTHING
    RETURNING message_id;
  -- No row returned → duplicate, rollback/skip
  -- Row returned → new event, apply projection side effect here, then COMMIT
COMMIT;
```

The idempotency insert and the projection side effect commit atomically. If the projection write
fails, both roll back; the consumer retries on next delivery. `processed_at` on the outbox row
is NOT the idempotency guard — it records successful relay dispatch acknowledgment. Consumer-side
projection durability and side-effect completion are governed independently via
`processed_messages`. Relay dispatch success is not projection durability; at-least-once
semantics still permit duplicate delivery. The two mechanisms are distinct and must not be
collapsed.

---

### 4.3 API surface

One new internal endpoint:

| Route | Method | Purpose |
|---|---|---|
| `/api/internal/outbox-relay` | `POST` | Relay trigger — polls and delivers a batch of unprocessed outbox rows |

This route is **not public**. It must validate the `CRON_SECRET` header (or equivalent internal
auth mechanism) and reject unauthenticated invocations. No new public API routes are introduced.

No consumer-facing API changes. No new OpenAPI paths.

---

### 4.4 UI/UX flow

Not applicable. This feature is entirely backend/infrastructure. No new UI components, panels,
routes, or surface labels are introduced by this RFC.

---

### 4.5 Security considerations

#### RLS impact

- `finance_outbox`, `table_buyin_telemetry`, `processed_messages` are all written by SECURITY
  DEFINER RPCs using the service role — not by row-level client operations.
- The relay worker reads `finance_outbox` using the service-role Supabase client. No new RLS
  exposure — the relay operates outside the RLS-scoped client path.
- No row-level policy changes to existing tables.

#### SECURITY DEFINER governance (ADR-018)

All new SECURITY DEFINER RPCs must:
- Include `SET search_path = ''` at the top of the function body.
- Have explicit role grants (`GRANT EXECUTE ON FUNCTION ... TO authenticated`).
- The pre-commit hook enforces this. Any RPC failing this check must be fixed before commit.

#### Casino-scoped tenancy

All three new tables carry `casino_id NOT NULL` per SRM contract policy. Every outbox INSERT sets
`casino_id` from the invoking RPC's validated context (ADR-024 `set_rls_context_from_staff()`).
No casino cross-contamination is possible at the RPC layer.

#### Actor binding

The relay endpoint validates `CRON_SECRET` before processing any batch. The consumer backbone
operates under service-role access — no JWT user context required for internal relay delivery.

#### Audit trail

`created_at` on `finance_outbox` provides an immutable authoring timestamp for diagnostics and
audit visibility only. `processed_at` records successful relay dispatch acknowledgment.
`delivery_attempts` + `last_attempted_at` + `last_error` provide relay crash introspection
without an operator-facing dashboard (Wave 2 guardrail §5.5 — minimal observability only).

---

## 5) Cross-Cutting Concerns

### Performance

- **Polling interval**: Vercel cron minimum is 1 minute on free tier (lower on Pro). This is the
  known latency bound for Wave 2 pilot. Acceptable at pilot scale; documented as a named
  constraint.
- **Batch size**: configurable via env var. Start conservatively (e.g., 50 rows/batch). Specific
  tuning belongs to EXEC-SPEC scope.
- **Row locking**: `FOR UPDATE SKIP LOCKED` prevents relay concurrency issues without table locks.
  Concurrent invocations (e.g., overlapping cron triggers) safely skip already-claimed rows.
- **Index efficiency**: the partial index `WHERE processed_at IS NULL` keeps the relay poll lean
  as the table grows. The `(table_id, event_id)` index is used for replay, not the main poll.

### Migration strategy

Three DDL migrations, applied in order:
1. `finance_outbox` — no foreign key dependencies; can land first.
2. `table_buyin_telemetry` — no foreign key dependencies; can land alongside or after (1).
3. `processed_messages` — no foreign key dependencies; can land alongside (1)/(2).

RPC extensions land after the DDL migrations are applied (code deploys atomically — no partial
state where RPCs try to insert into a non-existent table).

Migration naming follows `MIGRATION_NAMING_STANDARD.md`: `YYYYMMDDHHMMSS_description.sql`.
Timestamps generated at EXEC-SPEC creation time, never fabricated.

### Observability (minimal)

Per Wave 2 guardrail §5.5, allowed in this transport slice:
- Relay success/failure log lines per batch.
- `outbox_backlog_size` log line (count of `processed_at IS NULL` rows) on each relay invocation.
- `delivery_attempts` + `last_error` fields for poison-event diagnosis.

Not allowed in this slice: observability dashboard, alerting framework, replay visualizer, or
delivery analytics surface. If those require their own schema or UX, they are a separate FIB.

### Rollback plan

- **DDL migrations** are additive (new tables only, no schema changes to existing tables). Rolling
  back means dropping the three new tables; no existing table is altered.
- **RPC extensions** add `finance_outbox` INSERT inside existing transactions. If the extension
  causes a regression, the INSERT can be removed; the existing authoring behavior is unaffected
  because the transaction rolls back cleanly.
- **Relay worker endpoint**: disabled by removing the Vercel cron config or by revoking the
  `CRON_SECRET`. No persistent process to shut down (Option A stateless model).

---

## 6) Alternatives Considered

### Option A: Next.js API route + Vercel cron (RECOMMENDED)

The relay worker is implemented as a protected Next.js API route
(`/api/internal/outbox-relay`). Vercel's built-in cron triggers it on a schedule via
`vercel.json`. The route polls `finance_outbox WHERE processed_at IS NULL`, delivers to the
configured internal projection consumer module, and records `processed_at` on successful relay
dispatch acknowledgment.

- **Pros**: Same Node.js/TypeScript runtime as the rest of the application. Same service-layer
  patterns — `FinancialOutboxEventDTO` consumed directly without a Deno/Node.js type bridge. No
  new deployment artifact. Vercel cron is declarative (`vercel.json`). Easy to observe via
  existing Next.js route logging. Stateless — no persistent process to manage. Exit ramp is
  clear: replace route with an Edge Function or a different scheduler without changing DDL or
  producer wiring.
- **Cons**: Polling interval floor of 1 minute on Vercel free tier (lower on Pro). Stateless —
  no backpressure or in-flight tracking between invocations (tolerable at pilot scale).
- **Why recommended**: Fits the existing deployment model. Requires no new infrastructure,
  runtime, or CI artifact. Satisfies the "no pg_cron" constraint and "no persistent process"
  constraint imposed by the Vercel serverless environment. Operational run-book is a single Vercel
  cron job — minimal cognitive overhead.

### Option B: Supabase Edge Function (Deno runtime)

A Supabase Edge Function (`outbox-relay`) deployed as a scheduled function. Polls
`finance_outbox` using the service-role client, delivers to the configured internal projection
consumer, and updates `processed_at` after successful relay dispatch acknowledgment.

- **Pros**: Runs closer to the database. Supabase manages scheduling.
- **Cons**: Deno runtime diverges from the application's Node.js environment — TypeScript types
  (`FinancialOutboxEventDTO`) require a build step or cross-runtime copy to be shared. Adds a
  separate deployment artifact and a distinct CI step. Local development requires
  `supabase functions serve` alongside the Next.js dev server. Exit ramp to Option A is
  straightforward; entry cost is the type-sharing complexity.
- **Why not chosen**: Adds non-trivial Deno/Node.js boundary management for marginal pilot
  benefit. The type bridge burden is disproportionate at pilot scale. If the relay proves to need
  sub-minute latency at scale, Option B remains a clean post-pilot migration path.

### Option C: pg_notify push relay (ELIMINATED)

A DB trigger calls `pg_notify('finance_outbox_channel', event_id)`. A persistent listener
delivers events immediately on notification.

- **Why eliminated**: Requires a persistent PostgreSQL connection that Vercel's serverless model
  cannot hold. `pg_notify` payloads are limited to 8KB — the full event must be fetched from the
  outbox post-notification regardless. Falls back to polling for recovery from connection loss
  anyway. Exit ramp is difficult. Eliminated at scaffold stage.

### Trigger-based outbox insertion (FROZEN — NOT RE-OPENED)

Q4 (2026-05-06): trigger-based insertion rejected for the pilot. RPC-coupled insertion is the
Wave 2 mechanism. This RFC does not revisit that decision. Triggers fire inside the transaction
boundary (so ADR-054 D2 is technically satisfiable via trigger), but the Q4 resolution recorded
that hidden propagation behavior, trigger-creep risk (a trigger that "also" does something extra
is a D6 violation), and debug/rollback visibility concerns outweigh the implementation
convenience. RPC-coupled insertion remains locked.

---

## 7) Decisions Required

### Decision 1 — Relay Worker Execution Environment → ADR-056

**Decision:** Which runtime hosts the relay worker?

| Option | Runtime | New artifact? | Type sharing | Scheduling |
|---|---|---|---|---|
| A (recommended) | Next.js API route, Node.js | No | Native — same codebase | Vercel cron (`vercel.json`) |
| B | Supabase Edge Function, Deno | Yes | Requires build bridge | Supabase scheduler |

**Recommendation:** Option A.

**Why ADR-worthy:** The choice is hard to reverse once EXEC-SPEC is built around a specific
runtime — local dev workflow, CI artifact count, type-sharing patterns, and deployment run-books
all diverge between the two options. This is a durable infrastructure decision, not a
tuning choice.

**ADR consequences (to be frozen in ADR-056):**
- Relay is a Next.js API route — standard route-handler pattern.
- Scheduling is a Vercel cron entry in `vercel.json`.
- Type sharing with the rest of the application is native (no Deno bridge).
- `CRON_SECRET` env var is the relay endpoint auth mechanism.
- Batching, timeout, and concurrency parameters are EXEC-SPEC scope.

---

## 8) Open Questions

None at transport-semantics level. All schema shapes, insertion strategies, delivery semantics,
fills/credits classification, `processed_messages` design, and relay delivery model are frozen
in FIB §I/§G or in ADR-052–055.

Downstream implementation details deferred to EXEC-SPEC scope:
- Exact batch size value.
- Relay timeout per invocation.
- Specific `CRON_SECRET` rotation policy.
- Wave 2 event catalog artifact location and governance process.
- Failure-harness Jest test file specifics (EXEC-READY per
  `FAILURE-SIMULATION-HARNESS.md`).

---

## Links

- **FIB-H (APPROVED):** `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/wave-2/FIB-H-TRANSACTIONAL-OUTBOX.md`
- **FIB-S:** `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/wave-2/FIB-S-TRANSACTIONAL-OUTBOX.json`
- **Feature Scaffold:** `docs/01-scaffolds/SCAFFOLD-TRANSACTIONAL-OUTBOX.md`
- **Feature Boundary:** `docs/20-architecture/specs/transactional-outbox/FEATURE_BOUNDARY.md`
- **ADR(s) upstream:** ADR-052, ADR-053, ADR-054, ADR-055
- **ADR to produce:** ADR-056 (Relay Worker Execution Environment)
- **SEC Note:** (Phase 3)
- **PRD:** (Phase 5)

---

## References

- `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-knowledge-base.md` — primary implementation authority: DDL, relay worker, consumer pattern, GAP-F1 checklist
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-UBIQUITOUS-LANGUAGE-CLARIFICATION.md` — Dependency Event definition; `'estimated'` as provenance; conservative authority default
- `docs/issues/gaps/financial-data-distribution-standard/actions/FAILURE-SIMULATION-HARNESS.md` — I1–I4 invariant definitions and test scaffolding (EXEC-READY)
- `docs/issues/gaps/financial-data-distribution-standard/OVERENGINEERING_GUARDRAIL_OUTBOX_WAVE2.md` — Wave 2 transport-era guardrail: transport before projection, propagate don't platformize
- AWS Prescriptive Guidance — Transactional Outbox Pattern (dual-write problem, at-least-once semantics)
- microservices.io — Idempotent Consumer (processed_messages pattern)
- SoftwareMill — Microservices 101 (relay worker design, table bloat, marking-as-sent failure model)

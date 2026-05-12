---
id: ADR-056
title: Relay Worker Execution Environment
status: Accepted
date: 2026-05-10
owner: Vladimir Ivanov
decision_scope: Runtime host, scheduling mechanism, auth model, type-sharing strategy, and lifecycle metadata boundary for the transactional outbox relay worker
triggered_by: docs/02-design/RFC-006-transactional-outbox.md (§7 Decision 1)
related:
  - ADR-052
  - ADR-053
  - ADR-054
  - ADR-055
  - docs/issues/gaps/financial-data-distribution-standard/actions/fibs/wave-2/FIB-H-TRANSACTIONAL-OUTBOX.md
  - docs/30-security/SEC-NOTE-TRANSACTIONAL-OUTBOX.md
---

# ADR-056: Relay Worker Execution Environment

## 1. Context

RFC-006 (GAP-F1 Closure) specifies a transactional outbox relay worker that polls
`finance_outbox WHERE processed_at IS NULL`, delivers events to an internal projection consumer,
and records `processed_at` on successful relay dispatch acknowledgment.

All outbox mechanics — schema, insertion strategy, delivery semantics, idempotent consumer
discipline, and I1–I4 invariant definitions — are frozen in ADR-052–055 and RFC-006. The one
remaining open decision is where the relay worker runs.

Two options exist:

| Option | Runtime | New deployment artifact? | Type sharing | Scheduling |
|--------|---------|--------------------------|--------------|------------|
| **A** | Next.js API route, Node.js | No | Native — same codebase | Vercel cron (`vercel.json`) |
| **B** | Supabase Edge Function, Deno | Yes | Requires build bridge | Supabase scheduler |

This decision is durable: once the EXEC-SPEC is built around a specific runtime, local dev
workflow, CI artifact count, type-sharing patterns, and operational run-books diverge. It is not
a tuning choice.

---

## 2. Decision

**Option A is chosen: the relay worker is a Next.js API route, triggered by Vercel cron.**

---

## 3. Frozen Decisions

### D1 — Route implementation

The relay worker is implemented as a protected Next.js API route handler at
`/api/internal/outbox-relay`. It uses the standard route-handler pattern (`POST` method, `NextRequest`
/ `NextResponse`) consistent with the rest of the application. No new runtime, no new framework
abstraction.

### D2 — Scheduling mechanism

The relay is triggered on a schedule via a Vercel cron entry in `vercel.json`. The cron entry
specifies the route and schedule. Specific poll interval and cron expression are EXEC-SPEC scope
(Wave 2 constraint: Vercel free tier minimum is 1 minute; Pro tier allows lower). No persistent
process is involved.

### D3 — Auth mechanism

The relay endpoint validates a `CRON_SECRET` header on every invocation. Requests that do not
present a matching `CRON_SECRET` value are rejected with HTTP 401 before any database access.
`CRON_SECRET` is injected via Vercel environment variable; it is never stored in the database.
Vercel's own cron invocation injects the secret automatically via the configured env var
(`CRON_SECRET`); external callers cannot replicate this without the secret value.

### D4 — Type sharing

`FinancialOutboxEventDTO` (owned by PlayerFinancialService) is consumed by the relay worker
directly — no Deno runtime boundary, no build bridge, no cross-runtime type copy. Type changes
to the DTO propagate to the relay without an additional step.

### D5 — Service-role DB access

The relay worker uses the Supabase service-role client. It does not operate under user JWT
context. Relay operations use service-role access and therefore do not rely on table-level RLS
enforcement during relay execution. `FOR UPDATE SKIP LOCKED` prevents concurrent invocations from
claiming the same rows.

### D6 — Lifecycle metadata boundary (non-financial invariant)

Relay lifecycle metadata (`processed_at`, `delivery_attempts`, `last_attempted_at`, `last_error`)
is operational transport state. It MUST NOT be read by any code as:
- financial completeness signal
- settlement confidence indicator
- projection authority
- consumer-side processing guarantee
- DLQ state

`processed_at` records successful relay dispatch acknowledgment only. Consumer-side projection
durability is governed independently by `processed_messages`. The two mechanisms are distinct
and must not be collapsed. Any code that derives financial meaning from relay lifecycle fields is
non-conformant with this ADR.

### D7 — I1–I4 invariant definitions (frozen here as ADR consequences)

These invariants are first defined in RFC-006 and the Failure Simulation Harness; they are frozen
here as durable architectural consequences:

| Invariant | Statement |
|-----------|-----------|
| **I1 Atomicity** | PFT/grind INSERT and `finance_outbox` INSERT are in one `pg_current_xact_id()`; neither persists without the other. Proven by rollback injection, not row-count assertion alone. |
| **I2 Durability** | Committed outbox row survives relay worker process crash; relay worker delivers on next poll cycle. |
| **I3 Idempotency** | Consumer deduplicates via `processed_messages`; `runConsumer()` twice produces no duplicate side effects. |
| **I4 Replayability** | Projections rebuild deterministically from `finance_outbox` history; truncate + replay produces the same state. |

Test execution (Jest files, injection hooks, `npm run test:failure` CI step) is EXEC-SPEC scope.
Harness scaffolding is EXEC-READY per `docs/issues/gaps/financial-data-distribution-standard/actions/FAILURE-SIMULATION-HARNESS.md`.

---

## 4. Rejected Options

### Option B: Supabase Edge Function (Deno runtime)

A Supabase Edge Function (`outbox-relay`) deployed as a scheduled function.

**Rejected because:**
- The Deno runtime diverges from the application's Node.js environment. `FinancialOutboxEventDTO`
  and the service-layer patterns require a build step or cross-runtime copy to be shared,
  adding non-trivial type bridge complexity.
- Adds a separate deployment artifact and a distinct CI step (`supabase functions deploy`).
- Local development requires `supabase functions serve` alongside the Next.js dev server — an
  additional operational surface.
- These costs are disproportionate at pilot scale with no sub-minute latency requirement.

**Remains a clean post-pilot migration path:** if the relay proves to need sub-minute latency at
scale, migrating from Option A to Option B requires no changes to DDL, producer RPCs, consumer
backbone, or outbox schema. Only the relay route and scheduling config change.

### Option C: pg_notify push relay (eliminated at scaffold stage)

Requires a persistent PostgreSQL connection that Vercel's serverless model cannot hold. Payloads
are limited to 8KB. Falls back to polling for recovery from connection loss regardless. Not
reconsidered here.

---

## 5. Out of Scope

The following are explicitly deferred to EXEC-SPEC:
- Exact cron schedule / poll interval value
- Batch size env var name and starting value
- Relay invocation timeout setting
- `CRON_SECRET` rotation policy
- Specific Jest test file paths for I1–I4 harness execution
- Wave 2 event catalog artifact location

---

## 6. Consequences

### Positive

- No new deployment artifact, runtime, or CI step. The relay is part of the existing Next.js
  build and Vercel deployment.
- `FinancialOutboxEventDTO` is consumed natively; type changes are propagated without a bridge.
- Operational run-book is a single Vercel cron job — minimal operational overhead.
- Rollback is clean: disable the cron entry in `vercel.json` or revoke `CRON_SECRET`.
- `FOR UPDATE SKIP LOCKED` ensures concurrent Vercel cron invocations (overlapping triggers) do
  not claim the same row — no table locks, no contention.

### Trade-offs

- Polling interval floor of 1 minute on Vercel free tier. This is a named Wave 2 constraint,
  acceptable at pilot scale. Delivery latency at steady state is bounded by the cron interval.
- Stateless between invocations — no backpressure or in-flight tracking across cycles. Tolerable
  at pilot scale; the `delivery_attempts` field provides per-row introspection for diagnosis
  without requiring a persistent process.

---

## 7. SRM Update Required

The SRM footnote ¹ on `finance_outbox` currently references ADR-016 (payment gateway), superseded
by ADR-054. Blocking conformance item before merge: update the SRM to reference ADR-054 and
ADR-056 as the governing ADRs for `finance_outbox`. This is a Phase 5 (PRD) gate item.

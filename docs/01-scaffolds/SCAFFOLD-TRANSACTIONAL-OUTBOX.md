---
id: SCAFFOLD-TRANSACTIONAL-OUTBOX
title: "Feature Scaffold: Transactional Outbox"
owner: Vladimir Ivanov
status: Draft
date: 2026-05-09
---

# Feature Scaffold: Transactional Outbox

> Timebox: 30-60 minutes. If it's longer, you're drifting into a design doc.

**Feature name:** Transactional Outbox (GAP-F1 Closure)
**Owner / driver:** Vladimir Ivanov
**Stakeholders (reviewers):** Lead Architect
**Status:** Draft
**Last updated:** 2026-05-09

## 1) Intent (what outcome changes?)

- **User story:** As PT-2 infrastructure, when a financial fact (Class A ledger or Class B operational) is authored, a corresponding event row is written to `finance_outbox` within the same database transaction, so that projection consumers can be updated with guaranteed delivery and replay safety — without requiring consumers to poll authoring stores directly.
- **Primary actor:** System — authoring RPCs (`rpc_create_financial_txn`, `rpc_create_financial_adjustment`, new Class B grind RPC) are the write triggers. No direct operator interaction.
- **Success looks like:** A PFT insert and a grind insert each produce a `finance_outbox` row in the same `pg_current_xact_id()` as the authoring write. A relay worker marks rows as processed after delivery. A test consumer processes events idempotently with no duplicate side effects. I1 (Atomicity) and I3 (Idempotency) harness invariants pass.

## 2) Constraints (hard walls)

- **ADR-052–055 frozen (2026-04-23):** All implementation decisions must conform to the frozen ADR set. No code change overrides them without a superseding ADR.
- **Literal same-transaction atomicity (ADR-054 D2):** The `finance_outbox` INSERT must occur in the same `BEGIN…COMMIT` as the authoring write. No background job, no post-commit trigger, no separate RPC call. Violation = non-conformant regardless of retry logic.
- **RPC-coupled insertion (Q4, locked 2026-05-06):** Trigger-based outbox insertion is rejected for the pilot. Each authoring RPC is responsible for its own outbox row within its own transaction. The RPC performs deterministic outbox construction only — no projection writes, fan-out, or business logic.
- **Envelope parity (ADR-055 P1):** Class A and Class B must use identical `finance_outbox` column sets. No class-conditional nullable envelope columns. Class-specific content goes in `payload` JSONB.
- **`origin_label` immutability (ADR-054 D5):** Set at authoring boundary, never updated in transit. Consumer may not upgrade `'estimated'` to `'actual'`.
- **No trigger writes to non-outbox tables (ADR-054 D6):** A trigger that writes anything other than `finance_outbox` is a D6 violation regardless of transaction scope.
- **No pg_cron:** Per pilot containment policy. Relay worker scheduling must use an alternative (Vercel cron, Supabase Edge Function, or on-demand trigger).
- **No external broker (ADR-054 §9.3):** PostgreSQL-native relay only. No AWS SQS, EventBridge, or Kafka.
- **No reconciliation logic in consumers (ADR-053):** PT-2 is operational telemetry, not accounting truth.
- **Casino-scoped tenancy:** All new tables must carry `casino_id` NOT NULL per SRM contract policy.
- **SECURITY DEFINER governance (ADR-018):** Any new SECURITY DEFINER RPCs must follow ADR-018 requirements (`SET search_path = ''`, explicit role grants).
- **ADR-055 P4 — no asymmetric rollout:** Class A and Class B producer wiring must ship simultaneously. If both cannot be ready, neither ships.

## 3) Non-goals (what we refuse to do in this iteration)

1. **No external consumer contract** — `finance_outbox` is internal infrastructure. No external reconciliation interface, no third-party event semantics, no public event bus. (Q3 deferred outside pilot scope.)
2. **No event sourcing** — The system does not reconstruct state from outbox history. Outbox is propagation infrastructure, not a ledger.
3. **No authoritative totals or settlement** — Projection consumers produce telemetry surfaces with completeness labels. No "Total Drop", shift-end settlement, or final money position.
4. **No CDC / WAL replication** — Debezium, pg_logical, and WAL streaming are post-pilot infrastructure. Polling relay is the Wave 2 mechanism.
5. **No schema changes to `player_financial_transaction`** — Existing Class A authoring store is append-only; Wave 2 adds outbox INSERT within existing RPCs, not schema columns on PFT.
6. **No UI changes** — This feature is entirely backend/infrastructure. Surface completeness labels are already present from Wave 1. Consumers may update projection data that surfaces feed from, but no new UI components.
7. **No compliance domain scope** — `mtl_entry` / MTLService remains parallel and isolated. `finance_outbox` does not propagate compliance events.
8. **No reconciliation triggers on fills/credits** — Fills and credits are Dependency Events routed through the outbox for projection freshness, not for ledger reconciliation or count-room settlement.
9. **No `player_id` population on Class B rows** — `player_id = NULL` on every `table_buyin_telemetry` and corresponding `finance_outbox` row. Partial attribution is a violation (ADR-052 R5).
10. **No shared-parent table unification of Class A and Class B** — Separate tables confirmed (Q2). Five-commitment checklist not being signed off in this phase.

## 4) Inputs / Outputs

- **Inputs:**
  - Class A authoring: RPC call to `rpc_create_financial_txn` or `rpc_create_financial_adjustment` (existing RPCs, extended)
  - Class B authoring: RPC call to new grind authoring RPC (new, inserts into `table_buyin_telemetry`)
  - Dependency Events: fills and credits from `rpc_request_table_fill` / `rpc_request_table_credit` (optional — if routed through outbox for projection freshness)
- **Outputs:**
  - `finance_outbox` row per authoring write (same transaction)
  - Relay worker marks `processed_at` on confirmed delivery
  - Consumer projection updated idempotently
- **Canonical contract:**
  - `finance_outbox` schema: `{event_id UUID v7, event_type TEXT, fact_class enum, origin_label enum, table_id UUID NOT NULL, player_id UUID NULL, aggregate_id UUID NOT NULL, payload JSONB, created_at TIMESTAMPTZ, processed_at TIMESTAMPTZ NULL}`
  - `FinancialOutboxEventDTO`: TypeScript projection of the above for relay worker and consumer consumption

## 5) Options

### Option A: Relay worker as Next.js API route + Vercel cron

The relay worker is implemented as a protected Next.js API route (`/api/internal/outbox-relay`). Vercel's built-in cron jobs trigger it on a schedule (e.g., every 30 seconds). The route polls `finance_outbox WHERE processed_at IS NULL ORDER BY created_at LIMIT batch_size`, delivers to consumers, and sets `processed_at`.

- **Pros:** No new infrastructure dependency. Fits existing Next.js App Router pattern. Vercel cron is declarative in `vercel.json`. Easy to observe via existing route logging.
- **Cons / risks:** Polling interval limited by Vercel cron minimum (1 minute on free tier; 1 second on Pro). Stateless — no backpressure or in-flight tracking. Route must be protected from public access (requires internal secret header).
- **Cost / complexity:** Low. One route file, one `vercel.json` entry, existing service layer pattern.
- **Security posture impact:** Route must reject non-internal callers. `CRON_SECRET` env var guards the endpoint. No new RLS surface (service-role client reads `finance_outbox`).
- **Exit ramp:** Replace route with Edge Function or pg_notify listener without changing outbox DDL or producer wiring.

### Option B: Supabase Edge Function (Deno)

A Supabase Edge Function (`outbox-relay`) is deployed as a scheduled function. It polls `finance_outbox` using the service-role client, delivers to consumers, and updates `processed_at`. Triggered by Supabase's scheduled function mechanism.

- **Pros:** Runs closer to the database. Supabase manages scheduling. No Vercel-side configuration.
- **Cons / risks:** Deno runtime diverges from Next.js Node.js environment — shared TypeScript types require a build step or copy. Adds Supabase Edge Function deployment complexity. Local development requires `supabase functions serve`.
- **Cost / complexity:** Medium. New deployment artifact. Separate CI step. Type sharing is non-trivial.
- **Security posture impact:** Service-role access is already available in Supabase Edge Functions. No new RLS exposure, but deployment surface is wider.
- **Exit ramp:** Migrate to Option A (Next.js route) without changing DDL or producers.

### Option C: pg_notify + server-sent event listener (push model)

Authoring RPCs call `pg_notify('finance_outbox_channel', event_id)` after the outbox INSERT. A persistent Node.js process (or Next.js route with SSE) listens on the channel and delivers events immediately on notification.

- **Pros:** Near-real-time delivery (no polling lag). Efficient — no batch polling.
- **Cons / risks:** Requires a persistent connection to PostgreSQL — not stateless. Vercel serverless cannot hold persistent connections. Adds infrastructure complexity. `pg_notify` payloads are limited to 8KB; full event must be fetched from outbox after notification. Connection failure means missed notifications (falls back to polling anyway for recovery).
- **Cost / complexity:** High. Requires a persistent process outside Vercel's serverless model.
- **Security posture impact:** Persistent connection management; reconnect logic required.
- **Exit ramp:** Difficult — requires dismantling the listener infrastructure.

## 6) Decision to make

- **Decision:** Which relay worker execution environment?
- **Decision drivers:** Vercel cron minimum interval, local dev simplicity, deployment artifact count, existing infra fit.
- **Pre-recommendation:** Option A (Next.js API route + Vercel cron) matches the existing deployment model, requires no new infrastructure, and satisfies the "no pg_cron" constraint. Option C is eliminated by the Vercel serverless constraint. Option B adds Deno/Edge Function complexity for marginal benefit at pilot scale.
- **Decision deadline:** Phase 2 (RFC) — must be locked before ADR.

## 7) Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| `outbox-knowledge-base.md` | **Primary implementation authority** — `finance_outbox` DDL, trigger classification, relay worker design, idempotent consumer, GAP-F1 closure checklist (§12); all Phase 2–5 artifacts must be consistent with it | `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-knowledge-base.md` |
| ADR-052 Financial Fact Model | Required — governs Class A/B discriminators, table-first anchoring, TBT reclassification | `docs/80-adrs/ADR-052-financial-fact-model-dual-layer.md` — Frozen 2026-04-23 |
| ADR-053 Financial System Scope | Required — prohibits authoritative totals, reconciliation, and ledger derivation | `docs/80-adrs/ADR-053-financial-system-scope-boundary.md` — Frozen 2026-04-23 |
| ADR-054 Financial Event Propagation | Required — atomic write rule (D2), outbox event schema, origin_label immutability (D5), D6 trigger prohibition | `docs/80-adrs/ADR-054-financial-event-propagation-surface-contract.md` — Frozen 2026-04-23 |
| ADR-055 Cross-Class Authoring Parity | Required — identical envelope column set (P1), UUID v7 at authoring boundary (P2), no asymmetric rollout (P4) | `docs/80-adrs/ADR-055-cross-class-authoring-parity.md` — Frozen 2026-04-23 |
| **WAVE-2-UBIQUITOUS-LANGUAGE-CLARIFICATION.md** | **Critical semantic artifact** — canonical definition of Dependency Event (fills, credits); establishes `'estimated'` as a provenance label not an accuracy qualifier; conservative authority default rule; Projection Input = Authority Fact \| Telemetry Fact \| Dependency Event. **All Phase 2–5 artifacts that reference fills, credits, or Dependency Event routing must be consistent with it.** | `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-UBIQUITOUS-LANGUAGE-CLARIFICATION.md` |
| FAILURE-SIMULATION-HARNESS.md | **Invariant authority for I1–I4** — defines atomicity, durability, idempotency, replayability invariants. Design-pipeline scope: Phase 4 ADR freezes the invariant definitions as consequences; Phase 5 PRD includes "I1–I4 pass against real implementation" as a testable acceptance criterion. Harness execution (Jest files, injection hooks, CI step) is build-pipeline EXEC-SPEC scope. | `docs/issues/gaps/financial-data-distribution-standard/actions/FAILURE-SIMULATION-HARNESS.md` — EXEC-READY |
| `rpc_create_financial_txn` (existing) | Required — Class A write path to extend | Implemented |
| `rpc_create_financial_adjustment` (existing) | Required — Class A adjustment path to extend | Implemented |
| `rpc_request_table_fill` / `rpc_request_table_credit` (existing) | Optional — Dependency Event routing | Implemented (no outbox yet) |
| Wave 2 completeness projection (DEC-1) | Dependent — `completeness.status: 'unknown'` persists until gaming-day lifecycle column added | Future work |

## 8) Risks / Open questions

| Risk / Question | Impact | Mitigation / Learning Plan |
|---|---|---|
| `table_buyin_telemetry` schema shape not yet defined | High — blocks Class B producer wiring and DDL | Phase 2 (RFC) must define minimal viable schema: `id`, `casino_id`, `table_id`, `event_type`, `amount_cents`, `created_at`; grind data model confirmed in RFC |
| Fills/credits as Dependency Events — should they emit to outbox? | Medium — affects projection freshness | Phase 2 decision: include as Dependency Event category in `event_type` enum, with `fact_class = 'operational'` and `origin_label = 'estimated'` per ADR-054 |
| Vercel cron minimum interval (1 min on free tier) | Low-Medium — tolerable for pilot; not real-time | Acceptable for Wave 2 pilot. Document as known latency bound. |
| `processed_messages` table scope — one per consumer or global | Medium | Phase 2 decision: single table scoped by `consumer_id` column; or per-consumer table. Phase 2 RFC resolves. |
| SRM v4.23.0 stale footnote (ADR-016 → ADR-054 replacement) | Low — doc debt | Phase 4/5 SRM update required; flagged in FEATURE_BOUNDARY.md |
| Remote database migration gap (W2-PRE-1) | Medium — `finance_outbox` DDL cannot land cleanly if remote DB has pending unapplied migrations | Parallel DevOps action; outbox DDL design proceeds independently |

## 9) Definition of Done (thin)

- [ ] Relay worker execution environment decided and recorded in ADR
- [ ] `finance_outbox` DDL defined with all required columns + constraints + indices
- [ ] `table_buyin_telemetry` schema defined and migration written
- [ ] Class A producer wiring implemented and tested (I1 atomicity: rollback test)
- [ ] Class B producer wiring implemented and tested (ADR-055 parity: simultaneous with Class A)
- [ ] Relay worker implemented and delivers events; sets `processed_at`
- [ ] Consumer processes `event_id` idempotently (I3 idempotency test)
- [ ] FAILURE-SIMULATION-HARNESS.md I1–I4 variants pass against real implementation

## Links

- Feature Boundary: `docs/20-architecture/specs/transactional-outbox/FEATURE_BOUNDARY.md`
- **Outbox Knowledge Base (primary implementation authority):** `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-knowledge-base.md`
- Design Brief/RFC: (Phase 2)
- ADR(s): (Phase 4)
- PRD: (Phase 5)

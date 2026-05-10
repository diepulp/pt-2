# Feature Intake Brief — Transactional Outbox (GAP-F1 Closure)

**FIB-ID:** FIB-H-W2-OUTBOX-001
**Status:** Draft v1
**Date opened:** 2026-05-09
**Last revised:** 2026-05-10
**Guardrail:** GOV-FIB-001 applied — see §M (Scope Guardrail Blocks) below

---

## A. Feature Identity

- **Feature name:** Transactional Outbox (GAP-F1 Closure)
- **Feature ID / shorthand:** `transactional-outbox`
- **Related wedge / phase / slice:** Wave 2 — first infrastructure slice
- **Requester / owner:** Vladimir Ivanov
- **Date opened:** 2026-05-09
- **Priority:** P0 — structural prerequisite for all Wave 2 consumer/projection work
- **Target decision horizon:** Pilot (Wave 2 internal propagation only)

---

## B. Operator Problem Statement

The PT-2 system records two kinds of financial facts: ledger transactions tied to specific players, and operational buy-in observations at the table level. When either type of fact is written, downstream surfaces — shift telemetry, session summaries, pit dashboards — need to reflect the change. Currently there is no guaranteed delivery path from the authoring stores to those surfaces. Projection layers either poll the authoring stores directly (creating coupling and database load) or return stale data with no reliable update mechanism. As a result, every visit-level financial aggregate on the system today returns a completeness status of "unknown" — operators cannot tell whether the numbers on their screen reflect the most recent facts or data from hours ago. There is also no safe way to replay and rebuild a surface after a projection error without querying authoring stores directly. The outbox infrastructure closes this gap by making event delivery a durable, guaranteed property of the authoring write itself rather than a best-effort background concern.

---

## C. Pilot-Fit / Current-Slice Justification

Wave 1 closed with all financial surfaces correctly labeled for authority and completeness, but every visit-level financial aggregate emits `completeness.status: 'unknown'` because the system has no lifecycle-aware projection mechanism — the DEC-1 decision recorded in EXEC-080. The transactional outbox is the prerequisite that makes `'complete'` and `'partial'` completeness signals possible at all. Without it, Wave 1's surface contract is technically correct but operationally inert: operators have authority labels on numbers but no basis for trusting when those numbers were last updated. This is the minimal infrastructure slice that unblocks every downstream projection consumer in Wave 2.

---

## D. Primary Actor and Operator Moment

- **Primary actor:** System — the authoring RPCs are the write triggers. No direct operator interaction at authoring time. Triggering RPCs: `rpc_create_financial_txn` (Class A buy-in/cashout), `rpc_create_financial_adjustment` (Class A adjustment), new `rpc_record_grind_observation` (Class B), `rpc_request_table_fill` and `rpc_request_table_credit` (Dependency Events — fills/credits emit to outbox for projection freshness; no ledger authority).
- **When does this happen?** At the moment a financial fact or Dependency Event is authored: a player buy-in is recorded, a cashout is recorded, a financial adjustment is applied, a table-level operational observation is logged, or a fill/credit is requested at a table.
- **Primary surface:** Internal infrastructure — no operator-facing surface is introduced. The observable effect for operators is that completeness labels on existing surfaces become meaningful once consumers are built downstream.
- **Trigger event:** Any Class A authoring write, Class B authoring write, or fill/credit Dependency Event write via its owning RPC.

---

## E. Feature Containment Loop

1. An authoring RPC executes — Class A (`rpc_create_financial_txn` / `rpc_create_financial_adjustment`), Class B (`rpc_record_grind_observation`), or Dependency Event (`rpc_request_table_fill` / `rpc_request_table_credit`) → the system opens a database transaction and inserts both the authoring row and a corresponding `finance_outbox` row before committing. Fills and credits use `event_type = 'fill.recorded'` / `'credit.recorded'`, `fact_class = 'operational'`, `origin_label = 'estimated'`, `player_id = NULL`.
2. The transaction commits → both rows are durable and visible together; if either insert fails, the entire transaction rolls back and no partial state exists.
3. The relay worker polls `finance_outbox WHERE processed_at IS NULL ORDER BY created_at` on a schedule → it retrieves the next batch of undelivered events in per-entity (`table_id`) insertion order.
4. The relay worker delivers each event to a registered consumer → the consumer receives the full `FinancialOutboxEventDTO` envelope including `fact_class`, `origin_label`, `event_id`, and `payload`.
5. The consumer checks `processed_messages` for the incoming `event_id` → if already present, the event is a duplicate and is discarded without any side effect.
6. If the `event_id` is new, the consumer inserts into `processed_messages` and applies its projection update within the same database transaction → the projection change and the deduplication record are committed atomically.
7. The relay worker receives confirmation of delivery → it sets `processed_at` on the outbox row, marking it as delivered.
8. If the relay worker crashes or restarts before setting `processed_at` → the row remains `processed_at IS NULL` and is re-delivered on the next poll cycle; the consumer's `processed_messages` check ensures no duplicate side effect.
9. A projection consumer that needs to rebuild its state can replay all rows in `finance_outbox` ordered by `(table_id, created_at)` → the resulting projection state is equivalent to the live projection state under the same ordered event history.

---

## F. Required Outcomes

- A Class A authoring write and its `finance_outbox` row are committed in the same database transaction with no window between them (I1: atomicity invariant).
- A Class B authoring write and its `finance_outbox` row are committed in the same database transaction with identical discipline to Class A (ADR-055 P4 parity — both classes land simultaneously).
- A committed `finance_outbox` row survives a relay worker process crash and is delivered on the next poll cycle (I2: durability invariant).
- A consumer that receives the same `event_id` twice applies its side effect exactly once (I3: idempotency invariant).
- A projection consumer can truncate its state and replay from `finance_outbox` history to reach an identical result (I4: replayability invariant).
- Every `finance_outbox` row carries `fact_class`, `origin_label`, `table_id`, `aggregate_id`, and `event_id` — consumers read these fields directly and never infer them from payload content.
- `origin_label` travels from authoring boundary to consumer unchanged; no consumer may upgrade `'estimated'` to `'actual'`.
- Event types are centrally governed. New `event_type` values must be explicitly registered in the Wave 2 event catalog artifact before use in producer RPCs or consumers. Arbitrary or ad-hoc event-type introduction is prohibited.

---

## G. Explicit Exclusions

- **No external consumer contract.** `finance_outbox` is internal PT-2 infrastructure. No external reconciliation interface, no third-party event semantics, no public event bus. (Q3 deferred outside pilot scope; future externalization requires a separate ADR and stakeholder discovery.)
- **No event sourcing.** The system does not reconstruct authoritative state from outbox history. Outbox is propagation infrastructure, not a ledger.
- **No authoritative totals or financial settlement.** Projection consumers produce telemetry surfaces with completeness labels. No "Total Drop", shift-end settlement, or final money position.
- **No CDC / WAL replication.** Debezium, `pg_logical`, and WAL streaming are post-pilot infrastructure. Polling relay is the Wave 2 mechanism.
- **No schema changes to `player_financial_transaction`.** Existing Class A store is append-only. Wave 2 adds `finance_outbox` INSERT within existing RPCs, not new columns on PFT.
- **No UI changes.** This feature is entirely backend/infrastructure. No new components, panels, or routes.
- **No compliance domain scope.** `mtl_entry` / MTLService remains parallel and isolated. `finance_outbox` does not propagate compliance events.
- **No reconciliation logic on fills and credits.** Fills (`rpc_request_table_fill`) and credits (`rpc_request_table_credit`) emit to `finance_outbox` as Dependency Events. Decision frozen in this FIB: `fact_class = 'operational'`, `origin_label = 'estimated'` (provenance label — not an accuracy claim), `player_id = NULL`. This is not a reconciliation mechanism. Fills/credits do not produce authoritative totals, count-room settlement, or ledger entries. The relay worker delivers their outbox rows to projection consumers identically to Class B events. Authority conflation into `'actual'` is prohibited.
- **No `player_id` on Class B rows.** `player_id = NULL` on every `table_buyin_telemetry` and corresponding `finance_outbox` row. Partial attribution is a violation (ADR-052 R5).
- **No shared-parent table unification of Class A and Class B.** Separate tables confirmed (Q2). The five-commitment sign-off is not being performed in this phase.
- **No new projection surfaces.** This FIB wires the transport layer only. Projection consumers (shift telemetry, session summary, pit dashboard) are downstream of this FIB and belong to subsequent slices.
- **No trigger-based outbox insertion.** Trigger-based insertion rejected for the pilot (Q4, 2026-05-06). All outbox rows are inserted by RPCs within their own transaction boundary.

---

## H. Adjacent Ideas Considered and Rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Trigger-based outbox insertion (`AFTER INSERT` on PFT / grind tables) | Triggers fire inside the transaction boundary — satisfies atomicity with less RPC change | Q4 resolved 2026-05-06: rejected for pilot. Triggers introduce hidden propagation behavior, reduce rollback/debug visibility, create trigger-creep risk (a trigger that "also" updates a projection is a D6 violation), and conflict with the RPC-centric architecture. |
| Lifecycle-aware completeness projection (emit `'complete'`/`'partial'` on visit-level surfaces) | The direct value of the outbox — once events propagate, projection surfaces can upgrade from `'unknown'` | Consequence, not cause. Projection consumers are downstream of this FIB. They belong to the next slice. Pulling them in here bundles transport + presentation, which is the canonical consequence-bundling anti-pattern (GOV-FIB-AP-001). |
| CDC/WAL relay via Debezium or `pg_logical` | Eliminates polling lag; reads the change stream directly | Adds non-trivial infrastructure (Deno runtime divergence, WAL configuration, reconnect logic, separate CI artifact). Violates YAGNI at pilot scale. Acceptable for post-pilot scale work; explicitly excluded from Wave 2 scope. |
| External reconciliation consumer contract | While wiring the internal relay, expose an outbox event API for external stakeholders | Q3 deferred outside pilot scope. Externalization requires a separate ADR and stakeholder discovery. The outbox is internal infrastructure in this slice. |
| `pg_notify` push relay | Near-real-time delivery; eliminates poll interval lag | Requires a persistent connection to PostgreSQL that Vercel's serverless model cannot hold. Falls back to polling for recovery anyway. Exit ramp is difficult. Eliminated at scaffold. |
| Shared-parent table for Class A and Class B authoring stores | Simplifies relay worker (one poll target) | Q2 resolved 2026-05-06: behavioral convergence risk outweighs structural benefit at pilot scale. Five-commitment sign-off not being performed. |

---

## I. Dependencies and Assumptions

- **ADR-052, ADR-053, ADR-054, ADR-055** — frozen 2026-04-23. All implementation decisions must conform. No code change overrides them without a superseding ADR.
- **WAVE-2-UBIQUITOUS-LANGUAGE-CLARIFICATION.md** (2026-05-07, CANONICAL) — canonical definition of Dependency Event; `'estimated'` as provenance label not accuracy qualifier; conservative authority default (absence of provenance stays `'estimated'`). Required reading for all Phase 2–5 artifacts that reference fills, credits, or authority classification.
- **outbox-knowledge-base.md** — primary implementation authority for `finance_outbox` DDL, trigger classification (D2 vs D6), relay worker design, idempotent consumer, `origin_label` immutability, and GAP-F1 closure checklist (§12). All Phase 2–5 artifacts must be consistent with it.
- **FAILURE-SIMULATION-HARNESS.md** (EXEC-READY) — defines I1–I4 invariants. Phase 4 ADR freezes the invariant definitions; Phase 5 PRD includes "I1–I4 pass against real implementation" as a testable acceptance criterion. Harness execution (Jest files, injection hooks, CI step) is build-pipeline EXEC-SPEC scope.
- **`rpc_create_financial_txn` and `rpc_create_financial_adjustment`** — existing Class A write RPCs. Both will be extended to insert a `finance_outbox` row within their existing transaction boundary. No new RPC interface — internal extension only.
- **Wave 1 surface contract** — complete (EXEC-080, 2026-05-06). Surfaces already carry `type`, `source`, and `completeness` envelopes. The outbox does not change surface shape; it makes projection data fresher.
- **Q1–Q4 design decisions resolved** (2026-05-06). Two-store model, separate tables, internal-only scope, and RPC-coupled insertion are all locked. No open design questions block this FIB.
- **`table_buyin_telemetry` minimal schema (frozen):**
  ```sql
  CREATE TABLE table_buyin_telemetry (
    id           UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    casino_id    UUID        NOT NULL,
    table_id     UUID        NOT NULL,
    event_type   TEXT        NOT NULL CHECK (event_type IN ('buyin.observed', 'grind.observed')),
    amount_cents BIGINT      NOT NULL CHECK (amount_cents >= 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
  ```
  No `player_id` column — absent by construction (ADR-052 R5). New RPC: `rpc_record_grind_observation(p_casino_id UUID, p_table_id UUID, p_event_type TEXT, p_amount_cents BIGINT) RETURNS UUID`. ADR-055 parity requirements: SECURITY DEFINER (ADR-018), same `BEGIN…COMMIT` boundary as Class A RPCs, UUID v7 generated at authoring boundary for `event_id`, `fact_class = 'operational'` and `origin_label = 'estimated'` hardcoded, `player_id = NULL` unconditional. Phase 2 RFC confirms this schema; Phase 2 RFC may not shrink or drop any column without a FIB amendment.
- **`processed_messages` table schema (frozen):**
  ```sql
  CREATE TABLE processed_messages (
    message_id   UUID        NOT NULL PRIMARY KEY,  -- event_id from finance_outbox
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
  ```
  Owner: PlayerFinancialService. No `consumer_id` column in Wave 2 pilot — single-consumer assumption is a named constraint. Wave 2 assumes a single internal consumer path. Multi-consumer fan-out is explicitly out of scope for this FIB and may require future schema evolution. Consumer checks `processed_messages` by `INSERT … ON CONFLICT DO NOTHING RETURNING message_id`; no row returned = duplicate, skip; row returned = new, proceed.
- **Relay worker execution environment (locked — polling model):**
  - internal-only relay worker
  - authenticated invocation
  - polling-based delivery
  - at-least-once semantics
  - concurrency-safe row claiming

  Exact runtime topology, batching strategy, lock primitive, route location, and timeout tuning belong to downstream PRD / EXEC-SPEC scope.
- **Casino-scoped tenancy** — all new tables (`finance_outbox`, `table_buyin_telemetry`, `processed_messages`) must carry `casino_id NOT NULL` per SRM contract policy.
- **SECURITY DEFINER governance** — any new SECURITY DEFINER RPCs must follow ADR-018 (`SET search_path = ''`, explicit role grants). Pre-commit hook enforces this.

---

## J. Out-of-Scope but Likely Next

- **Lifecycle-aware completeness projection** — once outbox producers are wired and relay worker is delivering events, the first consumer slice can emit `'complete'`/`'partial'` on visit-level financial surfaces (resolving the DEC-1 `'unknown'` state recorded in EXEC-080). This is the immediate downstream consumer slice.
- **SRM v4.23.0 update** — register `finance_outbox` under PlayerFinancialService (ADR-054), `table_buyin_telemetry` under TableContextService (ADR-052 Class B), `processed_messages` under PlayerFinancialService; remove the stale ADR-016 footnote. Scoped to Phase 4/5 of the feature pipeline.

---

## K. Expansion Trigger Rule

Amend this brief if any downstream artifact proposes:
- A new operator-visible outcome not described in §F
- An external consumer contract or public event API
- A new top-level surface, channel, or automation path
- A new actor or workflow not represented in the containment loop
- Projection surface work (shift telemetry, session summary, dashboard consumer) — these are downstream slices, not this FIB
- Any changes to `player_financial_transaction` column schema

**Feature-specific note:** Fills/credits routing is frozen in this FIB (§G, §D, §E step 1) — they emit to `finance_outbox` as Dependency Events. This decision must not be re-opened in Phase 2 RFC. If the RFC proposes any new surface, external routing, or authority reclassification for fills/credits, that requires a FIB amendment.

---

## L. Scope Authority Block

- **Intake version:** v0
- **Frozen for downstream design:** No — pending human approval
- **Downstream expansion allowed without amendment:** No
- **Open questions allowed to remain unresolved at scaffold stage:** None for transport semantics. `table_buyin_telemetry` schema, `processed_messages` schema, relay semantics, and fills/credits routing are frozen in this FIB (§I, §G). Runtime topology, batching strategy, lock primitive, route location, timeout tuning, and harness internals remain downstream PRD / EXEC-SPEC scope.
- **Human approval / sign-off:** [Vladimir Ivanov / pending]

---

## M. Scope Guardrail Blocks (GOV-FIB-001)

### One-Line Boundary

> This FIB wires `finance_outbox` as an internal Projection Input relay — transactional producer insertion, polling relay worker, and idempotent consumer receipt for both Class A and Class B authoring paths; it does not build any new projection surface, external consumer contract, or financial settlement mechanism.

> This FIB freezes transport semantics and infrastructure boundaries only.
>
> It does not freeze implementation topology, runtime tuning, batching strategy, or harness internals unless explicitly required for semantic correctness.

### Primary Change Class

```
Primary change class: Infrastructure
```

Qualification met: current trigger exists (Wave 1 surfaces stuck at `completeness.status: 'unknown'`); both authoring paths are implemented; Q1–Q4 resolved. This is not speculative future infrastructure — it has an immediate consumer (the lifecycle-aware completeness projection slice that follows).

### Coverage Mode

```
Coverage mode: Full
```

Full mode is justified because ADR-055 P4 (no-asymmetric-rollout) makes representative coverage invalid for an atomicity invariant. Both Class A and Class B producer wiring must land simultaneously — if one is absent, the FIB boundary is incorrect, not merely incomplete. The "full" scope here is the transport guarantee itself, not a surface inventory rollout.

### Layer Budget

```
Primary layer: Infrastructure
Secondary layers: Service/Data (DDL migrations, DTO definition — strictly pass-through of the transport contract)
```

The DDL migrations and `FinancialOutboxEventDTO` are the surface area of the infrastructure contract, not independent Service/Data work. No UI layer, no API route changes, no presentation logic.

### Cause vs Consequence Split

| Category | In This FIB | Deferred |
|---|---|---|
| Cause: no guaranteed delivery path from authoring stores to projection consumers | ✅ | — |
| Immediate proof: I1–I4 invariants pass against real implementation | ✅ | — |
| Downstream projection surfaces (`'complete'`/`'partial'` completeness) | — | Next consumer slice |
| Full CI enforcement for outbox event shape | — | Observability/enforcement FIB |
| External consumer contract | — | Outside pilot scope (Q3) |

### Adjacent Consequence Ledger

| Temptation | Why It Is Adjacent | Disposition |
|---|---|---|
| Lifecycle-aware completeness projection (emit `'complete'`/`'partial'`) | Consequence of working outbox — projection consumers become possible once transport is wired | Defer to Wave 2 Phase 2 (first consumer projection slice) — **explicitly removed from MUST scope** |
| Full projection layer (shift telemetry, session summary, pit dashboard consumers) | End-goal of the outbox work | Defer to subsequent build-pipeline EXEC-SPECs after transport is verified |
| External reconciliation API / public outbox event bus | Tempting to expose while wiring internal relay | Defer outside pilot scope — separate ADR + stakeholder discovery required (Q3) |
| Full observability suite (backlog dashboards, retry-spike alerts, processing-lag metrics) | Useful once relay worker is running | Defer to observability FIB; `outbox_backlog_size` log line sufficient for transport proof |
| Fills/credits as authority-bearing facts or ambiguous Dependency Events | The outbox wires all Projection Inputs — tempting to conflate authority semantics | **Decided in this FIB.** Fills and credits emit to `finance_outbox` as Dependency Events: `fact_class = 'operational'`, `origin_label = 'estimated'` (provenance), `player_id = NULL`. Authority conflation blocked by WAVE-2-UBIQUITOUS-LANGUAGE-CLARIFICATION.md. This is no longer an adjacent idea — it is frozen scope. |

### Atomicity Test

1. **Can the FIB ship without deferred projection surfaces?** Yes — the outbox infrastructure is a self-contained transport contract. It produces rows that consumers will use, but no specific projection surface is required to prove the transport guarantee.
2. **Can deferred work follow without rewriting this FIB?** Yes — projection consumers are downstream readers of the `FinancialOutboxEventDTO` contract defined here; they do not alter the transport boundary.
3. **Does the shipped FIB remain internally consistent and truthful?** Yes — the outbox infrastructure is operationally complete without downstream consumers. The relay worker, idempotent consumer backbone, and I1–I4 invariants are verifiable in isolation.

**I1 Atomicity proof requirement:**

I1 atomicity must be proven by rollback injection and same-transaction verification, not by row-count assertion alone.

Detailed harness implementation, fault-injection strategy, and transaction-verification mechanics belong to downstream PRD / EXEC-SPEC scope.

### Diff-Size Sanity

Expected logic files: ~12–16 (2 RPC extensions, 3 DDL migrations, relay worker implementation, consumer service module, DTO definition, `processed_messages` service, harness test stubs, invocation configuration). Multiple directory boundaries (`supabase/migrations/`, `services/player-financial/`, `services/table-context/`, application worker boundary, failure-test boundary) — all within a single infrastructure concern. The multi-directory spread is expected for infrastructure wiring and does not indicate hidden multi-class scope. No UI directory, no `components/` changes.

---

## References

| Document | Role |
|---|---|
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-UBIQUITOUS-LANGUAGE-CLARIFICATION.md` | Critical — Dependency Event definition, `'estimated'` as provenance label, conservative authority default |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-knowledge-base.md` | Primary implementation authority — DDL, relay worker, consumer, GAP-F1 checklist |
| `docs/issues/gaps/financial-data-distribution-standard/actions/FAILURE-SIMULATION-HARNESS.md` | I1–I4 invariant definitions |
| `docs/20-architecture/specs/transactional-outbox/FEATURE_BOUNDARY.md` | Bounded context and SRM ownership |
| `docs/01-scaffolds/SCAFFOLD-TRANSACTIONAL-OUTBOX.md` | Options, constraints, open decisions |
| ADR-052–055 (`docs/80-adrs/`) | Frozen 2026-04-23 — all decisions governed by this set |
| `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md` | GOV-FIB-001 — guardrail applied above |

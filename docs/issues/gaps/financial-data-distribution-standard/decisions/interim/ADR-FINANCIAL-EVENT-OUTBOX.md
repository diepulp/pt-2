# ADR-XXX — Financial Event Outbox (Propagation Backbone)

---

status: Draft for review
date: 2026-04-23
scope: Pilot (PT-2)
respects: FACT-AUTHORITY-MATRIX-FIN-DOMAIN (propagation must not violate authority rules)
depends_on:

* ADR — Financial Event Ingestion Unification
* ADR — Financial Fact Model
  purpose: Define how financial events propagate to downstream consumers

---

# 1. Context

The system has established:

* a single financial ingestion path (PFT) — Ingestion ADR
* a self-describing row shape for a PFT fact — Fact Model ADR
* an authority matrix defining fact types, ownership, and forbidden relationships — FACT AUTHORITY MATRIX

However, downstream consumers (shift dashboard, projections, MTL, UI) currently rely on:

* implicit triggers
* polling
* ad-hoc recomputation
* client-side state blending

This results in:

* stale dashboards
* inconsistent propagation
* hidden coupling between domains

The system lacks a **reliable event propagation mechanism**.

A propagation layer can solve freshness — but if designed carelessly, it becomes the new place where matrix rules are silently broken (a projection reaches back into PFT, a grind event crosses into compliance, a consumer writes ledger state). This ADR therefore defines **not only how events propagate, but what they are forbidden to propagate into**.

---

# 2. Decision

## D1 — Introduce Financial Event Outbox

> Every financial write MUST produce a corresponding event in `finance_outbox`

This occurs within the same database transaction as the PFT write.

---

## D2 — Atomic Write Rule

> PFT write + outbox event MUST succeed or fail together

This guarantees:

* no lost events
* no phantom events

This aligns with the transactional outbox pattern, which ensures **atomic state + event persistence** ([AWS Documentation][1])

---

## D3 — Outbox as Source of Propagation

> All downstream consumers MUST react to outbox events, not direct table reads

This includes:

* shift dashboard updates
* projection refreshes
* compliance derivations (future)
* analytics / metrics

---

## D4 — Asynchronous Delivery

Outbox events are:

* stored synchronously
* consumed asynchronously

A separate process (poller / listener) reads from `finance_outbox` and triggers downstream updates.

---

## D5 — At-Least-Once Delivery

The system guarantees:

> Every event will be delivered at least once

Consumers MUST be idempotent.

This is a standard trade-off in distributed systems using outbox patterns ([Confluent][2])

---

# 3. Event Model (Minimal)

Each outbox record contains:

* `event_id (UUID)`
* `event_type` (e.g. `buyin.created`, `cashout.recorded`)
* `aggregate_id` (e.g. rating_slip_id / visit_id)
* `origin_label` — one of `Actual | Estimated | Observed | Compliance` (matrix §6)
* `is_rated` — carried from PFT row (matrix distinguishes by attribute, not storage)
* `payload (JSON)`
* `created_at`
* `processed_at (nullable)`

`origin_label` is mandatory. Consumers that surface values to UI or API must pass the label through unchanged. This preserves **matrix §6** at the propagation layer: a value surfaced anywhere in the system can always trace back to its authoritative fact type.

---

# 4. Target Topology

## BEFORE (current)

```id="c1gq2z"
PFT
 ├─→ triggers → MTL
 ├─→ triggers → projections
 └─→ UI polling / recompute

(no unified propagation layer)
```

---

## AFTER (target)

```id="7g6n3c"
PFT (ledger)
   ↓
finance_outbox (event)
   ↓
event consumer
   ↓
projections / dashboards / services
```

---

# 5. Responsibilities

## Write Side

* writes PFT
* inserts outbox event
* no awareness of consumers

---

## Event Consumer

* reads unprocessed outbox rows
* dispatches updates
* marks events as processed

---

## Read Side

* reacts to events
* updates projections
* never writes financial facts

---

# 6. Consequences

## Positive

* Eliminates stale dashboard class of bugs
* Decouples write and read models
* Enables real-time updates without polling
* Provides audit trail of all emitted events
* Prevents dual-write inconsistencies

The outbox pattern is specifically designed to solve the **dual-write problem and ensure consistency across systems** ([Medium][3])

---

## Trade-offs

* introduces eventual consistency (milliseconds–seconds delay)
* requires idempotent consumers
* adds operational component (event processor)

---

# 7. Constraints (Matrix-Respecting)

Each constraint below preserves a specific matrix rule at the propagation layer.

## C1 — Emission Is PFT-Exclusive

Only a committed PFT row may produce an outbox event.

Forbidden emissions:

* from `table_buyin_telemetry` writes (TBT is a projection, not a fact source)
* from `pit_cash_observation` (observational — matrix row 5)
* from `mtl_entry` (parallel ledger — matrix row 4)
* from UI or projection reads

*Respects:* Matrix **A1** (PFT is the single source of financial truth) and **A4** (projections are non-authoritative — projections cannot emit).

---

## C2 — No Direct Cross-Domain Writes

No service may update another domain directly.

All propagation must go through:

> PFT → outbox → consumer

*Respects:* Matrix **I2 Forbidden Relationships**. Consumers never write back to PFT or into a foreign domain's authoritative store.

---

## C3 — Consumers Are Projection-Only

An outbox consumer may:

* update projections / read models
* update dashboard caches
* trigger notifications
* emit derived compliance signals (labeled accordingly)

A consumer MUST NOT:

* write to PFT
* write to `mtl_entry` as a financial settlement
* merge multiple fact types into a single unlabeled value

*Respects:* Matrix **A2** (operational facts cannot settle ledger), **A3** (compliance is parallel, not hierarchical), **A5** (no silent mixing).

---

## C4 — No Hidden Triggers

Database triggers that perform cross-domain propagation outside the outbox must be removed or deprecated. The outbox is the only legitimate fan-out path.

*Respects:* Matrix **S3** (domain separation) — hidden triggers collapse domains silently.

---

## C5 — No UI-Driven Reconciliation

UI must not attempt to "fix" propagation gaps via recomputation against PFT.

*Respects:* Matrix **I2** (UI → any ledger is forbidden) and **A4** (UI is a read model; read models cannot re-author truth).

---

## C6 — Origin Label Is Immutable In Transit

A consumer may derive new values but must not relabel the origin of a pass-through value. A projection built from `Estimated` grind events cannot surface those values as `Actual`.

*Respects:* Matrix **§6 Labeling Requirements** and **A5** (no silent mixing).

---

# 8. Out of Scope

This ADR does NOT define:

* message broker integration (Kafka, etc.)
* multi-service distribution
* CDC / streaming pipelines
* cross-system event contracts

This remains DB-centric for pilot scope.

---

# 9. Follow-Up Work

1. Implement `finance_outbox` producer in PFT write path (same transaction as the PFT insert)
2. Add `origin_label` and `is_rated` columns to outbox schema
3. Build simple event poller (Supabase function / worker) with idempotent consumers
4. Refactor shift dashboard to react to events; preserve `origin_label` through to UI
5. Remove stale polling-based refresh logic
6. Audit existing DB triggers for cross-domain propagation; deprecate or route through outbox

---

# 10. Matrix Mapping (Summary)

| Outbox Decision / Constraint | Matrix Rule Enforced |
| ---------------------------- | -------------------- |
| D1 — Every PFT write emits    | A1, S1               |
| D2 — Atomic write             | A1 (no lost truth)   |
| D3 — Outbox is only propagation | S3, I2            |
| C1 — PFT-exclusive emission   | A1, A4               |
| C2 — No cross-domain writes   | I2                   |
| C3 — Consumers are projection-only | A2, A3, A5, I2  |
| C4 — No hidden triggers       | S3                   |
| C5 — No UI reconciliation     | A4, I2               |
| C6 — Origin label immutable   | §6, A5               |

If a future consumer design conflicts with any row above, the matrix wins and the consumer must be redesigned.

---

# 11. Closing Statement

The system previously relied on implicit propagation and side effects.

This ADR establishes:

> A single, explicit, reliable path for change to flow through the system — one that cannot silently violate the fact authority rules on its way out.

Financial events are:

* written once (Ingestion ADR)
* shaped consistently (Fact Model ADR)
* propagated atomically and respecting authority boundaries (this ADR)

Everything downstream becomes predictable — and auditable back to the matrix that governs it.

---

[1]: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html?utm_source=chatgpt.com "Transactional outbox pattern - AWS Prescriptive Guidance"
[2]: https://developer.confluent.io/courses/microservices/the-transactional-outbox-pattern/?utm_source=chatgpt.com "The Transactional Outbox Pattern"
[3]: https://medium.com/%40nustianrwp/the-transactional-outbox-pattern-a-rigorous-examination-for-distributed-systems-engineers-9c189836f470?utm_source=chatgpt.com "The Transactional Outbox Pattern: A Rigorous Examination ..."

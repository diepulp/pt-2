---
id: ADR-054
title: Financial Event Propagation and Surface Contract
status: Accepted
date: 2026-04-23
owner: Architecture Review
decision_scope: Outbox propagation, delivery guarantees, and mandatory surface rendering semantics
triggered_by: docs/issues/gaps/financial-data-distribution-standard/decisions/DECISION-CONSOLIDATION.md
supersedes:
  - docs/issues/gaps/financial-data-distribution-standard/decisions/interim/ADR-FINANCIAL-EVENT-OUTBOX.md
related:
  - ADR-052
  - ADR-053
  - ADR-055
  - docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md
canonicalized_from: docs/issues/gaps/financial-data-distribution-standard/decisions/ADR-FINANCIAL-EVENT-PROPAGATION.md
frozen_snapshot_date: 2026-04-23
---

# ADR-054: Financial Event Propagation and Surface Contract

# 1. Context

With two fact classes (Ledger, Operational) and a hard scope boundary (no reconciliation), propagation becomes the place where semantic mistakes happen:

* a projection reaches back into PFT and invents a total
* a consumer relabels an `Observed` grind value as `Actual`
* a dashboard blends both classes into a single unlabeled number
* a UI recomputes "drop" from partial data and presents it as settled

The failure mode is **semantic, not computational**. The numbers are right. The labels are wrong. This ADR fixes the propagation path and the surface contract so labels cannot be lost.

Outbox pattern mechanics (transactional atomicity, at-least-once delivery, idempotent consumers) are preserved from the earlier Outbox draft. What changes is the emission contract — now dual-class — and the explicit Surface Rendering Contract (D6).

---

# 2. Decision

## D1 — Outbox As Sole Propagation Path

Every authored financial event — Ledger **or** Operational — MUST produce a corresponding row in `finance_outbox` within the **same database transaction** as the authoring write.

* no lost events
* no phantom events
* no side-channel propagation (triggers, polling, UI recompute)

This is the transactional outbox pattern applied uniformly across both fact classes.

---

## D2 — Atomic Write Rule

Authoring write + outbox insert MUST succeed or fail together. If the outbox insert fails, the authoring write rolls back.

**"Same transaction" is literal, not logical.** Both writes MUST occur inside a single database transaction — one `BEGIN…COMMIT` boundary, one `pg_current_xact_id()`. The following do **not** satisfy this rule:

* two separate RPCs coordinated by retry logic
* authoring row committed, outbox row written by a background job ("eventual outbox")
* authoring row committed, outbox row written by a trigger that fires post-commit
* any pattern described as "logically atomic," "atomic in spirit," or "best-effort consistent"

Acceptable forms:

* single RPC that performs both inserts inside one transaction
* authoring RPC that inserts authoring row, then outbox row, before `COMMIT`
* `BEFORE INSERT` or `AFTER INSERT` trigger that inserts the outbox row — triggers fire inside the same transaction as the statement that fired them, which satisfies the rule

Applies symmetrically to:

* PFT writes (Class A / Ledger)
* Grind authoring writes (Class B / Operational)

---

## D3 — At-Least-Once Delivery

The system guarantees every event is delivered at least once. Consumers MUST be idempotent.

Duplicate delivery is a normal operating condition, not a defect.

---

## D4 — Consumers Are Projection-Only

An outbox consumer may:

* update projections / read models
* update dashboard caches
* trigger notifications
* emit derived operational signals (labeled accordingly)

A consumer MUST NOT:

* write to PFT
* write to the grind authoring store
* write to `mtl_entry` as a financial settlement
* merge fact classes into a single unlabeled value

---

## D5 — Origin Label Is Immutable In Transit

A value's `origin_label` is set by the author and travels unchanged through every consumer, projection, API response, and UI render.

A projection built from `Estimated` grind events cannot surface those values as `Actual` or `Observed`. A derived aggregate built from mixed authorities MUST carry the **lowest** authority present by this hierarchy:

```
Actual  >  Observed  >  Estimated
```

* `Actual + Observed` → `Observed`
* `Actual + Estimated` → `Estimated`
* `Observed + Estimated` → `Estimated`
* `Actual + Observed + Estimated` → `Estimated`

**Compliance is parallel, not a rung on this ladder.** `Compliance` values MUST NOT be merged with any other authority into a single aggregate. A surface showing Compliance alongside other classes MUST render them in separate fields.

---

## D6 — No Hidden Triggers

Database triggers that perform cross-domain propagation outside the outbox must be removed or deprecated. The outbox is the only legitimate fan-out path.

---

## D7 — No UI-Driven Reconciliation

The UI MUST NOT recompute financial state against authoring stores to "fix" propagation gaps. Staleness is surfaced as staleness (completeness label), never patched by client-side inference.

This is the propagation-layer enforcement of ADR-053 D3 (no reconciliation).

---

# 3. Event Model

Each outbox row carries:

| Field | Purpose |
|-------|---------|
| `event_id` (UUID) | unique identifier, for idempotency |
| `event_type` | e.g. `buyin.recorded`, `grind.observed`, `cashout.recorded`, `adjustment.recorded` |
| `fact_class` | `ledger` \| `operational` (per ADR-052 D4). `observation` and `compliance` reserved for taxonomy; not authored in pilot. |
| `origin_label` | `actual` \| `estimated` \| `observed` \| `compliance`. Pilot-authored values: `actual` (ledger) and `estimated` (operational). |
| `table_id` | mandatory — table-first anchoring (D2 of fact-model ADR) |
| `player_id` | nullable — present for Class A, absent for Class B |
| `aggregate_id` | authoring row id (PFT row or grind row) |
| `payload` (JSON) | event-specific data |
| `created_at` | authored time |
| `processed_at` | nullable; set by consumer framework |

`fact_class` and `origin_label` are **mandatory** on every event. They are the load-bearing fields of this ADR. Omitting either is a schema-level violation.

---

# 4. Surface Rendering Contract (D6 enforcement)

Every financial value rendered at a system boundary — UI, API response, export, report — MUST declare three things:

### 4.1 Source

Which fact class produced this value.

* `Ledger` — derived from Class A (PFT) only
* `Operational` — derived from Class B (grind) only
* `Mixed` — derived from both classes (must render per §4.2 authority rule)

### 4.2 Authority

The authority of the value, carried from the originating `origin_label`. Four values, matching the Surface Rendering Contract taxonomy:

| Authority | Meaning | In-scope source (pilot) |
|-----------|---------|-------------------------|
| `Actual` | Authoritative, attributed ledger event | PFT (Class A) |
| `Estimated` | Unattributed operational estimate | Grind / TBT (Class B) |
| `Observed` | Physical observation (non-transactional) | `pit_cash_observation` (out of pilot authoring) |
| `Compliance` | Regulatory record | `mtl_entry` (parallel domain) |

Mixed-authority aggregates degrade per the hierarchy in D5 (`Actual > Observed > Estimated`). `Compliance` is parallel and never merged with the others.

A surface value MUST carry exactly one authority. "Unknown" is not an authority — if the authority cannot be determined, the surface MUST NOT render the value.

### 4.3 Completeness

Every financial surface value carries a completeness envelope:

```ts
completeness: {
  status: 'complete' | 'partial' | 'unknown'
  coverage?: number   // 0.0 – 1.0, present when computable
}
```

Semantics:

* `complete` — all expected inputs for the aggregation window are present
* `partial` — inputs are pending, missing, or stale; the surface SHOULD state which
* `unknown` — completeness cannot be determined (surface MUST say so, not guess)

`coverage` is an optional numeric refinement (e.g., `0.7` when 7 of 10 expected inputs are present). It is a *completeness* measure, not an *authority* measure, and never substitutes for `status`.

`status` is mandatory. `coverage` is omitted when not computable.

### 4.4 Rendering Requirements

* Labels are visible to the user, not just present in API metadata
* Labels cannot be collapsed or hidden by downstream styling
* A surface claiming an authoritative total is non-conformant (per ADR-053 D2)

---

# 5. Topology

```
Ledger author (PFT write) ─┐
                           ├─► finance_outbox ─► consumer ─► projection / dashboard / surface
Operational author (grind) ┘          │                              │
                                      │                              ▼
                                at-least-once,                  Surface Contract
                                idempotent,                     (source / authority / completeness)
                                origin_label immutable
```

---

# 6. Responsibilities

## Authoring side

* writes the authoring row
* inserts the outbox event in the same transaction
* sets `fact_class` and `origin_label` at insert
* has no awareness of consumers

## Consumer side

* reads unprocessed outbox rows
* dispatches updates to projections, caches, notifications
* marks events processed
* respects idempotency
* preserves `origin_label` and `fact_class` unchanged

## Surface side

* reads projections
* renders source, authority, completeness alongside every value
* never recomputes against authoring stores
* never blends classes without degrading to `Observed`

---

# 7. Constraints

## C1 — Outbox Emission Is Author-Exclusive

Only a committed authoring write may emit an outbox event. Forbidden emissions:

* from projections or read models
* from `mtl_entry` (parallel compliance ledger)
* from UI writes
* from hidden triggers

## C2 — No Direct Cross-Domain Writes

No service may update another domain's authoritative store directly. All propagation flows through the outbox.

## C3 — Consumers Never Author

Consumers may produce derived values labeled accordingly. They MUST NOT author Ledger or Operational rows.

## C4 — Origin Label Degradation Rule

When an aggregate mixes authorities, the surface authority is the lowest present, by the hierarchy:

```
Actual  >  Observed  >  Estimated
```

Upgrading is never permitted. `Compliance` is parallel and MUST NOT be merged with any other authority in a single aggregate — render separately.

## C5 — Completeness Cannot Be Omitted

A surface that cannot establish completeness MUST render `Unknown`, never silently assume `Complete`.

---

# 8. Consequences

## Positive

* Eliminates stale-dashboard class of bugs
* Decouples authoring from consumption
* Surfaces cannot silently mislabel authority
* Provides an audit trail of all emitted events
* Prevents dual-write inconsistencies across both fact classes
* Enables a future external reconciliation layer to consume without the system performing reconciliation itself

## Trade-offs

* Introduces eventual consistency (milliseconds–seconds delay)
* Requires idempotent consumers
* Adds operational component (event processor)
* UI work: completeness and authority labels must be first-class in design

---

# 9. Out of Scope

* Message broker integration (Kafka, NATS, etc.) — DB-centric outbox for pilot
* Multi-service distribution
* CDC / streaming pipelines
* Cross-system event contracts
* MTL ↔ PFT bridging (compliance parallel domain)

---

# 10. Mapping to Consolidation

| Consolidation Decision | Enforced By |
|------------------------|-------------|
| D6 — Surface truthfulness | §4 Surface Rendering Contract, D5, C4, C5 |
| D3 — System does not compute financial truth | D7, §4.2 Authority, C4 (no upgrade) |
| D5 — No reconciliation | D7, consumer-projection-only (D4) |
| D1 — Dual-layer model | Event model carries `fact_class`, dual-author atomic outbox |
| D2 — Table-first anchoring | `table_id` mandatory on every event |
| D4 — TBT reclassification | Grind authors directly to outbox with `origin_label = observed`; rated flows as ledger projection |

---

# 11. Follow-Up Work

1. Implement `finance_outbox` producer for PFT write path (transaction-coupled)
2. Implement `finance_outbox` producer for grind authoring path (transaction-coupled)
3. Build event consumer with idempotency and origin-label preservation
4. Refactor dashboard to react to events; preserve labels through to render
5. Audit existing DB triggers for cross-domain propagation; deprecate or route through outbox
6. Define Surface Rendering Contract components (UI kit) for source / authority / completeness labels
7. Remove polling-based refresh logic that recomputes against authoring stores

---

# 12. Closing Statement

The system previously leaked authority at propagation time — observed values arrived at the UI looking actual, partial aggregates looked complete, and reconciliation crept in through recomputation.

This ADR closes those leaks:

> Events carry their authority.
> Consumers cannot change it.
> Surfaces must render it.

Propagation is not a side effect. It is the place semantics either survive or die. This ADR keeps them alive end-to-end.

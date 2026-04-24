# ADR-XXX — Financial Event Ingestion Unification (Pilot)

---

status: Draft for review
date: 2026-04-23
scope: Pilot (PT-2)
constrained_by: FACT-AUTHORITY-MATRIX-FIN-DOMAIN (authoritative reference layer)
supersedes: implicit dual-write behavior between PFT and TBT
------------------------------------------------------------

# 1. Context

System-wide financial provenance tracing revealed that **buy-in events are authored through two independent write paths**:

* Canonical path: `player_financial_transaction` (PFT)
* Secondary path: `table_buyin_telemetry` (TBT)

This results in:

* split-brain financial totals
* irreconcilable projections (rated vs grind)
* inability to reconstruct full financial state from a single ledger

The root issue is not projection contamination—it is **dual-write ingestion into separate stores**, a known failure mode in distributed systems (“dual-write problem”) ([Scott Logic][1])

This ADR operates under the constraints established by the **FACT AUTHORITY MATRIX**, which defines:

* which fact types exist
* which domain owns each fact
* what each fact is (and is not) authoritative for
* forbidden relationships between fact types

This ADR does not redefine those rules. It enforces them at the ingestion boundary.

---

# 2. Decision

Each decision below enforces a specific matrix rule. The matrix is the authority; these decisions are its implementation at the write path.

## D1 — Single Financial Ingestion Path

> All financial events MUST be written to `player_financial_transaction` (PFT)

There are no exceptions.

*Enforces:* Matrix **A1 — Single Source of Financial Truth**.

---

## D2 — Reclassification of TBT

> `table_buyin_telemetry` is NOT a source of truth

It is reclassified as:

> **Derived projection of buy-in events**

*Enforces:* Matrix **A4 — Projections Are Non-Authoritative**, and Matrix §7 (TBT Reclassification).

---

## D3 — Grind Buy-ins

> Grind buy-ins are financial transactions

They MUST be written to PFT with classification:

* `is_rated = false`
* `txn_type = 'buyin'`

*Enforces:* Matrix **A2 — Operational Facts Are Real but Non-Authoritative**. Grind money movement is real and must reach the ledger; it is distinguished by attribute (`is_rated`), not by storage.

---

## D4 — Elimination of Secondary Write Path

Direct writes to `table_buyin_telemetry` are **forbidden**

All existing flows must be redirected to:

```
rpc_create_financial_txn(...)
```

*Enforces:* Matrix **I2 Forbidden Relationships** (Grind → PFT, Projection → PFT). The ingestion path closes every non-PFT write surface for ledger-class facts.

---

## D5 — Projection Rule

TBT must be rebuilt as:

> A projection derived exclusively from PFT

No independent writes. No hybrid state.

*Enforces:* Matrix **A5 — No Silent Mixing** and **I1 Allowed Relationships** (PFT → Projection only).

---

## D6 — Out-of-Scope Facts Remain Out-of-Scope

This ADR applies only to **ledger-class** financial facts (PFT, per matrix row 1). It does NOT reroute:

* Compliance facts (`mtl_entry`) — owned by Compliance, parallel ledger
* Cash Observation facts (`pit_cash_observation`) — observational, not transactional
* Derived Projections — read-model only

*Enforces:* Matrix **A3 — Compliance Is Parallel, Not Hierarchical** and preserves the domain separation invariant **S3**.

---

# 3. Architectural Alignment

This decision aligns the system with established financial architecture patterns:

---

## 3.1 Event-Sourced Ledger Model

* All state changes recorded as immutable events
* Full audit and replay capability
* Ledger becomes single source of truth ([Medium][2])

---

## 3.2 CQRS Discipline

* Write model: PFT
* Read model: TBT

Strict rule:

> Read models must not accept writes ([akka.io][3])

---

## 3.3 Elimination of Dual-Write Problem

The current system violates consistency guarantees:

* writing to multiple stores independently
* no atomicity between them

This ADR removes that class of failure entirely ([Scott Logic][1])

---

# 4. Target Topology

## BEFORE (current)

```
RATED:
PFT → projection → TBT

GRIND:
TBT ← direct write   ❌
```

---

## AFTER (target)

```
RATED:
PFT → projection → TBT

GRIND:
PFT → projection → TBT   ✅
```

---

## Result

> Single financial event stream
> Multiple projections

---

# 5. Required Changes

## 5.1 Write Path

* Redirect all grind buy-in writes to PFT
* Remove all direct insert/update logic targeting TBT

---

## 5.2 Schema Adjustment (minimal)

PFT must support:

* `is_rated BOOLEAN`
* `source ENUM (pit | cage | manual | system)`
* optional `buyin_context`

No new tables required

---

## 5.3 Projection Rewrite

TBT becomes:

```
SELECT ...
FROM player_financial_transaction
WHERE txn_type = 'buyin'
```

Grouped by:

* rated vs unrated
* table
* session

---

## 5.4 Data Migration

* Backfill TBT (GRIND) rows into PFT
* Mark as `is_rated = false`
* Validate totals

---

# 6. Consequences

## Positive

* Single financial truth restored
* Deterministic reconstruction possible
* Shift dashboard consistency improves immediately
* Enables proper event propagation layer

---

## Negative

* Requires migration of existing TBT data - (NO BACKFILL NEEDED, DEV NOT IN PRODUCTION)
* Temporary instability during transition - (NO BACKFILL NEEDED, DEV NOT IN PRODUCTION)
* Forces correction of downstream assumptions

---

# 7. Out of Scope

This ADR does NOT define:

* event outbox implementation
* projection rebuild pipeline
* reconciliation workflows
* MTL ↔ PFT bridging

These will be addressed in subsequent ADRs.

---

# 8. Follow-Up ADRs

1. **Financial Event Outbox (Propagation Backbone)**
2. **Projection Standard (CQRS Enforcement)**
3. **Financial vs Operational View Separation**

---

# 9. Non-Conformant Patterns (to eliminate)

Each pattern below violates a matrix rule. This list is exhaustive for ingestion-layer violations.

* Writing financial events outside PFT — violates **A1**
* Treating projections as authoritative — violates **A4**
* Mixing rated/unrated via separate storage — violates **A5**
* Recomputing financial truth in UI — violates **A1** and **I2** (UI → ledger forbidden)
* Writing grind activity to TBT instead of PFT — violates **A1, A2, I2**
* Using operational or compliance data to override PFT totals — violates **A3, A5**

---

# 10. Closing Statement

The system previously treated projections as writable surfaces.

This ADR restores the invariant:

> Financial events are authored once, in one place.

Everything else is derived.

---

[1]: https://blog.scottlogic.com/2025/09/08/solving-data-consistency-in-distributed-systems-with-the-transactional-outbox.html?utm_source=chatgpt.com "Solving Data Consistency in Distributed Systems with the ..."
[2]: https://medium.com/%40ichsan.said/using-event-sourcing-transactional-outbox-pattern-in-event-driven-architecture-pros-cons-56dada9a4301?utm_source=chatgpt.com "Using Event Sourcing & Transactional Outbox Pattern in ..."
[3]: https://akka.io/blog/cloud-native-app-design-techniques-cqrs-event-sourcing-messaging?utm_source=chatgpt.com "Part 3 – messages, CQRS, and event sourcing"

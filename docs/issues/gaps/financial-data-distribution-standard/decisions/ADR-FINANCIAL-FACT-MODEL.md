# ADR-XXX — Financial Fact Model (Dual-Layer)

---

status: Accepted — Frozen 2026-04-23 (decision-only; supersede via new ADR, do not patch)
date: 2026-04-23
frozen_date: 2026-04-23
scope: Pilot (PT-2)
source: DECISION-CONSOLIDATION.md — D1, D2, D4
supersedes:
- ADR-FINANCIAL-FACT-MODEL-DRAFT.md
- ADR-FINANCIAL-EVENT-INJESTION-UNIFICATION.md
frozen_with:
- ADR-FINANCIAL-SYSTEM-SCOPE.md
- ADR-FINANCIAL-EVENT-PROPAGATION.md
- ../actions/SURFACE-RENDERING-CONTRACT.md
purpose: Define the two classes of financial fact the system recognizes and the anchoring rule common to both.

---

# 1. Context

Simulation and provenance tracing surfaced three observations that invalidate a single-ledger model:

* player attribution is not always possible at the moment of a financial event
* grind (unrated buy-ins) is financially real but unattributed
* forcing all events into PFT contaminates ledger semantics and produces false attribution

Earlier drafts proposed absorbing grind into PFT via an `is_rated` attribute. DECISION-CONSOLIDATION rejected that direction. This ADR records the replacement model.

---

# 2. Decision

## D1 — Two In-Scope Fact Classes (Pilot)

The system recognizes **two distinct classes of financial fact in pilot scope**:

### Class A — Ledger Financial Fact

* stored in `player_financial_transaction` (PFT)
* player-attributed
* auditable
* append-only
* authority label: **Actual**

### Class B — Operational Financial Fact

* grind (unrated buy-ins) and equivalent table-level money movement
* table-anchored, player attribution absent by construction
* non-authoritative
* authority label: **Estimated**

The two classes are **not merged** and **not derived from one another**. They coexist.

### Out-of-scope classes (taxonomy-only, no pilot authoring)

For completeness of the authority taxonomy used across surfaces and events:

* **Physical cash observation** (`pit_cash_observation`) → authority label: **Observed** — non-transactional physical count; not authored in pilot.
* **Compliance fact** (`mtl_entry`) → authority label: **Compliance** — parallel regulatory domain owned outside this ADR set.

These classes exist in the full taxonomy so downstream surfaces can label values consistently, but they are not authored, propagated, or governed by this ADR.

---

## D2 — Table-First Anchoring

Every financial event — Ledger or Operational — is:

> anchored to a **table**, optionally attributed to a **player**

Consequences:

* `table_id` is mandatory on every row in either class
* `player_id` is mandatory for Class A, nullable for Class B
* projections are table-centric; player roll-ups are a secondary aggregation

This removes the structural incentive that produced the TBT shadow system (a player-first schema could not express player-absent events, so a second store appeared).

---

## D3 — TBT Reclassification

`table_buyin_telemetry` splits into two conceptually distinct responsibilities:

### Grind (Class B, authoring store)

* **primary input** — not derived from anything
* authoritative for its own existence as an *observation*
* non-authoritative for ledger totals
* dual-write from PFT to this store is forbidden

### Rated (projection over Class A)

* derived exclusively from PFT
* read-only
* may share physical tables/views with grind for operational ergonomics **only if** each row declares its class unambiguously

If the two cannot share storage without ambiguity, they MUST be split. Default is split.

---

## D4 — Class Discriminator

Every row and every emitted event carries two explicit discriminators:

```
fact_class:   'ledger' | 'operational'
              // 'observation' and 'compliance' exist in the taxonomy
              // but are not authored in pilot scope (see D1)

origin_label: 'actual' | 'estimated' | 'observed' | 'compliance'
              // authored values in pilot: 'actual' (Class A), 'estimated' (Class B)
              // reserved values: 'observed', 'compliance'
```

Mapping of in-scope classes to labels:

| fact_class | origin_label |
|-----------|-------------|
| ledger | actual |
| operational | estimated |

Inference is forbidden. Consumers MUST read the discriminator, never guess.

---

# 3. Row-Level Invariants

### R1 — Append-Only (Class A)

Class A rows are never updated or deleted. Corrections are new rows (`txn_type = 'adjustment'`) referencing the original.

### R2 — Observation-Only (Class B)

Class B rows represent an observation at a table at a time. Corrections are new observations, not mutations.

### R3 — No Cross-Class Derivation

A Class B row is never produced as a projection of a Class A row, and a Class A row is never produced as a projection of a Class B row. Each class is authored independently.

### R4 — Immutable Classification

`fact_class` and `origin_label` are set at insert and never change. Reclassification is a new row in the target class.

### R5 — Attribution Is Whole or Absent

Class A has a full attribution chain (player, visit, session). Class B has none. Partial attribution is rejected.

---

# 4. Rejected Alternatives

### ❌ Single unified ledger (PFT absorbs grind via `is_rated`)

Rejected: violates attribution constraints, contaminates ledger semantics, breaks compliance alignment. This was the posture of the earlier ingestion-unification and fact-model drafts.

### ❌ TBT as ledger

Rejected: duplicates financial truth, creates split-brain, lacks auditability.

### ❌ Player-first anchoring with table as optional

Rejected: produced the TBT shadow system; table context is universal, player context is conditional.

---

# 5. Open Questions (deferred)

* Should PFT schema expand to express table-only *informational* rows, or does Class B remain in a separate authoring store?
* Should grind remain fully separate, or partially normalized under a shared parent table with a discriminator column?

These are schema-shape questions. They do not change the two-class model; they change where Class B physically lives. They are deferred to a follow-up ADR after implementation feedback.

---

# 6. Consequences

## Positive

* No false attribution
* Ledger semantics remain clean and auditable
* Grind becomes first-class and observable instead of hidden behind dual-write
* Table-first anchoring unifies projections

## Trade-offs

* Two authoring paths to maintain
* Downstream consumers must handle both classes explicitly
* UI must render authority labels (see propagation/surface ADR)

---

# 7. Out of Scope

* Event propagation mechanics (see ADR-FINANCIAL-EVENT-PROPAGATION)
* Surface rendering contract (see ADR-FINANCIAL-EVENT-PROPAGATION §Surface)
* Reconciliation workflows (see ADR-FINANCIAL-SYSTEM-SCOPE)
* Compliance fact shape (parallel domain, out of pilot scope)

---

# 8. Closing Statement

The system has two financial truths, not one.

> One is recorded. The other is observed.
> Neither derives from the other.
> Both anchor to the table.

Everything downstream is built on that distinction.

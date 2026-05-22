# ADR-XXX — Financial Fact Model (Pilot Scope)

---

status: Draft for review
date: 2026-04-23
scope: Pilot (PT-2)
simplified_by: FACT-AUTHORITY-MATRIX-FIN-DOMAIN
depends_on: ADR — Financial Event Ingestion Unification
purpose: Define the minimal semantic model for a single PFT fact
---

# 1. Context

Ingestion unification ensures all financial events land in `player_financial_transaction` (PFT). The FACT AUTHORITY MATRIX already defines:

* which fact types exist in the system (matrix §3)
* which domain owns each (matrix §3)
* what each is authoritative for and forbidden to be used for (matrix §3–§5)
* allowed and forbidden relationships (matrix §5)
* labeling requirements (matrix §6)
* system invariants S1–S4 (matrix §8)

Those rules are not restated here.

What remains is a narrower question the matrix does not answer:

> Given a single event landing in PFT, what is its internal shape and which invariants does **that row** uphold?

This ADR answers that, and nothing else.

---

# 2. Decision

## D1 — Scope of "Financial Fact"

> A financial fact is a single append-only row in `player_financial_transaction` (PFT) that affects player cash position.

This is the **Ledger Financial Fact** row of the matrix. All other matrix rows (operational, compliance, observation, projection) are out of scope for this ADR.

---

## D2 — Fact Type Enumeration

Within PFT, `txn_type` is constrained to:

* `buyin`
* `cashout`
* `marker`
* `adjustment`

No additional `txn_type` values may be introduced without an ADR amending this list.

---

## D3 — Rated vs Unrated Is an Attribute

> Rated and unrated are the same fact class.

They differ by a single attribute:

```ts
is_rated: boolean
```

They MUST NOT be separated into different tables, different write paths, or different fact classes. (The matrix already forbids separate storage under **A5**; this ADR names the attribute.)

---

## D4 — Minimum Required Attributes

Every PFT row must carry enough information to answer four questions without joining other tables:

| Question                        | Column              |
| ------------------------------- | ------------------- |
| What kind of fact?              | `txn_type`          |
| Rated or unrated?               | `is_rated`          |
| Where did it originate?         | `source` (enum)     |
| How much and which direction?   | `amount`, `direction` |

`source` enumerates: `pit | cage | manual | system`.

This supports matrix **§6 Labeling Requirements** at the row level: every projection derived from PFT can declare its origin without inferring it.

---

# 3. Row-Level Invariants

The matrix defines system-wide invariants (S1–S4). This ADR defines invariants that hold on a single PFT row:

### R1 — Append-Only

PFT rows are never updated or deleted. Corrections are new rows (`txn_type = 'adjustment'`) that reference the original.

### R2 — Self-Describing

A single row, read in isolation, must be interpretable. `direction` alone is never sufficient to infer semantics — `txn_type` is mandatory.

### R3 — Attribution-Complete or Attribution-Absent

A PFT row either has a full attribution chain (player, visit, session) or it is flagged as unattributed grind (`is_rated = false`, attribution nullable). There is no partial attribution.

### R4 — Immutable Classification

`txn_type`, `is_rated`, and `source` are set at insert and never change. Reclassification is a new row, not an update.

---

# 4. Relationship to the Matrix

This ADR is a **row-shape contract** sitting under the matrix.

| Matrix concern                     | Authority                 |
| ---------------------------------- | ------------------------- |
| Which fact types exist in system   | Matrix §3                 |
| Domain ownership                   | Matrix §3                 |
| Allowed / forbidden relationships  | Matrix §5                 |
| Labeling requirements (UI/API)     | Matrix §6                 |
| System invariants S1–S4            | Matrix §8                 |
| **Shape of a single PFT row**      | **This ADR**              |
| **Column-level enums and attrs**   | **This ADR**              |
| **Row-level invariants R1–R4**     | **This ADR**              |

If this ADR and the matrix disagree, the matrix wins.

---

# 5. Non-Conformant Patterns (Row-Level)

Enforced at the PFT write path:

* Inserting a row without `txn_type` → rejected
* Updating an existing PFT row (any column) → forbidden; use adjustment
* Inferring rated/unrated from any column other than `is_rated` → forbidden
* Introducing a new `txn_type` without ADR amendment → rejected at schema level

Matrix-level violations (e.g. writing to TBT, UI mutating ledger) are owned by the Ingestion ADR, not this one.

---

# 6. Consequences

## Positive

* One row = one complete, self-describing fact
* No hidden joins required to classify a transaction
* Adjustment-as-new-row preserves full history
* Aligns PFT schema directly with matrix labeling requirements

## Trade-offs

* Requires `source` column addition (schema change)
* Requires `is_rated` enforcement at write path
* Adjustment workflow is explicit (new row), not in-place edit

---

# 7. Out of Scope

* Event propagation (see Outbox ADR)
* Projection architecture / read-model shapes
* Compliance, observation, or projection row shapes (owned by their respective matrix rows)
* Reconciliation workflows

---

# 8. Closing Statement

The matrix defines **what facts exist and how they relate**.
The ingestion ADR defines **how they enter the system**.
This ADR defines **the shape of a single ledger fact**.

> A PFT row, read alone, must tell the whole truth about itself.

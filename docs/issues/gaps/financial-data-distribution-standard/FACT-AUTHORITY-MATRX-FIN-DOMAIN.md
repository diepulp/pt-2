    # FACT AUTHORITY MATRIX — Financial Domain (PT-2 Pilot)

---

status: Draft (authoritative reference layer)
date: 2026-04-23
purpose: Define authority, scope, and interaction rules for all financial fact types
scope: Pit operations (table-centric), excluding cage workflows
---------------------------------------------------------------

# 1. Purpose

This matrix defines:

* what types of financial facts exist
* which domain owns each fact
* what each fact is authoritative for
* what each fact MUST NOT be used for

This prevents:

* semantic drift
* silent data mixing
* projection-level truth mutation
* reintroduction of shadow ledgers

---

# 2. Core Principle

> Not all financial data is equal.
> Each fact type has **bounded authority** and **explicit limits**.

Financial systems must distinguish:

* **what actually happened (ledger truth)**
* **what was observed (operational truth)**

These must never be silently merged.

---

# 3. Fact Authority Matrix

| Fact Type                              | Storage                              | Domain Owner | Authority For                                                | NOT Authoritative For                                   | Notes                                      |
| -------------------------------------- | ------------------------------------ | ------------ | ------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------ |
| **Ledger Financial Fact**              | `player_financial_transaction` (PFT) | Finance      | Player cash position, settlement, audit, reconciliation      | Estimated drop, table performance (without aggregation) | Canonical source of financial truth        |
| **Operational Financial Fact (Grind)** | `table_buyin_telemetry` (GRIND only) | TableContext | Table-level flow, estimated drop, variance, operational KPIs | Player balances, compliance, settlement                 | Represents unattributed financial activity |
| **Projected Financial Fact (Rated)**   | `table_buyin_telemetry` (derived)    | TableContext | Table-level aggregation of rated play                        | Source-of-truth financial record                        | Must be derived from PFT only              |
| **Compliance Fact**                    | `mtl_entry`                          | Compliance   | Regulatory reporting, thresholds, audit logs                 | Financial settlement, player balance                    | Parallel ledger, not financial truth       |
| **Cash Observation Fact**              | `pit_cash_observation`               | TableContext | Reconciliation, discrepancy detection                        | Financial truth, settlement totals                      | Observational, not transactional           |
| **Derived Projection**                 | Views / dashboards                   | Read Model   | UI display, analytics                                        | Source-of-truth for anything                            | Must declare upstream sources              |

---

# 4. Authority Rules (Hard Constraints)

## A1 — Single Source of Financial Truth

> Only PFT defines authoritative financial ledger state.

No other structure may:

* override
* approximate
* replace

ledger truth.

---

## A2 — Operational Facts Are Real but Non-Authoritative

> Grind and observations represent real money movement but are not settlement truth.

They may:

* inform
* estimate
* signal

They may NOT:

* settle
* reconcile ledger directly
* define player balances

---

## A3 — Compliance Is Parallel, Not Hierarchical

> Compliance facts do not derive authority from financial facts.

And vice versa.

They intersect, but neither owns the other.

---

## A4 — Projections Are Non-Authoritative

> Any aggregated or derived value is disposable.

If a projection disagrees with PFT:

→ projection is wrong
→ never the ledger

---

## A5 — No Silent Mixing

> Different fact types must never be merged without explicit labeling.

Forbidden:

* ledger + grind = “total”
* ledger + observation = “cashout”
* compliance + financial = unified number

---

# 5. Interaction Rules

## I1 — Allowed Relationships

| From        | To         | Allowed | Purpose               |
| ----------- | ---------- | ------- | --------------------- |
| PFT         | Projection | ✅       | aggregation           |
| PFT         | MTL        | ✅       | compliance derivation |
| Grind       | Projection | ✅       | operational metrics   |
| Observation | Projection | ✅       | reconciliation views  |

---

## I2 — Forbidden Relationships

| From        | To         | Forbidden | Reason                          |
| ----------- | ---------- | --------- | ------------------------------- |
| Grind       | PFT        | ❌         | would contaminate ledger        |
| Observation | PFT        | ❌         | not transactional               |
| Projection  | PFT        | ❌         | derived cannot write truth      |
| UI          | Any ledger | ❌         | no client-driven truth mutation |

---

# 6. Labeling Requirements (UI / API)

Every surfaced value must declare its origin:

| Label          | Meaning                           |
| -------------- | --------------------------------- |
| **Actual**     | Derived from PFT                  |
| **Estimated**  | Derived from Grind                |
| **Observed**   | Derived from pit_cash_observation |
| **Compliance** | Derived from MTL                  |

Unlabeled financial values are **non-conformant**.

---

# 7. TBT Reclassification (Final Position)

`table_buyin_telemetry` is split conceptually:

* **Rated portion** → projection (derived from PFT)
* **Grind portion** → operational fact (primary input, not ledger)

It MUST NOT:

* act as a ledger
* accept financial writes outside defined scope
* redefine financial truth

---

# 8. System Invariants

The system must always satisfy:

### S1 — Ledger Reconstructability

All financial totals must be derivable from PFT alone.

### S2 — Operational Visibility

All table activity must be observable, even without attribution.

### S3 — Domain Separation

Finance, Compliance, and TableContext must not collapse into one model.

### S4 — Explicit Semantics

Every number must declare what it represents and where it came from.

---

# 9. Consequences

## Positive

* Eliminates split-brain at semantic level
* Preserves both financial accuracy and operational visibility
* Aligns with real-world casino workflows
* Prevents future shadow ledgers

## Trade-offs

* Requires strict labeling discipline
* Requires projection refactoring
* Introduces dual-truth awareness (intentional, not accidental)

---

# 10. Closing Statement

The system does not have a single “financial truth.”

It has:

* **authoritative truth (ledger)**
* **operational truth (observation)**

These must coexist—but never be confused.

> Architecture fails not when data is missing,
> but when different truths are silently treated as the same.

---

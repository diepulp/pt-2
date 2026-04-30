# Fact Registry — Financial Domain (PT-2 Pilot)

Full authority matrix for all financial fact types. Use this when you need to determine
what a given fact type is authoritative for, what it must never be used for, and how
fact types may or may not relate to each other.

---

## Fact Authority Matrix

| Fact Type | Storage | Domain Owner | Authoritative For | NOT Authoritative For |
|---|---|---|---|---|
| **Ledger Financial Fact (Class A)** | `player_financial_transaction` (PFT) | Finance | Player cash position, settlement, audit, compliance derivation | Estimated drop, table KPIs (without aggregation), unattributed grind |
| **Operational Financial Fact / Grind (Class B)** | `table_buyin_telemetry` (grind partition) | TableContext | Table-level flow, estimated drop, variance, operational KPIs | Player balances, compliance, settlement, ledger totals |
| **Rated Projection** | `table_buyin_telemetry` (derived view) | TableContext | Table-level aggregation of rated play | Source-of-truth financial record — this is a projection, not a fact |
| **Compliance Fact** | `mtl_entry` | Compliance | Regulatory reporting, Title 31, thresholds, audit logs | Financial settlement, player balance, ledger truth |
| **Cash Observation** | `pit_cash_observation` | TableContext | Reconciliation signal, discrepancy detection, operational awareness | Financial truth, settlement totals, ledger balance |
| **Derived Projection** | Views / dashboards / DTOs | Read Model | UI display, analytics | Source-of-truth for anything |

---

## Canonical Fact Inventory

### Class A — Ledger Facts (authored via PFT RPCs)

| Fact ID | `txn_type` / notes | Write Boundary |
|---|---|---|
| `FACT-PFT-TXN-IN-PIT-CASH` | Cash buy-in at pit | `rpc_create_financial_txn` |
| `FACT-PFT-TXN-IN-PIT-CHIPS` | Chip buy-in at pit | `rpc_create_financial_txn` |
| `FACT-PFT-TXN-OUT-CAGE` | Cash-out at cage | `rpc_create_financial_txn` |
| `FACT-PFT-TXN-IN-CAGE-MARKER` | Marker / credit instrument | `rpc_create_financial_txn` |
| `FACT-PFT-ADJUSTMENT` | Correction, void-equivalent, reversal | `rpc_create_financial_adjustment` |

Corrections use `txn_type='adjustment'` referencing the original row. Direct PFT inserts outside seed/test are non-conformant.

### Class B — Operational Facts (Grind)

| Fact ID | Notes | Write Boundary |
|---|---|---|
| `FACT-PIT-CASH-OBSERVATION-ESTIMATE` | Unconfirmed table-level cash observation | `rpc_create_pit_cash_observation` |
| `FACT-PIT-CASH-OBSERVATION-CONFIRMED` | Confirmed table-level cash observation | `rpc_create_pit_cash_observation` |

Note: `pit_cash_observation` rows carry `origin_label='observed'` in the full taxonomy. In pilot they are not authored through the outbox path (GAP-F1 applies broadly).

### Compliance Facts (Parallel Domain)

| Fact ID | Notes | Write Boundary |
|---|---|---|
| `FACT-MTL-ENTRY` | Title 31 / MTL reportable event | `INSERT into mtl_entry` (RPC pending) |
| `FACT-MTL-AUDIT-NOTE` | Annotation / review record | `INSERT into mtl_audit_note` |

Compliance facts never merge with financial facts in a single aggregate. `Compliance` authority is parallel and must be rendered in a separate field when appearing alongside `Actual`, `Estimated`, or `Observed`.

### Loyalty Facts (Separate Domain)

| Fact ID | Status | Write Boundary |
|---|---|---|
| `FACT-LOYALTY-BASE-ACCRUAL` | Implemented | `rpc_accrue_on_close` |
| `FACT-LOYALTY-PROMOTION` | Implemented | `rpc_apply_promotion` |
| `FACT-LOYALTY-REDEMPTION` | Implemented (doc error FPT-001 was wrong) | Ratified RPC |

Loyalty facts are separate from financial truth unless an explicit conversion or redemption contract declares dual-fact participation.

### Explicitly Derived — Not Facts

These are projections. They may be consumed as read models but must never be treated as source-of-truth records:

- `visit_financial_summary` — derived projection over PFT
- `mtl_gaming_day_summary` — derived compliance projection
- `FACT-VISIT-FINANCIAL-SUMMARY` — derived only
- `FACT-MTL-PATRON-DAILY-TOTAL` — derived only
- `FACT-ESTIMATED-DROP` — derived only; must be labeled as Estimated + declared inputs

---

## Authority Rules (Hard Constraints)

### A1 — Single Source of Ledger Truth
Only PFT defines authoritative financial ledger state. No other structure may override, approximate, or replace ledger truth.

### A2 — Operational Facts Are Real but Non-Authoritative
Grind and cash observations represent real money movement but are not settlement truth. They may inform, estimate, and signal. They may NOT settle, reconcile ledger directly, or define player balances.

### A3 — Compliance Is Parallel, Not Hierarchical
Compliance facts do not derive authority from financial facts. MTL entries may overlap with financial concepts but are not financially canonical unless an explicit bridge contract declares dual-fact participation.

### A4 — Projections Are Non-Authoritative
Any aggregated or derived value is disposable. If a projection disagrees with PFT, the projection is wrong.

### A5 — No Silent Mixing
Different fact types must never be merged without explicit labeling. Forbidden patterns:
- Ledger + grind = "total"
- Ledger + observation = "cashout"
- Compliance + financial = unified number

---

## Interaction Rules

### Allowed

| From | To | Allowed | Purpose |
|---|---|---|---|
| PFT | Projection | ✅ | Aggregation for display |
| PFT | MTL | ✅ | Compliance derivation |
| Grind | Projection | ✅ | Operational metrics |
| Cash Observation | Projection | ✅ | Reconciliation views |

### Forbidden

| From | To | Forbidden | Reason |
|---|---|---|---|
| Grind | PFT | ❌ | Contaminates ledger |
| Cash Observation | PFT | ❌ | Not transactional |
| Projection | PFT | ❌ | Derived cannot write truth |
| UI | Any authoring store | ❌ | No client-driven truth mutation |
| MTL | PFT (without bridge contract) | ❌ | Compliance ≠ financial fact unless explicitly bridged |

---

## System Invariants

**S1 — Ledger Reconstructability:** All financial totals must be derivable from PFT alone.

**S2 — Operational Visibility:** All table activity must be observable, even without player attribution.

**S3 — Domain Separation:** Finance, Compliance, and TableContext must not collapse into one model.

**S4 — Explicit Semantics:** Every number must declare what it represents and where it came from.

---

## Authoritative Write Boundary Summary

| Domain | Canonical Table | Authorized RPCs |
|---|---|---|
| Financial Ledger | `player_financial_transaction` | `rpc_create_financial_txn`, `rpc_create_financial_adjustment` |
| Operational | `table_buyin_telemetry` (grind) | Grind authoring RPC (pending wire-up per GAP-F1) |
| Cash Observation | `pit_cash_observation` | `rpc_create_pit_cash_observation` |
| Compliance | `mtl_entry`, `mtl_audit_note` | Authenticated INSERT (RPC pending) |
| Loyalty | `loyalty_ledger` | `rpc_accrue_on_close`, `rpc_apply_promotion`, redemption RPC |

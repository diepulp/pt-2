# FINANCIAL-DATA-DISTRIBUTION-CONTRACT.md

---
title: Financial Data Distribution Contract
date: 2026-04-22
status: Draft v0.1
purpose: Canonical contract for how financial facts are authored, propagated, projected, and consumed in PT-2
scope: System-wide financial provenance and downstream distribution
authority: Proposed architectural standard pending ADR ratification
---

# 1. Purpose

This contract defines the authoritative rules for financial data distribution in PT-2.

It exists to eliminate split-brain behavior by declaring:

- which financial facts are canonical
- where each fact may be authored
- what downstream consumers may read
- what transformations are permitted
- what projections are derived only
- what telemetry must never masquerade as ledger truth

This contract is the governing boundary between:

- **financial ledger truth**
- **compliance truth**
- **operational telemetry**
- **derived projections**

---

# 2. Core Principle

Every financial number displayed in the system must answer:

> “Where did this number come from, exactly?”

If a displayed number cannot be traced to a declared fact and a declared write boundary, that number is **non-conformant**.

---

# 3. Domain Classes

## 3.1 Canonical Financial Ledger

Canonical financial ledger facts represent actual financial transactions or adjustments.

**Authoritative ledger:** `player_financial_transaction`

These facts are the only valid basis for:

- financial accountability
- financial totals
- financial reconciliation
- player visit cash-in / cash-out totals
- operator-facing financial truth

## 3.2 Canonical Compliance Ledger

Compliance facts represent reportable compliance events and compliance aggregations.

**Authoritative ledger:** `mtl_entry`

These facts are valid for:

- Title 31 / MTL compliance
- compliance review
- patron daily thresholds
- audit and annotation workflows

Compliance facts are **not automatically equivalent** to financial facts.

## 3.3 Operational Telemetry

Operational telemetry captures observed or estimated operational state.

**Authoritative table:** `pit_cash_observation`

Operational telemetry may inform:

- floor awareness
- operator estimates
- observed cash-out context
- unresolved walk-off estimates

Operational telemetry is **not financial truth** and must not be silently merged into canonical financial aggregates.

## 3.4 Loyalty Ledger

Loyalty facts represent points earned, promoted, redeemed, or adjusted.

**Authoritative ledger:** `loyalty_ledger`

These facts are separate from financial truth unless an explicit conversion or redemption contract states otherwise.

## 3.5 Derived Projections

Derived projections are read models, views, aggregates, or on-read calculations.

Examples include:

- `visit_financial_summary`
- `mtl_gaming_day_summary`
- shift metrics / estimated drop
- dashboard totals
- timeline renderings

Derived projections are **not facts** and must never be treated as source-of-truth records.

---

# 4. Canonical Fact Model

## 4.1 Financial Facts

The following are canonical financial facts:

- `FACT-PFT-TXN-IN-PIT-CASH`
- `FACT-PFT-TXN-IN-PIT-CHIPS`
- `FACT-PFT-TXN-OUT-CAGE`
- `FACT-PFT-TXN-IN-CAGE-MARKER`
- `FACT-PFT-ADJUSTMENT`

All of these facts are authored only through canonical PFT write boundaries.

## 4.2 Compliance Facts

The following are canonical compliance facts:

- `FACT-MTL-ENTRY`
- `FACT-MTL-AUDIT-NOTE`

## 4.3 Operational Telemetry Facts

The following are operational telemetry facts:

- `FACT-PIT-CASH-OBSERVATION-ESTIMATE`
- `FACT-PIT-CASH-OBSERVATION-CONFIRMED`

These are not canonical financial facts.

## 4.4 Loyalty Facts

The following are loyalty facts:

- `FACT-LOYALTY-BASE-ACCRUAL`
- `FACT-LOYALTY-PROMOTION`
- `FACT-LOYALTY-REDEMPTION` (pending verified write path)

## 4.5 Derived Only (Not Facts)

The following are explicitly classified as projections, not facts:

- `visit_financial_summary`
- `mtl_gaming_day_summary`
- `FACT-VISIT-FINANCIAL-SUMMARY`
- `FACT-MTL-PATRON-DAILY-TOTAL`
- `FACT-ESTIMATED-DROP`

These may be consumed only as derived views over declared facts.

---

# 5. Authoritative Write Boundaries

## 5.1 Financial Ledger Write Boundary

Canonical financial facts may only be authored by:

- `rpc_create_financial_txn`
- `rpc_create_financial_adjustment`

Direct inserts into `player_financial_transaction` are non-conformant outside seed/test contexts.

## 5.2 Compliance Write Boundary

Canonical compliance facts may only be authored by:

- authenticated `INSERT` into `mtl_entry`
- authenticated `INSERT` into `mtl_audit_note`

or future approved RPC equivalents if the architecture changes.

## 5.3 Operational Telemetry Write Boundary

Operational telemetry facts may only be authored by:

- `rpc_create_pit_cash_observation`

## 5.4 Loyalty Write Boundary

Canonical loyalty facts may only be authored by:

- `rpc_accrue_on_close`
- `rpc_apply_promotion`
- future redemption RPC once explicitly ratified

---

# 6. Fact Ownership Rules

## Rule F1 — One authoritative write boundary per fact

A fact must have exactly one authoritative write boundary.

No UI surface, service, or adjacent domain may create a second unofficial path for the same fact.

## Rule F2 — Surface actions do not define facts

A button click, modal flow, or operator mental model does not define fact identity.

Fact identity is defined by:

- canonical write boundary
- authoritative ledger/table
- semantic classification

## Rule F3 — Derived projections are never authoritative

Views, aggregates, joins, and dashboard read models must never be treated as the authoritative source of a number.

## Rule F4 — Operational telemetry is not financial ledger truth

`pit_cash_observation` is operational telemetry.

It must not be silently counted as canonical cash-out, visit total out, or canonical net position.

## Rule F5 — Compliance facts do not automatically become financial facts

MTL entries and MTL adjustments may overlap with financial concepts, but they are not financially canonical unless an explicit bridge contract declares dual-fact participation.

## Rule F6 — Financial adjustments remain ledger events

Corrections, void-like behavior, and reversals must be represented as new financial ledger events, not in-place edits.

Append-only financial provenance is mandatory.

---

# 7. Distribution Rules

## Rule D1 — Consumers subscribe to facts, not surfaces

Dashboards and downstream services must be defined in terms of facts consumed, not UI origin.

Example:
- shift dashboard consumes declared financial and operational facts
- not “rating-slip modal save”
- not “MTL adjust button”

## Rule D2 — Bridges must be explicit and registered

Any forward bridge, trigger, view filter, or transformation that changes downstream visibility must be declared in the registry/spec.

This includes:

- direction filters
- required anchors such as `rating_slip_id`
- `NULL` exclusions
- amount-kind filters
- deduplication rules
- gaming-day derivation rules

No hidden bridge rule may remain only inside a migration comment or SQL body.

## Rule D3 — Same underlying write may emit multiple facts only if each fact is independently declared

A single database write may support multiple downstream facts only if:

- each fact is explicitly named
- each derivation path is independently defined
- each consumer is told which fact it is reading

Implicit dual-membership is forbidden.

## Rule D4 — Distribution must preserve semantic context

Aggregations must not collapse distinct financial meanings into one unlabeled total.

Examples that must remain distinguishable unless intentionally normalized:

- pit cash buy-in
- cage cash-out
- marker issuance
- adjustments
- telemetry estimate
- telemetry confirmed

---

# 8. Projection Rules

## Rule P1 — Projection sources must be declared

Every projection must declare the facts it reads.

## Rule P2 — Projection outputs must be labeled as derived

Any API, DTO, or UI surface reading from a projection must make clear that the number is derived.

## Rule P3 — Projections may not silently mix ledger truth and telemetry

A projection must not combine:

- canonical financial ledger events
- operational telemetry

unless:
- the projection is explicitly classified as mixed
- each component remains separable
- the UI labels the output accordingly

## Rule P4 — Mixed projections require component transparency

If a projection contains both canonical and observational values, consumers must be able to retrieve each component separately.

## Rule P5 — Recomputed views must document freshness and consistency limits

On-read calculations such as estimated drop must declare:

- source facts
- freshness model
- realtime or polling behavior
- possible lag window

---

# 9. Consumer Rules

## Rule C1 — Operator-facing financial truth must come from canonical financial facts

Any number presented as:

- total in
- total out
- net cash position
- financial adjustment
- visit financial summary

must derive from canonical financial ledger facts only, unless explicitly labeled as estimate or mixed view.

## Rule C2 — Estimates must be labeled as estimates

If operational telemetry appears in the UI, it must be labeled as one of:

- estimate
- observed
- cage-confirmed observation
- unresolved

It must not appear as plain financial truth.

## Rule C3 — UI may not blend unsaved client state into canonical financial totals

Unsaved form state may be displayed separately, but must not be merged into canonical or server-derived financial totals.

## Rule C4 — Downstream consumers must not infer semantics from `direction` alone

`direction='in'` and `direction='out'` are insufficient for business meaning.

Consumers must preserve and respect:
- source
- tender type
- transaction kind
- reason code where relevant

---

# 10. Reconciliation Rules

## Rule R1 — PFT is authoritative for canonical financial reconciliation

When canonical financial totals are disputed, `player_financial_transaction` is the system-of-record.

## Rule R2 — MTL is authoritative for compliance reconciliation

When compliance totals are disputed, `mtl_entry` is the system-of-record.

## Rule R3 — Operational telemetry is observational only

When `pit_cash_observation` conflicts with PFT, telemetry does not override ledger truth.

It may:
- flag discrepancy
- support investigation
- drive operational awareness

It may not redefine the financial ledger.

## Rule R4 — Cross-ledger discrepancies require explicit reconciliation surfaces

If PFT, MTL, and telemetry disagree, the system must expose that disagreement rather than silently collapsing it.

---

# 11. Required Non-Conformance Corrections

The following current patterns are non-conformant under this contract:

1. Treating `visit_financial_summary` as authoritative financial truth
2. Silently UNIONing `pit_cash_observation` into canonical financial totals
3. Allowing UI net position to blend unsaved client state with server totals
4. Using `direction='in'` as a proxy for “buy-in” without preserving source/tender semantics
5. Leaving bridge predicates undocumented in registry/spec artifacts

---

# 12. Required Registry Shape

Each declared financial fact must include:

- **Fact ID**
- **Semantic definition**
- **Authoritative write boundary**
- **Authoritative ledger/table**
- **Allowed bridges**
- **Allowed projections**
- **Downstream consumers**
- **Explicit exclusions**
- **Verification method**
- **Freshness / invalidation model**

---

# 13. Conformance Checklist

A flow is conformant only if all are true:

- It writes through the declared authoritative boundary
- It creates or mutates a declared fact
- Any bridge behavior is explicit and documented
- Any projection reading it is labeled as derived
- Any UI rendering it preserves semantic meaning
- Any reconciliation dispute can be traced back to the authoritative ledger

---

# 14. Immediate Contract Decisions

The following decisions are hereby proposed for ratification:

## Decision A
`pit_cash_observation` is classified as **operational telemetry**, not canonical financial ledger truth.

## Decision B
`visit_financial_summary` is a **derived projection**, not a fact and not a canonical ledger surface.

## Decision C
MTL adjustments do not automatically participate in canonical rated-buyin or visit-financial facts unless an explicit bridge contract declares that behavior.

## Decision D
Operator-facing financial totals must be reconstructed from canonical financial facts, not mixed views.

## Decision E
Any mixed operational + financial surface must expose component breakdowns rather than a blended total.

---

# 15. Open Ratification Questions

1. Should any subset of MTL-originated adjustments emit financial facts as well as compliance facts?
2. Should cage-confirmed pit cash observations remain telemetry or become a separately declared reconciliation fact?
3. Should a finance outbox become mandatory for downstream financial event propagation?
4. How should marker issuance and other `direction='in'` non-buy-in events be separated in operator-facing totals?
5. What redemption path governs `FACT-LOYALTY-REDEMPTION`?

---

# 16. Standard Adoption Sequence

Recommended order:

1. Ratify this contract as an ADR
2. Update financial fact registry to conform to this model
3. Audit all financial projections against the contract
4. Mark non-conformant surfaces
5. Remediate the highest-risk violations
6. Add CI or audit gates for future conformance

---

# 17. Closing Statement

PT-2 cannot claim financial accountability unless its financial numbers are explainable, provenance-safe, and semantically bounded.

This contract exists to make financial truth explicit.

No further financial feature should ship without declaring:

- what fact it creates
- where that fact is authored
- how it propagates
- who consumes it
- and what it is forbidden to impersonate

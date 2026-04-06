# PT Cross-Surface Metric Provenance & Truth Governance Plan

## Purpose

This document establishes a unified plan for **cross-surface metric provenance and truth governance** in PT.

The scope is no longer limited to ADR-039 measurement surfaces. ADR-039 remains the catalyst, but the underlying concern is broader: PT increasingly presents **operational truth, derived business truth, and compliance-relevant truth** across multiple surfaces, and those values must be **definable, traceable, consistent, fresh by policy, and defensible**.

This plan exists to prevent the system from drifting into a state where:
- the app can display numbers,
- different surfaces compute the “same” number differently,
- freshness semantics vary silently,
- operators trust values that cannot be reconciled,
- compliance interpretations are rendered without provenance,
- implementation convenience outruns runtime truth governance.

This is a governance artifact for hardening PT’s data delivery and truth semantics as the application matures.

---

## Problem statement

PT has a strong structural core:
- disciplined service boundaries,
- bounded contexts aligned with implementation,
- mature security and RLS posture,
- first-class ingestion patterns for batch flows.

However, as measurement and dashboard surfaces expand, a new class of risk emerges:

**The risk is no longer only whether the system stores and mutates data correctly. The risk is whether the system can defend the truth it displays.**

That risk appears wherever a surface shows:
- aggregated values,
- derived values,
- time-windowed values,
- status interpretations,
- operational rollups,
- financial performance indicators,
- compliance indicators,
- exception or alert states.

A metric provenance framework is therefore needed across surfaces, not only for ADR-039.

---

## Primary objective

Establish a cross-surface governance model that ensures every truth-bearing value displayed in PT is classified, owned, sourced, computed intentionally, refreshed intentionally, and auditable.

---

## Guiding principle

This plan distinguishes between two very different states:

- **The app can display a number.**
- **The system can defend that number.**

PT should increasingly optimize for the second condition.

---

## Scope

This plan applies to truth-bearing values shown across PT surfaces, especially where values influence:

- operational decisions,
- staffing or table decisions,
- player management decisions,
- executive or financial interpretation,
- compliance review,
- auditability,
- exception handling,
- historical comparison or trend analysis.

### In scope surface families

- ADR-039 measurement surfaces
- shift dashboards
- pit/operational dashboards
- player dashboards and player summary views
- compliance dashboards and review surfaces
- executive and management summary views
- other surfaces that present derived or interpreted business truth

### Not every field is in scope

This framework is **not** meant to burden every raw UI field.

It should not be used indiscriminately for:
- simple canonical record fields,
- decorative UI-only values,
- local presentation-only formatting,
- direct, non-derived values that already map clearly to authoritative records.

Use the heavier provenance framework for values that are aggregated, derived, interpreted, freshness-sensitive, or likely to be challenged.

---

## Truth classes

All truth-bearing values should first be classified into one of the following classes.

### 1. Raw record truth

A value shown directly from an authoritative source without business derivation beyond basic formatting.

Examples:
- player legal name,
- current table identifier,
- staff role,
- shift open/closed state,
- casino settings values.

These require:
- source ownership,
- canonical field mapping,
- authorization clarity.

They do **not** usually require full metric provenance treatment.

### 2. Derived operational truth

A value computed from source records to support operations, monitoring, staffing, or performance decisions.

Examples:
- active session counts,
- table utilization,
- ghost play or idle indicators,
- session conversion metrics,
- drop/fill productivity signals,
- player activity summaries,
- shift performance rollups.

These require the full provenance framework.

### 3. Compliance or interpreted truth

A value that reflects business, policy, or regulatory interpretation rather than raw state alone.

Examples:
- MTL threshold indicators,
- unresolved exception counts,
- compliance completeness indicators,
- requires-review flags,
- audit discrepancy summaries,
- risk or attention states.

These require full provenance treatment **plus** interpretation and historical semantics.

### 4. Snapshot or historical truth

A value that represents a past state or a preserved interpretation at a specific business boundary.

Examples:
- shift-close summaries,
- gaming-day snapshots,
- prior executive summary values,
- archived compliance rollups,
- ledger-style historical measurement records.

These require provenance plus explicit snapshot and correction policy.

---

## When the provenance framework must be applied

Apply the full provenance framework whenever a surface displays a value that is any of the following:

- aggregated,
- derived,
- filtered by business rules,
- time-windowed,
- status-interpreted,
- used for operational judgment,
- used for executive or financial judgment,
- used for compliance or audit judgment,
- consumed across multiple surfaces,
- likely to be challenged by operators, managers, or auditors.

If a value is a simple canonical field from an authoritative record, a lighter source/ownership declaration is usually sufficient.

---

## Core artifact: Cross-Surface Metric Provenance Matrix

The central artifact for this plan is the **Cross-Surface Metric Provenance Matrix**.

It begins with ADR-039 metrics but expands across all relevant surfaces and truth classes where appropriate.

Each row should represent a single truth-bearing metric or interpreted value.

### Required columns

| Column | Description |
|---|---|
| Truth ID | Stable identifier for the metric or interpreted value |
| Truth Class | Raw record, derived operational, compliance/interpreted, snapshot/historical |
| Metric / Value Name | Human-readable name |
| Business Meaning | What decision, question, or interpretation this value supports |
| Surface(s) | Which UI surfaces consume it |
| Consumer Class | Operational, executive, compliance, admin, etc. |
| Canonical Definition | Official business definition |
| Formula / Rule | Explicit logic, units, filters, time windows, and interpretation rules |
| Source Tables / Events | Authoritative tables, views, logs, event streams, or RPC outputs |
| Required Filters / Scope | Casino, gaming day, shift, table, player, staff, game type, etc. |
| Computation Layer | SQL, view, RPC, service layer, server mapper, client selector, materialized view, worker, snapshot job, etc. |
| Freshness Category | Live, near-real-time, request-time, cached, periodic, snapshot |
| Invalidation Trigger | What state changes require refresh or recomputation |
| Historical Semantics | Current state, rolling window, point-in-time, cumulative, ledger-style, etc. |
| Late Data / Correction Handling | Whether backfills/corrections are allowed and how they affect prior values |
| Consumer Tolerance | Whether staleness or approximation is acceptable |
| Audit / Reconciliation Path | How the value is checked against source truth |
| Interpretation Basis | Business rule, policy basis, regulatory basis, or n/a |
| Owner | Domain, team, or service responsible for correctness |
| Status | Proposed, implemented, verified, disputed, deprecated |
| Known Risks | Ambiguities, edge cases, drift risks, or unresolved questions |
| Notes | Additional context needed to interpret or trust the value |

---

## Required metric/runtime classification

Every derived or interpreted value should be assigned one runtime delivery pattern.

### 1. Live operational metric

Use when:
- the value can be derived cheaply from operational truth,
- it supports near-real-time decisions,
- it does not require durable point-in-time preservation beyond source data,
- consistency can be maintained through one authoritative derivation path.

Typical implementation:
- SQL or RPC as source of truth,
- optionally wrapped by service-layer mapping,
- explicit invalidation and freshness policy.

### 2. Cached or pre-shaped metric

Use when:
- repeated live computation is wasteful,
- multiple surfaces need the same shaped value,
- consistency matters more than absolute immediacy,
- data is still operational but wants a controlled freshness policy.

Typical implementation:
- centralized derivation path,
- shared service/query/view,
- server-side cache or controlled application cache,
- explicit stale-time contract.

### 3. Materialized derived metric

Use when:
- the value is expensive to compute repeatedly,
- historical and cross-surface consistency matter,
- executive/financial consumers depend on the same exact semantics,
- point-in-time reproducibility matters,
- reconciliation and trend analysis are important.

Typical implementation:
- materialized view,
- scheduled refresh,
- derived table,
- controlled aggregation job.

### 4. Snapshot or ledger-style truth

Use when:
- a value represents interpretation at a specific business boundary,
- historical auditability matters more than live recomputation,
- later source changes must not silently rewrite prior meaning.

Typical implementation:
- append-only records,
- gaming-day/shift-close snapshots,
- explicit correction or amendment policy.

---

## Surface-specific guidance

### ADR-039 measurement surfaces

These remain the first proving ground.

They should be used to pilot:
- the matrix structure,
- freshness categories,
- runtime classification,
- reconciliation procedures,
- engineering workflow.

ADR-039 is not the full scope, but it is the right starting pressure point because these are explicit “which pay the rent” metrics.

### Shift dashboards

Shift surfaces should be included early.

These dashboards frequently present:
- active counts,
- utilization,
- staffing signals,
- open slip/session summaries,
- floor health rollups,
- current-window performance figures.

These values are operationally hot, often time-sensitive, and vulnerable to duplicated logic across components and surfaces.

### Player dashboards and player summary views

Include only the **derived and aggregated** portions first.

Examples in scope:
- worth or value summaries,
- frequency indicators,
- behavioral/engagement summaries,
- reward eligibility rollups,
- historical player performance metrics.

Examples usually out of heavy scope:
- direct profile fields,
- static identifiers,
- canonical settings fields.

### Compliance dashboards and review surfaces

These should receive the strictest treatment.

For compliance values, the matrix should also capture:
- policy or regulatory interpretation basis,
- retention/snapshot expectations,
- correction/amendment rules,
- review ownership.

These are not merely numbers. They often imply institutional interpretation and may be challenged during audit or review.

### Executive or management summary surfaces

These should be included wherever multiple underlying operational metrics are rolled up into higher-level summaries.

These surfaces are especially prone to “looks authoritative, but semantics are fuzzy” failure modes.

---

## Investigation and rollout workflow

### Phase 1: Inventory

Identify all truth-bearing values currently:
- implemented,
- planned,
- partially implemented,
- displayed in UI,
- relied upon by staff or intended future consumers.

Output:
- surface-by-surface inventory,
- truth class assignment,
- initial owner assignment.

### Phase 2: Provenance mapping

For each in-scope value, document:
- business meaning,
- canonical definition,
- source data,
- formula/rule,
- computation layer,
- freshness target,
- invalidation triggers,
- reconciliation path.

Output:
- first-pass Cross-Surface Metric Provenance Matrix.

### Phase 3: Consistency audit

Compare all surfaces and code paths to identify whether the same concept is:
- computed in multiple places,
- filtered differently,
- named differently,
- refreshed differently,
- interpreted differently.

Output:
- duplication and drift register.

### Phase 4: Runtime suitability review

Decide for each value whether it should remain:
- live,
- cached,
- materialized,
- snapshotted.

Output:
- runtime classification recommendations.

### Phase 5: Trust and audit review

For each truth-bearing value, define:
- how it is verified,
- what source records justify it,
- what acceptable ambiguity exists,
- whether the value is defensible in operational or compliance contexts.

Output:
- validation and reconciliation checklist.

### Phase 6: Standards adoption

Formalize where truth derivation is allowed to live and how new surfaces must declare metric semantics.

Output:
- engineering standards,
- doc updates,
- follow-on ADR or exec-spec triggers where necessary.

---

## Anti-patterns to hunt for

The rollout should explicitly identify and eliminate the following:

- the same metric being computed differently across screens,
- client components deriving business truth independently,
- service-layer and SQL-layer formulas diverging,
- UI labels implying stronger semantics than the system actually guarantees,
- no explicit freshness contract,
- stale caches with invisible semantics,
- realtime on one surface and manual refresh on another for the same truth,
- historical values recomputed from mutable current truth without snapshot policy,
- compliance interpretations with no policy basis recorded,
- metrics with no reconciliation path,
- values owned by “everyone,” meaning by no one.

---

## Recommended standards to adopt

### Standard 1 — One canonical definition
Every in-scope truth-bearing value must have exactly one official definition and one responsible owner.

### Standard 2 — No ungoverned business metric derivation in UI
UI may format or present truth, but it must not silently redefine it.

### Standard 3 — Freshness must be explicit
Every in-scope value must declare whether it is:
- live,
- near-real-time,
- request-time,
- cached,
- periodic,
- snapshotted.

### Standard 4 — Reconciliation is mandatory
If a value cannot be traced and defended against source truth, it is not production-trustworthy.

### Standard 5 — Historical semantics must be declared
If a value represents a prior business state, the system must declare whether it is recomputed from mutable data or preserved as point-in-time truth.

### Standard 6 — Shared truth requires shared derivation
If multiple surfaces rely on the same truth-bearing value, they should consume one authoritative derivation path unless an exception is documented.

### Standard 7 — Compliance truth requires interpretation basis
If a value implies policy or regulatory meaning, that interpretive basis must be explicitly recorded.

### Standard 8 — New major surfaces must declare truth posture
New surface work should declare:
- which truth-bearing values it introduces,
- which are raw vs derived vs interpreted,
- what derivation path they rely on,
- what freshness and reconciliation rules apply.

---

## Deliverables

The team should produce:

### 1. Cross-Surface Metric Provenance Matrix
A complete matrix covering all in-scope truth-bearing values.

### 2. Surface Truth Inventory
A surface-by-surface catalog of raw, derived, interpreted, and historical values.

### 3. Metric / Truth Risk Register
A ranked list of:
- inconsistency risk,
- freshness risk,
- auditability risk,
- business-interpretation risk,
- computational-cost risk.

### 4. Runtime Recommendation Summary
Per value, specify whether it should remain:
- live,
- cached,
- materialized,
- snapshotted.

### 5. Standardization Proposals
Recommendations for:
- allowed derivation layers,
- freshness policy categories,
- naming conventions,
- reconciliation requirements,
- ownership model,
- compliance interpretation handling.

### 6. Follow-on governance triggers
Identify values or groups that now warrant:
- a new ADR,
- an ADR addendum,
- an exec-spec,
- a service contract update,
- a schema/view/materialization proposal.

---

## Suggested rollout order

Recommended order of expansion:

1. **ADR-039 measurement surfaces**  
   because they are the current pressure point and ideal pilot scope.

2. **Shift and operational dashboards**  
   because they are highly consumed and likely to hide duplicated derivation logic.

3. **Compliance dashboards and review surfaces**  
   because trust, defensibility, and historical semantics matter most here.

4. **Player dashboards and summary views**  
   focusing first on derived and aggregated metrics, not every raw field.

5. **Executive/management summary surfaces**  
   especially where multiple lower-level truths are rolled up into summary performance interpretations.

---

## Immediate next actions

1. Rename the effort from an ADR-039-only matrix to a **Cross-Surface Metric Provenance Matrix**.
2. Use ADR-039 metrics as the initial pilot slice.
3. Inventory shift, compliance, and player-derived metrics next.
4. Mark all values currently derived in UI or in more than one layer.
5. Assign owners for executive, operational, and compliance-facing truth categories.
6. Align metric freshness categories with runtime delivery and caching standards.
7. Escalate only the values that truly require materialization or snapshotting.
8. Use this framework to determine whether PT needs broader derived-data pipelines or simply better truth governance and runtime contracts.

---

## Bottom line

PT does not appear to suffer from weak domain structure or weak ingestion fundamentals.

The next maturity step is different:

PT must govern the truth it displays across surfaces with the same seriousness it already applies to service boundaries, schema ownership, and security.

That means:
- classifying truth,
- documenting provenance,
- standardizing derivation,
- declaring freshness,
- preserving historical semantics where needed,
- and ensuring that important values can be defended when challenged.

That is the purpose of this plan.

# ADR-039 Metric Provenance Matrix Plan

## Purpose

This document defines a practical plan for introducing a **Metric Provenance Matrix** for ADR-039 measurement surfaces.

The intent is not to build a grand analytics platform prematurely. The intent is to ensure that every rent-paying measurement introduced by ADR-039 is:

- clearly defined,
- traceable to authoritative sources,
- computed in the correct layer,
- consistent across surfaces,
- assigned an explicit freshness policy,
- auditable and defensible.

This is a governance and runtime-confidence artifact. It should help determine whether PT can safely serve these measurements from operational truth, or whether certain metrics require a more formal derived-data or materialization path.

---

## Why this exists

PT already appears to have a structurally sound ingestion architecture for file-based import workflows. The concern here is different.

The concern is that measurement surfaces may display **derived business truth** without a single authoritative derivation path. In that scenario, the risks are not limited to bad raw data. The real risks are:

- duplicated metric logic across layers,
- inconsistent formulas across screens,
- inconsistent freshness across consumers,
- drift between operational truth and displayed values,
- weak auditability when numbers are questioned,
- unclear responsibility for metric computation and validation.

A Metric Provenance Matrix addresses this by forcing each metric to declare where it comes from, how it is computed, who owns it, and how it is verified.

---

## Primary objective

For every ADR-039 measurement, determine whether the current implementation is sufficient and trustworthy, or whether the metric requires additional standardization, centralization, caching, materialization, or pipeline support.

---

## Scope

This plan applies to all ADR-039 measurement surfaces, especially those intended to influence operational, executive, or economic decisions.

Examples include, but are not limited to:

- table productivity indicators,
- utilization or occupancy measures,
- labor-to-theoretical performance measures,
- ghost play or idle-time related measures,
- active slip/session conversion indicators,
- drop/fill/session productivity,
- other “which pay the rent” metrics that may affect staffing, table operations, incentive interpretation, or executive review.

---

## What the matrix must answer

For each metric, the matrix must answer the following:

1. What is the metric called?
2. What business question does it answer?
3. What is the canonical formula or rule?
4. What authoritative source data feeds it?
5. Which layer computes it?
6. Which surfaces consume it?
7. How fresh must it be?
8. What events or state changes invalidate it?
9. How is it audited or reconciled?
10. What known failure or ambiguity modes exist?

If those answers cannot be provided clearly, the metric is not yet trustworthy enough to be treated as governed business truth.

---

## Deliverable: Metric Provenance Matrix

Create a matrix with one row per metric and at minimum the following columns.

| Column | Description |
|---|---|
| Metric ID | Stable identifier for the metric |
| Metric Name | Human-readable label |
| Business Meaning | What decision or question this metric supports |
| Surface(s) | Which UI surfaces consume it |
| Consumer Class | Operational, executive, compliance, admin, etc. |
| Canonical Definition | The official business definition |
| Formula / Rule | Explicit logic, including units and time windows |
| Source Tables / Events | Authoritative tables, views, event streams, or RPC outputs |
| Required Filters / Scope | Casino, gaming day, table, shift, staff, game type, etc. |
| Computation Layer | SQL, RPC, service layer, server mapper, client selector, materialized view, worker, etc. |
| Freshness Target | Real-time, near-real-time, request-time, cached, periodic snapshot |
| Invalidation Trigger | What changes should cause the value to refresh or recompute |
| Historical Semantics | Point-in-time, rolling window, cumulative, current-state only |
| Late Data / Correction Handling | Whether backfills or corrections are allowed and how they affect the metric |
| Consumer Tolerance | Whether slight staleness is acceptable or dangerous |
| Audit Query / Reconciliation Method | How the number is checked against source truth |
| Owner | Domain or team responsible for correctness |
| Status | Proposed, implemented, verified, disputed, deprecated |
| Known Risks | Ambiguities, edge cases, or drift risks |
| Notes | Anything else needed to interpret the metric safely |

---

## Required classification for each metric

Each metric must be classified into one of the following computation patterns.

### 1. Live operational metric

Use when:
- derived cheaply from operational truth,
- needed in near-real-time,
- primarily supports in-session or current-shift decisions,
- does not require historical snapshot preservation beyond source data.

Typical implementation:
- authoritative SQL or RPC,
- optionally wrapped by service-layer mapping,
- consistent fetch strategy,
- explicit invalidation.

### 2. Cached or pre-shaped metric

Use when:
- the metric is still operational, but repeated live computation is wasteful,
- multiple surfaces need the same shaped value,
- consistency matters more than fully raw immediacy.

Typical implementation:
- centralized service-level computation,
- shared query/view,
- server-side caching or application-level cache policy,
- explicitly defined freshness window.

### 3. Materialized derived metric

Use when:
- the metric is expensive,
- historical comparisons matter,
- multiple consumers require exact consistency,
- point-in-time reproducibility matters,
- reconciliation and trend analysis are important.

Typical implementation:
- materialized view, scheduled refresh, derived table, or controlled aggregation job.

### 4. Snapshot or ledger-style metric

Use when:
- the metric represents state at a specific business boundary,
- historical auditability matters more than recomputation,
- later source changes should not silently rewrite prior business interpretation.

Typical implementation:
- append-only or versioned records,
- gaming-day / shift-close snapshots,
- explicit correction policy.

---

## Investigation workflow

### Phase 1: Metric inventory

Identify all ADR-039 measurements currently planned, partially implemented, or already exposed in UI.

Output:
- complete metric list,
- metric owners,
- consuming surfaces,
- current implementation status.

### Phase 2: Provenance mapping

For each metric, document:
- canonical business meaning,
- formula,
- source data,
- computation layer,
- freshness requirement,
- invalidation triggers,
- reconciliation method.

Output:
- first-pass Metric Provenance Matrix.

### Phase 3: Consistency audit

Compare all consuming surfaces and code paths to determine whether the same metric is being:
- computed in multiple places,
- filtered differently,
- named differently,
- refreshed differently,
- interpreted differently.

Output:
- duplication and drift register.

### Phase 4: Runtime suitability review

Decide whether each metric should remain:
- live,
- cached,
- materialized,
- snapshotted.

Output:
- per-metric runtime recommendation,
- rationale for each recommendation.

### Phase 5: Trust and audit review

For each metric, define:
- how to verify it,
- what sample reconciliation looks like,
- what source records justify the number,
- what error bounds or ambiguity are acceptable.

Output:
- metric validation and reconciliation checklist.

---

## Decision criteria: when a metric needs more than live reads

A metric should be escalated from live computation to a stronger derived-data path if one or more of the following are true:

- the query cost is high or growing,
- multiple surfaces require the exact same number and definition,
- the metric is used for executive or financial judgment,
- point-in-time reproducibility matters,
- late-arriving events can change prior interpretations,
- end users will challenge the number and require defensible traceability,
- the metric must survive UI or service-layer implementation changes without semantic drift.

---

## Anti-patterns to hunt for

The investigation should explicitly look for these failures:

- the same metric being computed differently across screens,
- client components deriving business metrics independently,
- service-layer and SQL-layer formulas diverging,
- UI labels that imply a stronger business meaning than the implementation supports,
- stale caches without explicit freshness contracts,
- no defined invalidation triggers,
- realtime refresh on some surfaces but manual refresh on others for the same metric,
- historical metrics recomputed from mutable current truth without snapshot semantics,
- metrics with no reconciliation path,
- metrics owned by “everyone,” meaning by no one.

---

## Recommended output package

The team should return the following:

### 1. Completed Metric Provenance Matrix
A full matrix covering every ADR-039 metric.

### 2. Metric Risk Register
A ranked list of metrics with:
- inconsistency risk,
- freshness risk,
- auditability risk,
- computation-cost risk,
- business-interpretation risk.

### 3. Runtime Recommendation Summary
For each metric, state whether it should remain:
- live,
- cached,
- materialized,
- snapshotted.

### 4. Standardization Proposals
Explicit recommendations for:
- where metric logic is allowed to live,
- naming conventions,
- freshness policy categories,
- reconciliation requirements,
- ownership policy.

### 5. Follow-up ADR / Exec-Spec Triggers
Identify any metrics or metric families that now warrant:
- a new ADR,
- an ADR addendum,
- an exec-spec,
- a service contract update,
- a schema/view/materialization proposal.

---

## Recommended standards to adopt

### Standard 1: One canonical metric definition
Every metric must have exactly one official definition and one authoritative owner.

### Standard 2: No business metric derivation in UI unless explicitly approved
UI should not invent or reinterpret business truth. Presentation may format, but not redefine.

### Standard 3: Freshness must be explicit
Every metric must declare whether it is:
- live,
- near-real-time,
- request-time,
- cached,
- periodic,
- snapshotted.

### Standard 4: Reconciliation path is mandatory
If a metric cannot be defended against source records, it is not production-trustworthy.

### Standard 5: Historical semantics must be declared
If a metric represents a past state, the system must declare whether it is recomputed from mutable data or preserved as point-in-time truth.

### Standard 6: Shared metrics require shared computation
If multiple surfaces use the same metric, they should read from the same derivation path unless there is a documented exception.

---

## Suggested next actions

1. Inventory every ADR-039 metric now, before more surfaces proliferate.
2. Build the first-pass matrix even if several fields are initially unknown.
3. Highlight all metrics currently computed in UI or in more than one layer.
4. Mark executive or financially sensitive metrics for stricter provenance review.
5. Promote repeated metric logic into a single authoritative derivation path.
6. Escalate only the metrics that truly require materialization or snapshotting.
7. Use the matrix to decide whether PT needs a bigger measurement pipeline or simply better runtime contracts.

---

## Bottom line

This plan is meant to distinguish between two very different states:

- **The app can display a number.**
- **The system can defend that number.**

ADR-039 measurement surfaces should not be considered mature until they satisfy the second condition.

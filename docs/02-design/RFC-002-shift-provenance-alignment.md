---
id: RFC-002
title: "Design Brief: Shift Dashboard Provenance Alignment"
owner: System Architect
status: Draft
date: 2026-03-09
affects: [METRIC_PROVENANCE_MATRIX.md, SURFACE_CLASSIFICATION_STANDARD.md, SERVICE_RESPONSIBILITY_MATRIX.md]
---

# Design Brief / RFC: Shift Dashboard Provenance Alignment (Hardening Slice 2)

> Purpose: Define the audit methodology, deliverable structure, and metric inventory approach for bringing the Shift Dashboard V3 under formal provenance governance.
> Type: Governance certification slice — no code changes.

## 1) Context

- **Problem:** The Shift Dashboard V3 is PT-2's strongest operational surface. It already contains provenance primitives in code (`provenance.ts`, worst-of rollup, trust badges, coverage bars), but these exist outside the formal Metric Provenance Matrix and Surface Classification Standard established in Slices 0-1.
- **Forces:** The governance framework was piloted on 4 ADR-039 measurement rows (MEAS-001 through MEAS-004). The framework was piloted on a friendly test case — a small greenfield surface designed alongside the standards. The 4 MEAS rows were born into the matrix, not retrofitted. The framework's credibility depends on whether it survives contact with a real operational dashboard that has pre-existing provenance primitives, 8-12+ truth-bearing metrics, and existing governance documentation that may overlap or conflict.
- **Prior art:**
  - Slice 1 Surface Classification Declaration (`docs/70-governance/examples/SLICE-1-MEASUREMENT-UI-DECLARATION.md`) — template for §5 compliance
  - Existing shift governance docs: `SHIFT_METRICS_CONTRACT_v1.md`, `SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md`, `SHIFT_SNAPSHOT_RULES_v1.md`, `SHIFT_SEVERITY_ALLOWLISTS_v1.md`
  - Provenance derivation in code: `services/table-context/shift-metrics/provenance.ts`

## 2) Scope & Goals

- **In scope:**
  - Inventory every truth-bearing metric displayed on the shift dashboard
  - Populate MEAS-005+ rows in the Metric Provenance Matrix
  - Create Shift Dashboard Surface Classification Declaration (§5 compliance)
  - Consistency audit: verify single-derivation-path per business fact
  - SRM Governance Cross-References update
  - Produce reusable governance audit template for Slice 3

- **Out of scope:**
  - Code changes to shift dashboard (components, services, hooks, APIs)
  - Pit Dashboard metrics (Slice 3)
  - New database migrations or RPCs
  - New trust UI components
  - Runtime enforcement or monitoring changes

- **Success criteria:**
  - METRIC_PROVENANCE_MATRIX expanded with shift dashboard metrics
  - Surface Classification Declaration passes §5 mandatory 4-field checklist
  - Consistency audit documents zero unresolved duplicated derivation paths
  - Output is reusable as a template for Slice 3 Pit Dashboard governance

## 3) Proposed Direction (overview)

Execute a three-phase governance audit: (1) inventory all truth-bearing values rendered by the shift dashboard, classifying each by truth class; (2) populate provenance matrix rows using the hybrid granularity approach (individual rows where provenance differs, grouped where identical); (3) produce the Surface Classification Declaration and consistency audit report.

The shift dashboard is already well-documented in `docs/25-api-data/` — this work codifies that documentation into the formal provenance matrix format rather than inventing new governance from scratch.

## 4) Detailed Design

### 4.1 Metric Inventory Methodology

Audit the shift dashboard by tracing from **UI components → hooks → API routes → service layer → database tables/RPCs**.

**Component tree to audit:**

| Component Group | Location | Truth-Bearing Values |
|----------------|----------|---------------------|
| Hero Win/Loss | `left-rail/hero-win-loss-compact.tsx` | Win/loss (inventory), win/loss (estimated), metric grade |
| Secondary KPIs | `left-rail/secondary-kpi-stack.tsx` | Estimated drop (rated, grind, buyins), fills total, credits total |
| Quality Summary | `left-rail/quality-summary-card.tsx` | Tables with good/low/none coverage |
| Coverage Bar | `trust/coverage-bar.tsx` | Snapshot coverage ratio, coverage tier |
| Metric Grade Badge | `trust/metric-grade-badge.tsx` | ESTIMATE vs AUTHORITATIVE grade |
| Metrics Table | `center/metrics-table.tsx` | Per-pit and per-table breakdown of all above |
| Alerts Strip | `center/alerts-strip.tsx` | Cash observation spike alerts, severity |
| Floor Activity Radar | `charts/floor-activity-radar.tsx` | Rated vs unrated table counts |
| Win/Loss Trend | `charts/win-loss-trend-chart.tsx` | Pit-level win/loss time series |
| Telemetry Rail | `right-rail/telemetry-rail-panel.tsx` | Cash observation rollups (casino/pit/table) |
| Active Visitors | (header/layout area) | Active visitor count summary (tentatively in scope — included unless audit proves it is merely header chrome with no truth-bearing semantics) |

### 4.2 Proposed MEAS Row Structure (Hybrid Approach)

Apply the scaffold's hybrid rule: separate MEAS rows when source, freshness, reconciliation, or derivation path differs; group when provenance is identical and values differ only by presentation.

**Preliminary row plan** (final count determined by audit). These IDs and groupings are provisional — the component-level trace validation may consolidate or split rows once actual derivation paths are inspected:

| Proposed ID | Metric Family | Truth Class | Rationale for Separate Row |
|-------------|--------------|-------------|---------------------------|
| MEAS-005 | Shift Win/Loss (Inventory) | Derived Operational | Derived from `table_inventory_snapshot` opening/closing deltas + fills + credits. Unique source: snapshot pairs. |
| MEAS-006 | Shift Win/Loss (Estimated) | Derived Operational | Derived from telemetry-based estimated drop. Different source than MEAS-005 (telemetry vs. inventory). Different grade semantics. |
| MEAS-007 | Shift Estimated Drop | Derived Operational | Sum of rated + grind + buyin telemetry. Source: `pit_cash_observation` aggregation. Distinct derivation from win/loss. |
| MEAS-008 | Shift Fills & Credits | Raw Record (aggregated) | Direct sum from `table_fill` and `table_credit`. Simpler provenance than derived metrics. |
| MEAS-009 | Snapshot Coverage & Metric Grade | Derived Operational | Coverage ratio from snapshot pair presence. Grade derived via `provenance.ts` worst-of rollup. Unique derivation path. |
| MEAS-010 | Cash Observation Alerts | Derived Operational | Spike detection from `pit_cash_observation` with severity guardrails. Distinct computation from drop/fills. |
| MEAS-011 | Active Visitors Summary | Derived Operational | Count of active visits. Source: `visit` table. Cross-context read from VisitService. |

**Grouping decisions:**
- Fills and credits share identical provenance characteristics (same source tables, same freshness, same computation layer) → grouped as MEAS-008
- Win/loss inventory vs. estimated have different source inputs and different grade semantics → separate rows (MEAS-005, MEAS-006)
- Coverage ratio and metric grade are tightly coupled (grade is derived from coverage) → grouped as MEAS-009

### 4.3 Surface Classification Declaration

The shift dashboard will receive a Surface Classification Declaration following the Slice 1 template. Pre-assessment:

```yaml
Surface Classification:
  Rendering Delivery: RSC Prefetch + Hydration
    Rationale: Read-heavy operational dashboard with 3 independent
    prefetched queries (summary, cash-obs-summary, visitors-summary)
    above the fold. Users primarily view data. Matches RSC selection
    criteria (read-heavy, ≥2 queries, above the fold).

  Data Aggregation: BFF Summary Endpoint
    Rationale: Multi-level rollup (casino → pits → tables) consolidated
    into single HTTP response. Reduces 7+ individual HTTP calls to 1.
    >100 calls/day during shift operations. Matches BFF Summary selection
    criteria (§4 Q2).

  Rejected Patterns:
    - Client Shell: Read-heavy dashboard with 3+ queries above the fold.
      Server-seeded paint is critical for operational responsiveness.
    - BFF RPC: Multi-level hierarchical rollup (casino/pit/table) fits
      Summary Endpoint better than flat cross-context join.
    - Simple Query: Multiple bounded contexts (TableContext, RatingSlip,
      Visit) violates single-context criterion.
    - Client-side Fetch: 3+ cross-context aggregations needed.

  Metric Provenance:
    - MEAS-005 through MEAS-011 (see METRIC_PROVENANCE_MATRIX.md)
```

### 4.4 Consistency Audit Scope

The audit must verify:

1. **Single derivation path:** Each business fact (e.g., "shift win/loss") is computed through exactly one authoritative path, not duplicated across components or services.
2. **Rollup consistency:** Pit-level and casino-level aggregations use the same derivation rules as table-level (worst-of semantics documented in `SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md`).
3. **Freshness alignment:** All shift metrics served via the BFF Summary Endpoint share the same freshness contract (30s staleTime, 30s refetchInterval per `use-shift-dashboard-summary.ts`).
4. **Trust primitive alignment:** The existing `ProvenanceMetadata` type and derivation functions align with the Metric Provenance Matrix's truth class and reconciliation column semantics.
5. **No ungoverned derivation in UI:** Components display trust metadata but do not recompute or reinterpret it (Standard 2 from the Cross-Surface Provenance Plan).

**Duplicated derivation path definition** (from scaffold audit):
> Two or more shift dashboard truth-bearing metrics representing the same business fact are considered duplicated if they are computed through materially different source inputs, transformation logic, freshness windows, or reconciliation rules without an explicit declared distinction.

### 4.5 Security considerations

- **No security changes.** This is a documentation/governance exercise.
- The audit will verify that existing SECURITY INVOKER/DEFINER annotations are correctly documented in provenance rows.
- No new RLS policies, no new RPCs, no new access patterns.

## 5) Cross-Cutting Concerns

- **Performance implications:** None — no code changes.
- **Migration strategy:** N/A — documentation only.
- **Observability / monitoring:** No changes. The audit may recommend future observability improvements as findings, but will not implement them.
- **Rollback plan:** Trivially reversible — revert documentation PRs.
- **Reusable template:** The audit methodology and deliverable structure must be documented clearly enough that Slice 3 can follow the same process for the Pit Dashboard without re-inventing the approach.

## 6) Alternatives Considered

### Alternative A: Code-first hardening (add runtime provenance enforcement)

- **Description:** Instead of documentation-only governance, add runtime checks that validate metric freshness, source alignment, and derivation path correctness.
- **Tradeoffs:** Higher value but significantly higher effort; mixes governance validation with implementation work; risks scope creep.
- **Why not chosen:** The scaffold explicitly prohibits code changes. Runtime enforcement may be warranted after the governance audit reveals specific gaps, but it belongs in a follow-on slice, not in Slice 2.

### Alternative B: Skip the matrix, rely on existing shift docs

- **Description:** The shift dashboard already has 5 governance docs in `docs/25-api-data/`. Declare these sufficient and skip provenance matrix expansion.
- **Tradeoffs:** Fastest path, but leaves the framework scaling claim unproven. The existing docs describe HTTP contracts and UX contracts — they do not declare truth class, freshness category, reconciliation path, or ownership in the matrix format.
- **Why not chosen:** Existing docs govern different concerns (API shape, visual contract, rollup algorithm). The provenance matrix governs truth semantics. They are complementary, not substitutable.

## 7) Decisions Required

No new ADR required. The governing ADR already exists:

- **ADR-041** (Surface Governance Standard) — governs the Surface Classification Standard and Metric Provenance Matrix. Slice 2 operates within ADR-041's framework.

**RFC-level decision resolved:** The scaffold surfaced Option A (individual rows) vs. Option B (grouped families) as the primary design choice. This RFC adopts the **hybrid granularity strategy**: separate MEAS rows when source, freshness, reconciliation, or derivation path differs; group only when provenance is identical and values differ by presentation. This is a design decision, not an architectural one — it does not warrant an ADR but is recorded here as the governing rule for the metric inventory.

If the consistency audit reveals structural issues (e.g., duplicated derivation paths that require code changes to resolve), those findings would trigger follow-on ADR or PRD work — but that is an outcome of the slice, not a prerequisite.

## 8) Open Questions

- **Final metric count:** The preliminary plan identifies 7 MEAS rows (MEAS-005 through MEAS-011). The actual count will be determined by the component-level audit. The hybrid granularity rule governs whether metrics are split or grouped.
- **Cash observations taxonomy:** Cash observation metrics are labeled "TELEMETRY-ONLY" in the codebase. The audit must determine whether their truth class is "Derived Operational" or a lighter classification given their observational (non-authoritative) nature.
- **Existing doc reconciliation:** The 5 existing shift governance docs in `docs/25-api-data/` may contain information that conflicts with or supplements the provenance matrix rows. The audit must reconcile, not duplicate.

## Links

- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-001-shift-provenance-alignment.md`
- Feature Boundary: `docs/20-architecture/specs/hardening-slice-2-shift-provenance/FEATURE_BOUNDARY.md`
- ADR(s): ADR-041 (Surface Governance Standard — existing, no new ADR needed)
- PRD: TBD
- Exec Spec: TBD

## References

- Metric Provenance Matrix: `docs/70-governance/METRIC_PROVENANCE_MATRIX.md`
- Surface Classification Standard: `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md`
- Slice 1 Declaration (template): `docs/70-governance/examples/SLICE-1-MEASUREMENT-UI-DECLARATION.md`
- Shift Metrics Contract: `docs/25-api-data/SHIFT_METRICS_CONTRACT_v1.md`
- Shift Provenance Rollup Algorithm: `docs/25-api-data/SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md`
- Shift Snapshot Rules: `docs/25-api-data/SHIFT_SNAPSHOT_RULES_v1.md`
- Cross-Surface Provenance Plan: `docs/00-vision/strategic-hardening/pt-cross-surface-metric-provenance-governance-plan.md`
- Standards Foundation: `docs/00-vision/PT-ARCH-MAP/STANDARDS-FOUNDATION.md`
- SRM v4.18.0: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`

---
id: SCAFFOLD-001
title: "Governance Hardening Scaffold: Shift Dashboard Provenance Alignment"
owner: System Architect
status: Draft
date: 2026-03-09
---

# Governance Hardening Scaffold: Shift Dashboard Provenance Alignment

> **Slice type:** Governance certification slice (not a feature build)
> Timebox: 30-60 minutes. If it's longer, you're drifting into a design doc.
>
> **Slice 2 exists to convert the Shift Dashboard from an operational surface with implicit metric trust into a governed surface with explicit provenance, ownership, reconciliation, and classification contracts.**

**Feature name:** hardening-slice-2-shift-provenance
**Owner / driver:** System Architect
**Stakeholders (reviewers):** Lead Architect, Pit Operations
**Status:** Approved (audit corrections applied 2026-03-09)
**Last updated:** 2026-03-09

## 1) Intent (what outcome changes?)

- **User story:** As a system architect, I need to bring the Shift Dashboard V3's existing provenance primitives under the formal Metric Provenance Matrix and Surface Classification Standard, so that the governance framework is proven to scale beyond ADR-039's 4 measurement rows to operational dashboard metrics.
- **Success looks like:** Every truth-bearing metric displayed on the shift dashboard has a formal provenance declaration (MEAS-005+), the shift dashboard has a Surface Classification Declaration, a consistency audit confirms no duplicated derivation paths, and the output is a reusable template for later surface governance slices (especially Pit Dashboard in Slice 3).

> **Duplicated derivation path (auditable definition):** Two or more shift dashboard truth-bearing metrics representing the same business fact are considered duplicated if they are computed through materially different source inputs, transformation logic, freshness windows, or reconciliation rules without an explicit declared distinction.

## 2) Constraints (hard walls)

- **No code changes:** This is a governance/audit exercise. Zero table mutations, zero new RPCs, zero component changes, zero migrations.
- **Framework compatibility:** New provenance rows must use the existing 12-column Metric Provenance Matrix schema (no column additions without escalation).
- **Standard compliance:** Surface Classification Declaration must pass §5 mandatory checklist from `SURFACE_CLASSIFICATION_STANDARD.md`.
- **SRM alignment:** All audited metrics must trace back to TableContextService or RatingSlipService table ownership per SRM v4.18.0.

## 3) Non-goals (what we refuse to do in this iteration)

- Modify shift dashboard code (components, services, hooks, API routes)
- Expand provenance framework to Pit Dashboard metrics (Slice 3 scope)
- Create new trust UI components or modify existing ones
- Add materialized views, caching layers, or runtime delivery changes
- Introduce new governance columns or framework structure changes

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:**
  - Existing shift-metrics service code (`services/table-context/shift-metrics/`)
  - Existing provenance primitives (`provenance.ts`, `snapshot-rules.ts`)
  - Existing shift dashboard components (`components/shift-dashboard-v3/trust/`)
  - Existing BFF endpoints and their response shapes
  - Existing governance docs (`SHIFT_METRICS_CONTRACT_v1.md`, `SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md`, etc.)
- **Outputs:**
  - MEAS-005+ rows added to `docs/70-governance/METRIC_PROVENANCE_MATRIX.md`
  - Shift Dashboard Surface Classification Declaration (new doc in `docs/70-governance/examples/`)
  - Consistency audit findings (gaps, anti-patterns, recommendations)
  - SRM cross-reference update (Governance Cross-References subsection)
- **Canonical contract(s):** Metric Provenance Matrix 12-column schema, Surface Classification Standard §5 declaration format

## 5) Options (2-4 max; force tradeoffs)

### Option A: Full Metric Inventory + Declaration

Audit every truth-bearing value displayed on the shift dashboard, create individual MEAS-XXX rows for each, and produce a comprehensive Surface Classification Declaration.

- **Pros:** Complete governance coverage; proves framework scales; becomes the exemplar for Slice 3
- **Cons / risks:** Potentially many rows (win/loss, drop, fills, credits, coverage, quality, alerts — could be 8-12+ metrics); risk of over-granularity
- **Cost / complexity:** Medium (documentation effort, no code)
- **Security posture impact:** None (read-only audit)
- **Exit ramp:** Rows can be consolidated or split later without code impact

### Option B: Grouped Metric Families + Declaration

Group related shift metrics into families (e.g., "Shift Win/Loss Family" covering inventory and estimated variants) and create fewer, coarser-grained MEAS-XXX rows. Produce Surface Classification Declaration.

- **Pros:** Simpler matrix; avoids row explosion; captures the essential provenance without per-field granularity
- **Cons / risks:** May miss metric-specific freshness or reconciliation nuances; less precise
- **Cost / complexity:** Low-Medium
- **Security posture impact:** None
- **Exit ramp:** Families can be decomposed into individual rows later if needed

### ~~Option C: Declaration Only (Defer Matrix Expansion)~~ — DEMOTED: abort/fallback path only

> This option defeats Slice 2's core purpose (proving the matrix scales beyond 4 rows). Listed only as a fallback if time constraints force early termination. Not a valid primary choice.

## 6) Decision to make (explicit)

- **Decision:** Hybrid of Option A + B — individual rows where provenance differs, grouped families where characteristics are identical.
- **Decision drivers:** The Slice 2 purpose is to prove the framework scales. Separate MEAS rows when a metric differs in source, freshness, reconciliation semantics, ownership, or derivation path. Group only when multiple displayed values share genuinely identical provenance and differ merely by presentation. This preserves precision without matrix bloat.
- **Decision deadline:** Before EXEC-SPEC production

## 7) Open questions / unknowns

### Inventory unknowns (resolved by the slice)

- How many distinct truth-bearing metrics does the shift dashboard actually display? (Resolved by component audit)
- Do cash observation metrics warrant separate MEAS-XXX rows or are they a sub-family of shift telemetry? (Resolved by provenance analysis)
- Does the existing `provenance.ts` worst-of rollup algorithm fully align with the Metric Provenance Matrix's reconciliation column expectations? (Resolved by audit)

### Boundary decisions (resolved before formalization)

- **`ActiveVisitorsSummary`**: **IN SCOPE** — it is rendered on the shift dashboard via `useActiveVisitorsSummary()`, so it is a truth-bearing value displayed on this surface and must be inventoried. If its provenance is trivial (raw record truth), it receives a lighter declaration per the governance framework's own scoping rules.

## 8) Definition of Done (thin)

- [ ] Shift dashboard metric inventory complete (every truth-bearing value cataloged)
- [ ] MEAS-005+ rows populated in METRIC_PROVENANCE_MATRIX.md
- [ ] Surface Classification Declaration created and passes §5 checklist
- [ ] Consistency audit confirms no duplicated derivation paths
- [ ] SRM Governance Cross-References updated to reference shift provenance
- [ ] HARDENING-SLICE-MANIFEST.md updated with Slice 2 artifacts
- [ ] Output yields a reusable governance audit template for later surface slices (Slice 3 Pit Dashboard)

## Links

- Feature Boundary: `docs/20-architecture/specs/hardening-slice-2-shift-provenance/FEATURE_BOUNDARY.md`
- Design Brief/RFC: TBD
- ADR(s): ADR-041 (Surface Governance Standard — existing)
- PRD: TBD
- Exec Spec: TBD

# ADR-041: Surface Governance Standard — Classification and Provenance Requirements

**Status:** Accepted
**Date:** 2026-03-07
**Owner:** Platform/Governance
**Related:** ADR-039 (Measurement Layer), GOV-PAT-003 (BFF RPC), STANDARDS-FOUNDATION.md
**Triggered by:** Hardening Area 1 — Surface Policy (PT-ARCH-MAP)

---

## Context

PT-2 has multiple production surfaces built with different rendering and data aggregation patterns:

- **RSC Prefetch + Hydration** — Shift Dashboard V3 (`app/(protected)/shift-dashboard/page.tsx`)
- **BFF RPC Aggregation** (GOV-PAT-003) — Rating Slip Modal (`rpc_get_rating_slip_modal_data`)
- **BFF Summary Endpoint** — Shift Dashboard API (`app/api/v1/shift-dashboards/summary/route.ts`)
- **Client-led with explicit contracts** — Admin Settings (`components/admin/threshold-settings-form.tsx`)

These patterns are individually sound but were adopted organically. No standard governs which pattern to use for new surfaces, and no formal provenance framework declares the truth semantics of metrics displayed across surfaces.

ADR-039 shipped measurement database infrastructure (4 artifacts: theo discrepancy columns, audit correlation view, rating coverage view, loyalty liability snapshot). These artifacts have zero frontend consumers. Before building UI surfaces against them, the selection of rendering and aggregation patterns — and the truth semantics of the metrics they display — must be governed rather than ad hoc.

The Cross-Surface Metric Provenance & Truth Governance Plan (`pt-cross-surface-metric-provenance-governance-plan.md`) defines a comprehensive framework. However, applying the full framework (22 columns, all surfaces) to 4 metrics is over-engineering. The Over-Engineering Guardrail (YAGNI) requires starting with the minimum viable governance that passes the enforceability test.

---

## Decisions

### D1: Surface Classification Requirement

Every new surface EXEC-SPEC must include a **Surface Classification declaration** with four mandatory fields:

1. **Rendering Delivery pattern** — which proven pattern governs how the page loads
2. **Data Aggregation pattern** — which proven pattern governs how data reaches the page
3. **Rejected Patterns** — which other proven patterns were considered and why they were rejected
4. **Metric Provenance** — for each surfaced truth-bearing metric, declare the applicable fields required by the approved Provenance Matrix (D3), at minimum truth class and freshness class

If any of the four fields is missing, the EXEC-SPEC is non-compliant and must be returned for amendment. This is a hard rejection gate, not a suggestion.

**Rationale:** Rendering delivery and data aggregation are orthogonal decisions that solve different problems. Requiring both to be declared — along with rejected alternatives — prevents engineers from defaulting to the pattern they're most familiar with rather than the one that fits. Requiring metric provenance prevents surfaces from displaying values without declaring their truth semantics.

### D2: Proven Pattern Palette (Recognized Patterns)

The following patterns are recognized as the proven palette. New surfaces must select from this palette for both axes:

**Rendering Delivery:**
- RSC Prefetch + Hydration
- Client Shell
- Hybrid (declared composition of proven patterns — not a junk-drawer category; the EXEC-SPEC must name which patterns are composed and why)

**Data Aggregation:**
- BFF RPC Aggregation (GOV-PAT-003)
- BFF Summary Endpoint
- Simple Query / View
- Client-side Fetch

**Palette evolution:** The palette grows only through governed amendment (new ADR or ADR-041 amendment). If no proven pattern cleanly fits a surface's requirements, the EXEC-SPEC must stop and raise an ADR or standards amendment rather than inventing a local exception.

**Rationale:** The codebase already contains strong exemplars for each pattern. Recognizing all four as complementary — rather than canonizing one — prevents false standardization. The no-fit escalation clause prevents ungoverned pattern proliferation.

### D3: Metric Provenance Matrix — Pragmatic Column Subset

The Metric Provenance Matrix uses 12 columns for initial population:

Truth ID, Truth Class, Metric Name, Business Meaning, Surface(s), Formula/Rule, Source Tables, Computation Layer, Freshness Category, Invalidation Trigger, Reconciliation Path, Owner.

The remaining 10 columns from the Cross-Surface Provenance framework (Consumer Class, Consumer Tolerance, Late Data Handling, Interpretation Basis, Required Filters/Scope, Historical Semantics, Audit/Reconciliation Path detail, Known Risks, Notes, Status) are deferred.

**Column expansion rule:** Columns are added per-row through governed matrix amendment when a concrete metric requires them. Expansion is triggered by implementation experience, not by speculative completeness. If any initial ADR-039 row proves to require interpretation-basis, late-data handling, or consumer-tolerance semantics during Slice 1, the matrix must be amended before implementation proceeds — the risk is not confined to Slices 2-3.

**Rationale:** 4 ADR-039 rows do not need 22 columns — most would be "n/a" fills that add noise and reduce enforceability. The 12-column subset captures what's needed to constrain Slice 1 implementation decisions (truth class, formula, source tables, freshness, reconciliation). The structure is additive — 12 columns now does not prevent 22 later.

### D4: Governance Document Home

Both governance artifacts live in `docs/70-governance/`:
- `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md`
- `docs/70-governance/METRIC_PROVENANCE_MATRIX.md`

Architecture documents (`docs/20-architecture/`) cross-link to them. The SRM cross-references the Provenance Matrix for measurement layer metrics.

**Rationale:** The matrix governs truth delivery — that is governance in function even though it describes architecture. Co-locating both artifacts simplifies discoverability and avoids split-brain governance.

---

## Consequences

**Positive:**
- New surfaces have explicit selection criteria, reducing pattern drift
- EXEC-SPEC review has a concrete rejection mechanism (4 missing fields)
- Metric provenance is declared before implementation, not retrofitted
- Pattern palette evolves through governed amendment, not ad hoc invention

**Negative:**
- Adds a declaration burden to every new surface EXEC-SPEC (~5 minutes of thought)
- The decision matrix is necessarily somewhat interpretive at the boundary between patterns (mitigated by the no-fit escalation clause)
- 12-column matrix may need expansion during Slice 1 itself if MEAS-002 (Compliance-Interpreted) requires interpretation-basis or late-data semantics — not only in Slices 2-3

**Neutral:**
- Does not change any existing surface — retroactive governance is Slices 2-3
- Does not introduce runtime enforcement — compliance is document-time

---

## Supersedes / Amends

- Does not amend any prior ADR
- Recognizes existing implementations (GOV-PAT-003, Shift Dashboard V3, Admin Settings) as reference exemplars for the approved pattern palette — not canonized as normative in all details

---

## References

- RFC-001: `docs/02-design/RFC-001-standards-foundation.md`
- Feature Boundary: `docs/20-architecture/specs/hardening-slice-0-standards-foundation/FEATURE_BOUNDARY.md`
- STANDARDS-FOUNDATION: `docs/00-vision/PT-ARCH-MAP/STANDARDS-FOUNDATION.md`
- Cross-Surface Provenance Plan: `docs/00-vision/strategic-hardening/pt-cross-surface-metric-provenance-governance-plan.md`
- ADR-039 Precis: `docs/00-vision/strategic-hardening/ADR-039 Measurement Layer — Overview Précis.md`
- Over-Engineering Guardrail: `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`

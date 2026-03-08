---
id: SCAFFOLD-001
title: "Feature Scaffold: Hardening Slice 0 — Standards Foundation"
owner: architect
status: Draft
date: 2026-03-07
---

# Feature Scaffold: Hardening Slice 0 — Standards Foundation

**Feature name:** hardening-slice-0-standards-foundation
**Owner / driver:** architect
**Stakeholders (reviewers):** product, engineering leads
**Status:** Draft
**Last updated:** 2026-03-07

## 1) Intent (what outcome changes?)

- **User story:** As an architect or engineer producing a new surface (dashboard page, report widget, API endpoint), I can look up the required rendering delivery pattern, data aggregation pattern, and metric provenance declaration — and know whether my EXEC-SPEC complies or must be rejected.
- **Success looks like:** The Surface Classification Standard can force a rendering/fetch choice for Slice 1's measurement UI. The Provenance Matrix can constrain freshness and reconciliation decisions for the 4 ADR-039 widgets. A bad EXEC-SPEC can be rejected by pointing to these documents.

## 2) Constraints (hard walls)

- **No code, no migrations.** This slice produces governance documents only. Zero database, service, or UI changes.
- **Scope ceiling: 4 provenance rows.** The matrix covers only ADR-039's 4 measurement artifacts. Expansion to shift/player/compliance surfaces happens in Slices 2-3.
- **Pattern recognition, not pattern invention.** The Surface Classification Standard must reference the proven pattern palette already in the codebase (RSC Prefetch, BFF RPC GOV-PAT-003, BFF Summary, Client-led). No new patterns. If no proven pattern cleanly fits, the EXEC-SPEC must stop and raise an ADR/standards amendment rather than inventing a local exception.
- **Enforceability test.** Both artifacts must be concrete enough to reject non-compliant work. Aspirational prose fails the gate. Specifically: every new surface spec must declare (1) rendering pattern chosen, (2) aggregation pattern chosen, (3) why other proven patterns were rejected, and (4) provenance class/freshness class for each surfaced metric. If any of those are missing, the spec is non-compliant.

## 3) Non-goals (what we refuse to do in this iteration)

- Provenance declarations for any metric outside ADR-039's 4 artifacts
- Runtime tooling, linters, or automated enforcement
- Materialized view or snapshot pipeline design
- Observability, E2E CI, or caching standards (Hardening Areas 2-4)
- Defining new architectural patterns not already proven in the codebase

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:**
  - Proven Pattern Palette (STANDARDS-FOUNDATION.md §Proven Pattern Palette)
  - Cross-Surface Provenance Governance Plan (pt-cross-surface-metric-provenance-governance-plan.md)
  - ADR-039 Measurement Layer Precis (4 artifacts: theo discrepancy, audit correlation, rating coverage, loyalty liability)
  - SRM §Measurement Layer (source table provenance for views/tables)
  - Existing surface implementations (Shift Dashboard V3, Rating Slip Modal, Admin Settings)
- **Outputs:** (both under `docs/70-governance/` — the matrix governs truth delivery, not just describes architecture)
  - `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` — rendering + aggregation policy
  - `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` — 4-row ADR-039 instantiation
- **Canonical contract(s):** None (documentation only)

## 5) Options (2 max — this is a governance doc, not a system design)

### Option A: Minimum Viable Standard (Pragmatic Subset)

Surface Classification Standard as a **decision matrix** — for any new surface, you answer 2 questions (rendering delivery + data aggregation) and the matrix tells you which pattern to use based on measurable criteria (context count, call frequency, initial paint sensitivity, interaction density).

Provenance Matrix uses a **pragmatic column subset** (~12 of 22 columns from the governance plan): Truth ID, Truth Class, Metric Name, Business Meaning, Surface(s), Formula/Rule, Source Tables, Computation Layer, Freshness Category, Invalidation Trigger, Reconciliation Path, Owner. Remaining columns (Consumer Class, Consumer Tolerance, Late Data Handling, Interpretation Basis, etc.) are deferred until a concrete metric actually needs them.

- **Pros:** Fast to produce. Easy to enforce. Low cognitive overhead for engineers reading the standard. Expansion points are explicit — columns can be added per-row when Slices 2-3 find they're needed.
- **Cons / risks:** May under-specify compliance-class metrics (but none of the 4 ADR-039 artifacts are compliance-class). Might need column additions earlier than expected if Slice 1 surfaces edge cases.
- **Cost / complexity:** Low (~4h authoring)
- **Security posture impact:** None (documentation only)
- **Exit ramp:** Add columns to the matrix when needed. The structure is additive — 12 columns now doesn't prevent 22 later.

### Option B: Full-Width Governance (Complete Framework)

Surface Classification Standard as a **full specification** — pattern catalogue with exhaustive selection criteria, edge case handling, escalation protocol for novel patterns, retroactive compliance audit checklist.

Provenance Matrix uses **all 22 columns** from the governance plan for each of the 4 ADR-039 rows. Every column populated even where the answer is "n/a" or "not applicable for this truth class."

- **Pros:** Complete from day one. No column-addition churn later. Compliance-ready if the 4 artifacts are ever reclassified.
- **Cons / risks:** Over-engineers for 4 documentation-only rows. Forces "n/a" fills that add noise. The enforceability test is harder — a 22-column matrix is harder to use as a rejection tool than a 12-column one. Violates the Over-Engineering Guardrail (YAGNI for columns no current metric needs). Risk of producing a "shrine" — impressive governance that nobody reads.
- **Cost / complexity:** Medium (~8h authoring), higher maintenance burden
- **Security posture impact:** None
- **Exit ramp:** Same as A — columns are additive either way.

## 6) Decision to make (explicit)

- **Decision:** Option A (Minimum Viable Standard) or Option B (Full-Width Governance)?
- **Decision drivers:**
  - Enforceability: Can the artifact reject a bad EXEC-SPEC? (A is more enforceable due to clarity)
  - YAGNI: Do 4 ADR-039 rows need 22 columns? (No — most "n/a" fills add noise)
  - Expansion cost: Is adding columns later expensive? (No — matrix structure is additive)
- **Recommendation:** Option A. The enforceability test is the success metric, not column count. A focused 12-column matrix with 4 concrete rows is a sharper governance tool than a 22-column matrix padded with "n/a". Slices 2-3 add columns when real metrics demand them.

## 7) Open questions / unknowns

- **Resolved:** Both deliverables live in `docs/70-governance/`. The matrix governs truth delivery — that is governance in function even though it describes architecture. Architecture docs (`docs/20-architecture/`) cross-link to them.
- Does the Provenance Matrix need a machine-readable format (JSON/YAML) or is Markdown table sufficient? Recommendation: Markdown for Slice 0 — machine-readable earns its way in if automated enforcement is ever built.
- Should the standard reference the Edge Transport Policy (`docs/20-architecture/EDGE_TRANSPORT_POLICY.md`) for API-layer guidance? Recommendation: Yes, cross-reference it for data aggregation decisions.

## 8) Definition of Done (thin)

- [ ] Decision recorded (this scaffold approved)
- [ ] Surface Classification Standard created and can force a rendering + aggregation choice
- [ ] ADR-039 Metric Provenance Matrix created with 4 rows
- [ ] Both artifacts cross-referenced from SRM or governance index
- [ ] Slice 1 EXEC-SPEC can cite both artifacts as constraints

## Links

- Feature Boundary: `docs/20-architecture/specs/hardening-slice-0-standards-foundation/FEATURE_BOUNDARY.md`
- Design Brief/RFC: (Phase 2)
- ADR(s): (Phase 4 — may produce ADR amendment or new ADR for surface governance)
- PRD: (Phase 5)
- Parent: `docs/00-vision/PT-ARCH-MAP/STANDARDS-FOUNDATION.md`
- Governance Plan: `docs/00-vision/strategic-hardening/pt-cross-surface-metric-provenance-governance-plan.md`
- ADR-039 Precis: `docs/00-vision/strategic-hardening/ADR-039 Measurement Layer — Overview Précis.md`

# Hardening Slice Manifest

> **Purpose**: Cross-slice observability for the PT-2 hardening effort
> **Updated**: After each slice merges to main
> **Parent**: Standards Foundation (STANDARDS-FOUNDATION.md)

---

## Slice Status

| Slice | Feature ID | Worktree | Status | Branch |
|---|---|---|---|---|
| 0 | `hardening-slice-0-standards-foundation` | `trees/hardening/slice-0` | Complete | `hardening-slice-0` |
| 1 | `hardening-slice-1-measurement-ui` | `trees/hardening/slice-1` | Pending | — |
| 2 | `hardening-slice-2-shift-provenance` | `trees/hardening/slice-2` | Pending | — |
| 3 | `hardening-slice-3-pit-refactor` | `trees/hardening-slice-3` | Complete | `hardening-slice-3` |

## Artifacts Produced

_Updated as each slice merges._

### Slice 0 — Standards Foundation
- Status: Complete
- Artifacts:
  - `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` — Two-axis decision matrix (Rendering Delivery × Data Aggregation) with proven patterns, selection criteria, and hard rejection gate
  - `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` — 12-column × 4-row provenance matrix for ADR-039 measurement artifacts (MEAS-001 through MEAS-004)
  - `docs/70-governance/examples/SLICE-1-MEASUREMENT-UI-DECLARATION.md` — Mock Slice 1 surface classification declaration (readiness validation)
- Amendments: —
- Cross-references: SRM §Measurement Layer updated with Governance Cross-References subsection

### Slice 1 — ADR-039 Measurement UI
- Status: Pending
- Artifacts: —
- Amendments to Slice 0: —

### Slice 2 — Shift Dashboard Provenance Alignment
- Status: Pending
- Artifacts: —
- Amendments to prior slices: —

### Slice 3 — Pit Dashboard RSC Refactor
- Status: Complete
- Branch: `hardening-slice-3`
- PRD: PRD-048
- Artifacts:
  - `hooks/dashboard/http.ts` — Extracted fetch functions (RSC-compatible, no HTTP loopback)
  - `hooks/dashboard/use-table-coverage.ts` — Coverage data hook (MEAS-003, client-fetched)
  - `app/(dashboard)/pit/page.tsx` — RSC prefetch + HydrationBoundary (3 queries via Promise.allSettled)
  - `components/pit-panels/analytics-panel.tsx` — Live coverage metrics + placeholder labeling
  - `services/measurement/dtos.ts` — Extended MeasurementFilters with gamingDay
  - `services/measurement/queries.ts` — Added gamingDay filter to queryRatingCoverage
  - `docs/70-governance/examples/SLICE-3-PIT-DASHBOARD-DECLARATION.md` — Surface Classification Declaration
- Amendments to prior slices:
  - `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` — MEAS-003 Surface(s) updated to include pit dashboard

---

## Direction Docs (committed to main before Slice 0)

| Document | Path | Role |
|---|---|---|
| Architecture Investigation Brief | `docs/00-vision/PT-ARCH-MAP/pt_architecture_investigation_brief.md` | Commissioned the investigation |
| Architecture Reality Report | `docs/00-vision/PT-ARCH-MAP/PT_ARCHITECTURE_REALITY_REPORT.md` | Investigation findings |
| Hardening Direction Plan | `docs/00-vision/PT-ARCH-MAP/pt2-hardening-direction-plan(scope-aligned).md` | Umbrella hardening direction |
| Standards Foundation | `docs/00-vision/PT-ARCH-MAP/STANDARDS-FOUNDATION.md` | Slice plan and pattern palette |
| Alignment Assessment | `docs/00-vision/PT-ARCH-MAP/pt-initial-slice-alignment-assessment.md` | Validation of slice strategy |
| Initiation Plan | `docs/00-vision/PT-ARCH-MAP/INITIATION-PLAN-MERGE-STRATEGY.md` | Worktree merge protocol |
| Cross-Surface Provenance Plan | `docs/00-vision/strategic-hardening/pt-cross-surface-metric-provenance-governance-plan.md` | Truth governance framework |
| ADR-039 Precis | `docs/00-vision/strategic-hardening/ADR-039 Measurement Layer — Overview Précis.md` | What ADR-039 built |
| Metric Provenance Matrix Plan | `docs/00-vision/strategic-hardening/adr-039-metric-provenance-matrix-plan.md` | Historical (superseded by cross-surface plan) |

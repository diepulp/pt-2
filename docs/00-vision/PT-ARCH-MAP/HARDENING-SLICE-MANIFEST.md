# Hardening Slice Manifest

> **Purpose**: Cross-slice observability for the PT-2 hardening effort
> **Updated**: After each slice merges to main
> **Parent**: Standards Foundation (STANDARDS-FOUNDATION.md)

---

## Slice Status

| Slice | Feature ID | Worktree | Status | Branch |
|---|---|---|---|---|
| 0 | `hardening-slice-0-standards-foundation` | `trees/hardening/slice-0` | Complete | `hardening-slice-0` |
| 1 | `hardening-slice-1-measurement-ui` | `trees/hardening-slice-0` | Complete | `hardening-slice-1` (PR #21, `324de01`) |
| 2 | `hardening-slice-2-shift-provenance` | `trees/hardening-slice-0` | Complete | `hardening-slice-2` |
| 3 | `hardening-slice-3-pit-refactor` | `trees/hardening/slice-3` | PR Review | `hardening-slice-3` (`7355567`) |

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
- Status: Complete (merged 2026-03-08, PR #21, commit `324de01`)
- EXEC-SPEC: `docs/21-exec-spec/EXEC-046-measurement-ui.md`
- Artifacts:
  - `services/measurement/` — MeasurementService (cross-cutting aggregator): DTOs, queries, mappers, service factory with `Promise.allSettled` partial-success
  - `app/api/v1/measurement/summary/route.ts` — BFF Summary Endpoint with dual-layer role guard (admin layout + handler-level)
  - `hooks/measurement/` — React Query integration: key factory, HTTP fetcher, `useMeasurementSummary` hook
  - `app/(dashboard)/admin/reports/page.tsx` — RSC page with server-side prefetch + HydrationBoundary (replaces placeholder stub)
  - `components/measurement/` — 4 metric widgets (theo discrepancy, audit correlation, rating coverage, loyalty liability), filter bar, freshness badge, dashboard layout
  - `e2e/measurement-reports.spec.ts` — E2E test for admin reports page
  - `docs/70-governance/examples/SLICE-1-MEASUREMENT-UI-DECLARATION.md` — Surface Classification + Provenance declaration (promoted from Slice 0 mock to real declaration)
  - `docs/50-ops/benchmarks/PRD-046-measurement-benchmark.md` — Benchmark methodology (EXPLAIN ANALYZE deferred to live DB)
- Amendments to Slice 0: Slice 0 mock declaration (`SLICE-1-MEASUREMENT-UI-DECLARATION.md`) replaced with real implementation declaration

### Slice 2 — Shift Dashboard Provenance Alignment
- Status: Complete
- PRD: `docs/10-prd/PRD-047-shift-provenance-alignment-v0.md`
- EXEC-SPEC: `docs/21-exec-spec/EXEC-047-shift-provenance-alignment.md`
- Design Brief: `docs/02-design/RFC-002-shift-provenance-alignment.md`
- Artifacts:
  - `docs/70-governance/audits/SLICE-2-SHIFT-METRIC-INVENTORY.md` — Component-level trace of 8 truth-bearing metric families (MEAS-005–012) across full derivation chain
  - `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` v2.0.0 — Expanded from 4 rows to 12 rows (MEAS-005–012 added with all 12 columns)
  - `docs/70-governance/examples/SLICE-2-SHIFT-DASHBOARD-DECLARATION.md` — Surface Classification Declaration (§5 compliant: 4 mandatory fields)
  - `docs/70-governance/audits/SLICE-2-CONSISTENCY-AUDIT.md` — 6-check consistency audit (6/6 PASS, zero unresolved duplicated derivation paths)
  - `docs/70-governance/audits/GOVERNANCE-AUDIT-TEMPLATE.md` — Reusable audit methodology template for Slice 3
- Amendments to prior slices:
  - `METRIC_PROVENANCE_MATRIX.md`: v1.0.0 → v2.0.0 (8 new rows, expanded SRM cross-reference table, updated expansion protocol next-available)
  - SRM §Measurement Layer Governance Cross-References: updated to reference MEAS-001–012 and link Slice 2 audit artifacts
- Key findings:
  - 8 MEAS rows (not 7 as planned) — Cash Obs Alerts split from Rollups due to materially different derivation path
  - Estimated drop source corrected: `table_buyin_telemetry`, not `pit_cash_observation` (PRD/RFC error corrected)
  - Active Visitors included as MEAS-012 (governed fact, not header chrome)
  - All existing shift governance docs complement, not conflict with, matrix rows

### Slice 3 — Pit Dashboard RSC Refactor
- Status: PR Review (commit `7355567`, branch `hardening-slice-3`)
- PRD: `docs/10-prd/PRD-048-pit-dashboard-rsc-refactor.md`
- EXEC-SPEC: `docs/21-exec-spec/EXEC-048-pit-dashboard-rsc-refactor.md`
- Design Brief: `docs/02-design/RFC-003-pit-dashboard-rsc-refactor.md`
- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-003-hardening-slice-3-pit-refactor.md`
- Artifacts:
  - `app/(dashboard)/pit/page.tsx` — RSC refactor: server-side prefetch + HydrationBoundary (converted from client-only shell)
  - `components/pit-panels/analytics-panel.tsx` — Live measurement coverage integration with table coverage metrics
  - `hooks/dashboard/` — Dashboard hook module: HTTP fetcher, key factory, types, `useTableCoverage` hook, refactored `useDashboardStats` and `useDashboardTables`
  - `hooks/dashboard/__tests__/http.test.ts` — HTTP fetcher unit tests
  - `hooks/dashboard/__tests__/use-table-coverage.test.ts` — Table coverage hook tests
  - `services/measurement/dtos.ts` + `queries.ts` — Extended measurement service with coverage query support
  - `docs/00-vision/PT-ARCH-MAP/SLICE-3-CONTEXT-SUMMARY.md` — Slice 3 context summary
  - `docs/01-scaffolds/specs/hardening-slice-3/FEATURE_BOUNDARY.md` — Feature boundary specification
  - `docs/01-scaffolds/specs/hardening-slice-3/SEC_NOTE.md` — Security note for Slice 3
  - `docs/70-governance/examples/SLICE-3-PIT-DASHBOARD-DECLARATION.md` — Surface Classification + Provenance declaration (§5 compliant)
- Amendments to prior slices:
  - `docs/70-governance/METRIC_PROVENANCE_MATRIX.md`: minor update
  - `components/pit-panels/panel-container.tsx`: minor refactor for RSC compatibility

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

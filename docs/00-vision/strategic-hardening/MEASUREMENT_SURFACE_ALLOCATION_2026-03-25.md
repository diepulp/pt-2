---
title: Measurement Surface Allocation — Verified State
date: 2026-03-25
status: Current
supersedes: MEASUREMENT_SURFACE_ALLOCATION_SUITABILITY.md
references:
  - ADR-039-measurement-layer.md
  - HARDENING_REPORT_2026-03-25.md
  - PRD-055-IMPLEMENTATION-PRECIS.md
  - PRD-056-IMPLEMENTATION-PRECIS.md
scope: UI surface ground-truth for ADR-039 artifact placement and admin route refactoring
method: Codebase verification (file existence + content audit, not documentation inference)
---

# Measurement Surface Allocation — Verified State

**Supersedes:** `MEASUREMENT_SURFACE_ALLOCATION_SUITABILITY.md` (2026-03-02, 80%+ stale)

This document records the **verified ground-truth** of all measurement and admin UI surfaces as of March 25, 2026. Every claim has been validated against the codebase — no documentation inference. Use this as the authoritative reference for admin route refactoring.

---

## 1. Admin Route Group — Complete

**Layout:** `app/(dashboard)/admin/layout.tsx` (46 lines)

| Capability | Status | Implementation |
|------------|--------|----------------|
| RSC role guard | **Operational** | Direct staff table lookup, `admin` + `pit_boss` allowed |
| Unauthorized redirect | **Operational** | `/shift-dashboard?toast=admin_required` |
| Auth redirect | **Operational** | `/signin` if no session |

**Route tree:**

```
/admin/                          → redirects to /admin/alerts
/admin/alerts/                   → AlertsPageClient (252 lines)
/admin/reports/                  → MeasurementReportsDashboard (RSC + prefetch)
/admin/settings/                 → redirects to /admin/settings/thresholds
/admin/settings/thresholds/      → ThresholdSettingsForm (8 categories)
/admin/settings/shifts/          → ShiftSettingsForm (gaming day, timezone)
/admin/settings/valuation/       → ValuationSettingsForm (cents_per_point, PRD-053)
/admin/loyalty/rewards/          → RewardListClient (CRUD catalog)
/admin/loyalty/rewards/[id]/     → Reward detail
/admin/loyalty/promo-programs/   → ProgramListClient (CRUD catalog)
/admin/loyalty/promo-programs/[id]/ → Program detail
```

**Sidebar navigation** (`components/layout/app-sidebar.tsx`, line 89-114):
All admin routes wired with `<AdminAlertBadge />` on the Admin group item.

---

## 2. Measurement Surfaces — ADR-039 Artifact Placement

### 2.1 Reports Page (`/admin/reports`) — Functional

**Status: COMPLETE.** Not a placeholder.

| Layer | File | Lines |
|-------|------|-------|
| RSC page | `app/(dashboard)/admin/reports/page.tsx` | 46 |
| Client dashboard | `components/measurement/measurement-reports-dashboard.tsx` | 94 |
| Theo discrepancy widget | `components/measurement/theo-discrepancy-widget.tsx` | ~120 |
| Audit correlation widget | `components/measurement/audit-correlation-widget.tsx` | ~120 |
| Rating coverage widget | `components/measurement/rating-coverage-widget.tsx` | ~120 |
| Loyalty liability widget | `components/measurement/loyalty-liability-widget.tsx` | 98 |

**Data layer:**

| Layer | File | Purpose |
|-------|------|---------|
| Service | `services/measurement/queries.ts` | BFF queries (single server call for all 4 metrics) |
| DTOs | `services/measurement/dtos.ts` | Type-safe interfaces per metric |
| Mappers | `services/measurement/mappers.ts` | Row-to-DTO transforms |
| Schemas | `services/measurement/schemas.ts` | Zod validation |
| Index | `services/measurement/index.ts` | Factory export |
| Hooks | `hooks/measurement/use-measurement-summary.ts` | React Query wrapper |
| HTTP | `hooks/measurement/http.ts` | `fetchMeasurementSummary()` |
| Keys | `hooks/measurement/keys.ts` | Query key factory |

**ADR-039 Artifact Mapping:**

| Artifact | Widget | Status |
|----------|--------|--------|
| D2-1: `computed_theo_cents` + `legacy_theo_cents` | Theo Discrepancy Widget | **Operational** (discrepancy rate, total cents, breakdown) |
| D2-2: `measurement_audit_event_correlation_v` | Audit Correlation Widget | **Operational** (cross-context trace summary) |
| D2-3: `measurement_rating_coverage_v` | Rating Coverage Widget | **Operational** (rated ratio, coverage tier) |
| D2-4: `loyalty_liability_snapshot` | Loyalty Liability Widget | **Operational** (points, dollar value, player count) |

### 2.2 Shift Dashboard (`/shift-dashboard`) — Expansion Slots Available

**Status: Operational with 3 unfilled expansion slots.**

| Component | Lines | Purpose |
|-----------|-------|---------|
| `shift-dashboard-v3.tsx` | 299 | Main orchestrator (three-panel layout) |
| `coverage-widget.tsx` | 210 | PRD-049 WS1 coverage display |
| 6 trust components | 474 | `CoverageBar`, `MetricGradeBadge`, `ProvenanceTooltip`, etc. |
| `alerts-strip.tsx` | 255 | Center panel alert display |
| `metrics-table.tsx` | 336 | Per-pit/table drill-down |

**Unfilled expansion slots** (verified in `shift-dashboard-v3.tsx`):

| Slot | Line | Location | Ready For |
|------|------|----------|-----------|
| `data-slot="theo-kpi"` | 205 | Left rail, below QualitySummaryCard | Theo discrepancy summary card |
| `data-slot="trending-charts"` | 250 | Center panel, below metrics table | Historical coverage trends |
| `data-slot="theo-sidebar"` | 275 | Right rail, below QualityDetailCard | Theo detail panel |

**Effort to fill:** Small per slot — create component + hook, drop into existing div. No layout changes.

### 2.3 Pit Terminal (`/pit`) — PendingSection Markers

**Status: Operational with expansion markers.**

| Component | Purpose |
|-----------|---------|
| `PitPanelsDashboardLayout` | Resizable dual-panel (left: floor view, right: vertical split) |
| `PendingSection` (2 usages) | Placeholder UI for under-construction sections |
| Table grid tiles | Per-table state rendered; coverage badge not yet added |

**Remaining work:** Add per-table `rated_ratio` badge/indicator to table grid tiles. Data source: `measurement_rating_coverage_v` (deployed). Effort: Small.

### 2.4 Rating Slip Modal — Audit Trace Built

**Status: COMPLETE.**

| Component | Lines | Purpose |
|-----------|-------|---------|
| `rating-slip-modal.tsx` | 874 | Main form modal (no tabs — collapsible sections) |
| `audit-trace-section.tsx` | 287 | Collapsible audit chain (lazy-fetch on expand) |

**Implementation approach:** Collapsible section (Approach A from original doc). Not tab refactor.

**Data flow:** `useAuditEventCorrelation(slipId)` → `measurement_audit_event_correlation_v` → displays chain: slip → PFT → MTL → loyalty ledger with timestamps and actor attribution.

**Graceful degradation:** Shows lineage chain without `audit_log` entries. Audit-enriched variant awaits `audit_log` UPDATE/DELETE denial policies (Wedge B residual).

### 2.5 Compliance Dashboard (`/compliance`) — No Changes Needed

**Status: Operational. Not a measurement surface target.** Confirmed correct per original doc — audit trace belongs in slip drill-down, not compliance dashboard.

---

## 3. Shift Intelligence Surfaces — PRD-055 + PRD-056

These surfaces were not in the original allocation doc (which predated Wedge C implementation).

### 3.1 Admin Alerts (`/admin/alerts`)

| Component | Lines | Purpose |
|-----------|-------|---------|
| `alerts-page-client.tsx` | 252 | Dual-section: Baseline Alerts + Cash Observation Alerts |
| `acknowledge-alert-dialog.tsx` | 103 | Notes + false-positive flag |
| `alert-detail-card.tsx` | 130 | Per-alert card |
| `severity-filter.tsx` | 68 | Badge-based severity filter |

**Features:** Persist-on-mount trigger, refresh button, severity filtering, acknowledge workflow, source badges (Baseline teal / Cash Obs amber).

### 3.2 Shift Dashboard Alerts Panel

| Component | Lines | Purpose |
|-----------|-------|---------|
| `alerts-panel.tsx` | 322 | Unified: baseline anomaly + cash obs spike alerts |
| `BaselineAlertItem` | (inline) | Per-alert with acknowledge button |

**Features:** Persist-on-mount, refresh button, acknowledge dialog (shared), 30s refetch for live ephemeral alerts.

### 3.3 Shift Intelligence Components

| Component | Lines | Purpose |
|-----------|-------|---------|
| `anomaly-alert-card.tsx` | 122 | Anomaly visualization (severity, deviation, direction) |
| `baseline-coverage-banner.tsx` | 37 | Coverage gap indicator |
| `recompute-baselines-button.tsx` | 49 | Manual baseline refresh |

### 3.4 Shift Intelligence Hooks

| Hook | Purpose |
|------|---------|
| `use-anomaly-alerts.ts` | `useAnomalyAlerts()` — 30s polling for ephemeral alerts |
| `use-compute-baselines.ts` | `useComputeBaselines()` — mutation for baseline refresh |
| `use-shift-alerts.ts` | `useShiftAlerts()`, `usePersistAlerts()`, `useAcknowledgeAlert()` — persistent alerts |

---

## 4. SQL Measurement Views — Both Deployed

| View | Migration | Security | Status |
|------|-----------|----------|--------|
| `measurement_audit_event_correlation_v` | `20260307115131` | `security_invoker=true` | **Deployed** — joins slip → PFT → MTL → loyalty_ledger |
| `measurement_rating_coverage_v` | `20260307115131` | `security_invoker=true` | **Deployed** — rated_seconds, rated_ratio, coverage_tier. Ghost/idle = 0 (MVP) |

Both granted SELECT to `authenticated`.

---

## 5. Remaining Gaps (3 items)

| # | Gap | Surface | Effort | Blocker |
|---|-----|---------|--------|---------|
| 1 | **Pit terminal per-table coverage badge** | Table grid tiles in `/pit` | Small | None — view deployed |
| 2 | **Shift dashboard slot fills** (theo-kpi, trending-charts, theo-sidebar) | Data-slot divs in ShiftDashboardV3 | Small per slot | None — slots + views exist |
| 3 | **Ghost/idle time accounting** in coverage view | `measurement_rating_coverage_v` | Small | ADR-038 table lifecycle contract |

**Total remaining effort:** ~3-5 days for all three. No architectural work. Pure component + hook wiring.

---

## 6. Implications for Admin Route Refactoring

The admin route group is **stable infrastructure**, not scaffolding. Any refactoring should treat the following as load-bearing:

**Do not break:**
- `app/(dashboard)/admin/layout.tsx` — role guard is security-critical
- Route structure (`/alerts`, `/reports`, `/settings/*`, `/loyalty/*`) — sidebar nav depends on these paths
- `MeasurementReportsDashboard` BFF prefetch pattern — RSC with dehydration
- Settings tabbed layout at `admin/settings/layout.tsx`

**Safe to refactor:**
- Component internals (alerts-page-client, individual widgets)
- Visual styling (all components follow PT-2 Visual DNA but can be enhanced)
- Settings form layouts (threshold cards, shift form, valuation form)
- Alert card rendering (currently inline cards, could extract shared component)

**Stale documents to ignore during refactoring:**
- `ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md` — §2 (layout), §4 (routes), §8-§11 (file structure, validation) are fictional. Only §3.1 (KPI accent bars), §3.2 (telemetry treatment), §5 (colors), §6 (typography), §7 (loading states) remain valid.
- `MEASUREMENT_SURFACE_ALLOCATION_SUITABILITY.md` — superseded by this document.

---

*Verified 2026-03-25 via codebase audit (file existence + content, not documentation inference). 54+ routes/components, 20,000+ lines confirmed.*

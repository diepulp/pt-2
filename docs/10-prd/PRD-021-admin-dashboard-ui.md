# PRD-021 — Admin Dashboard UI (Shift Dashboards Phase 1)

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Created:** 2026-01-07
- **Summary:** Implement the Admin Dashboard, a dedicated administrative interface at `/admin/*` for shift supervisors and casino management to view operational telemetry, KPI rollups, and alerts. This is **NOT a patch to the Pit Dashboard** — it is a separate feature targeting a different user persona (management vs. pit operations). The dashboard surfaces cash observation telemetry from the backend RPCs defined in the Shift Dashboards EXECUTION-SPEC.

## 2. Problem & Goals

### 2.1 Problem

Casino shift supervisors and management lack visibility into operational telemetry and KPI rollups during shifts. Currently:

- No consolidated view of Drop, Win, Hold%, and Theo metrics across casino/pit/table grains
- No visibility into cash observation telemetry (estimates vs. confirmed amounts)
- No alerting for anomalous cash-out patterns (spike detection)
- Management must rely on end-of-shift reports rather than real-time operational awareness

The Pit Dashboard serves pit bosses for real-time table operations, but management needs a separate administrative view focused on telemetry aggregation and trend analysis.

### 2.2 Goals

1. **Operational visibility**: Shift supervisors can view KPI rollups (Drop, Win, Hold%, Theo) at casino, pit, and table grains within 2 seconds of page load
2. **Telemetry awareness**: Cash observation estimates and confirmed totals are displayed with clear TELEMETRY labeling to distinguish from authoritative metrics
3. **Alert surfacing**: Spike alerts (cash-out thresholds exceeded) appear in a dedicated alerts panel grouped by severity
4. **Time window flexibility**: Users can filter metrics by preset time windows (8h, current shift) or custom date ranges
5. **Visual distinction**: Telemetry data is never confused with authoritative Drop/Win/Hold metrics (amber dashed borders, TELEMETRY badges)

### 2.3 Non-Goals

- **NOT patching Pit Dashboard** — This is a standalone `/admin/*` route tree
- **Mobile optimization** — Desktop-first for shift supervisor workstations
- **Promo exposure metrics** — Deferred to scaffold only; backend not ready
- **Shift report export** — Separate PRD for reporting workflows
- **Alert threshold configuration UI** — Settings page is scaffold only in Phase 1
- **Real-time WebSocket updates** — Periodic refresh (30s-5min) sufficient for management view

## 3. Users & Use Cases

- **Primary users:** Shift Supervisors, Casino Management, Floor Managers

**Top Jobs:**

1. As a **Shift Supervisor**, I need to see aggregated KPIs (Drop, Win, Hold%, Theo) for my casino so that I can assess shift performance at a glance.

2. As a **Shift Supervisor**, I need to drill down from casino to pit to table level so that I can identify which areas are performing above or below expectations.

3. As a **Casino Manager**, I need to see cash observation telemetry (estimates vs. confirmed) so that I can monitor cash movement patterns during the shift.

4. As a **Shift Supervisor**, I need to see alerts when cash-out observations exceed thresholds so that I can investigate potential anomalies.

5. As a **Floor Manager**, I need to filter metrics by time window so that I can compare performance across different periods.

6. As a **Shift Supervisor**, I need to see top movers (biggest deltas in win/theo) so that I can quickly identify tables requiring attention.

## 4. Scope & Feature List

### P0 (Must-Have for Phase 1)

- **Admin routes**: Dedicated `/admin/*` route tree (uses existing `AppSidebar` with ADMINISTRATIVE nav group)
- **KPI card grid**: Drop, Win, Hold%, Theo with icon + metric + trend pattern
- **Time window picker**: Presets (8h, current shift) and custom date range
- **Casino view**: Top-level KPI rollups for entire casino
- **Pit view**: Per-pit KPI rollups with drill-down
- **Table view**: Per-table KPI rollups and event context
- **Cash observations panel**: Telemetry section with amber dashed border and TELEMETRY badge
- **Alerts panel**: Spike alerts grouped by severity (CRITICAL, WARN)
- **Skeleton loading**: Loading states for all async data (no spinners)

### P1 (Should-Have)

- **Table rollups chart**: Bar chart comparing tables using shadcn/ui charts
- **Top movers widget**: Tables with biggest win/theo delta
- **View grain tabs**: Casino / Pit / Table tab navigation
- **Alert count badge**: Sidebar nav shows active alert count

### P2 (Nice-to-Have / Scaffold Only)

- **Promo exposure panel**: Scaffold UI, pending backend
- **Settings > Thresholds page**: Scaffold for alert threshold configuration
- **Settings > Shifts page**: Scaffold for shift schedule configuration
- **Reports page**: Scaffold for shift report export

## 5. Requirements

### 5.1 Functional Requirements

- Dashboard displays at `/admin/shift` with redirect from `/admin`
- Navigation via existing `AppSidebar` ADMINISTRATIVE group (Shift Dashboard, Alerts, Reports) with collapsible tree structure
- KPI cards display Drop, Win, Hold%, Theo with trend badges (vs. baseline)
- Trend expressed as percentage vs. baseline mean (Option C from design decisions)
- Time window picker updates all queries when changed
- Casino view shows single-row rollup for entire casino
- Pit view shows per-pit rollups with drill-down links
- Table view shows per-table rollups with event timeline context
- Cash observations panel displays:
  - `cash_out_observed_estimate_total`
  - `cash_out_observed_confirmed_total`
  - `cash_out_observation_count`
  - `cash_out_last_observed_at`
- All cash observation displays include TELEMETRY badge and amber visual treatment
- Alerts panel fetches from `rpc_shift_cash_obs_alerts` and groups by severity
- Alert cards show: entity label, observed value, threshold, message

### 5.2 Non-Functional Requirements

- p95 LCP ≤ 2.0s for casino/pit views
- p95 LCP ≤ 5.0s for table view (event timeline joins)
- Stale-while-revalidate pattern: 30s stale, 5min gcTime
- 12-column responsive grid (4-col desktop, 2-col tablet, 1-col mobile for KPI cards)
- Dark mode support via shadcn/ui theming
- Accessibility: WCAG 2.1 AA compliant (keyboard nav, screen reader labels)

> Architecture, schema, and API details in related documents (see Section 9).

## 6. UX / Flow Overview

**Primary Flow: View Shift KPIs**

1. Shift Supervisor navigates to `/admin` → Redirected to `/admin/shift`
2. Dashboard loads with casino-level KPIs in card grid
3. Time window defaults to "Current shift" based on casino gaming day
4. Supervisor reviews Drop, Win, Hold%, Theo metrics
5. Supervisor scrolls to Cash Observations panel (visually distinct, amber border)
6. Supervisor reviews telemetry estimates vs. confirmed totals

**Secondary Flow: Drill Down to Table**

1. Supervisor clicks "Pit A" in pit leaderboard
2. View updates to Pit A rollups with table list
3. Supervisor clicks "Table T3" in table grid
4. View updates to Table T3 detail with event timeline context

**Alert Flow:**

1. Supervisor sees alert badge on sidebar (e.g., "3")
2. Clicks "Alerts" in sidebar → Alerts page loads
3. Alerts grouped by severity: CRITICAL first, then WARN
4. Each alert shows entity, observed value, threshold, action link

```
Admin Dashboard Layout (uses unified AppSidebar):
┌─────────────────────────────────────────────────────────────┐
│ [PT] │ Shift Dashboard       │ Search │ Theme │ User       │
├──────┼──────────────────────────────────────────────────────┤
│      │ ┌─────────┬─────────┬─────────┬─────────┐            │
│OPER- │ │ Drop    │ Win     │ Hold%   │ Theo    │  KPIs     │
│ATION │ │ +5.2%   │ -1.1%   │ 18.3%   │ +3.4%   │           │
│ Pit ▶│ └─────────┴─────────┴─────────┴─────────┘            │
│ Play▶│                                                      │
│ Loya▶│ ┌──────────────────────────────────────────┐         │
│ Comp▶│ │ Cash Observations          [TELEMETRY]  │         │
│──────│ │ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │         │
│ADMIN │ │ Estimate: $45,200  Confirmed: $38,100   │         │
│Shift▼│ │ Count: 127         Last: 10:34 AM      │         │
│ ├Over│ └──────────────────────────────────────────┘         │
│ ├Cash│                                                      │
│ └Staf│ ┌─────────────────┬────────────────────────┐         │
│Alert │ │ Top Movers      │ Active Alerts          │         │
│Repor │ │ T3: +$12,400    │ ⚠ T5: Spike detected  │         │
│──────│ │ T7: +$8,200     │ ⚠ Pit B: High cash-out│         │
│OTHER │ └─────────────────┴────────────────────────┘         │
│Setti▶│                                                      │
│      │ ┌──────────────────────────────────────────┐         │
│      │ │ Table Grid / Pit Leaderboard             │         │
│      │ └──────────────────────────────────────────┘         │
└──────┴──────────────────────────────────────────────────────┘
```

> **Navigation:** Admin routes are accessed via the **ADMINISTRATIVE** group in the unified `AppSidebar`. The sidebar uses collapsible tree navigation with semantic grouping (OPERATIONAL, ADMINISTRATIVE, OTHER).

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| `rpc_shift_cash_obs_table` | ✅ Complete | Table-grain rollups |
| `rpc_shift_cash_obs_pit` | ✅ Complete | Pit-grain rollups |
| `rpc_shift_cash_obs_casino` | ✅ Complete | Casino-grain rollups |
| `rpc_shift_cash_obs_alerts` | ✅ Complete | Spike alerts |
| CasinoService | ✅ Complete | Gaming day, settings |
| shadcn/ui chart component | Available | `npx shadcn@latest add chart` |
| AppSidebar (grouped navigation) | ✅ Complete | ADMINISTRATIVE group with admin routes |
| Pit Dashboard (existing) | ✅ Complete | Reference patterns only |

**Backend RPCs Ready:** All shift cash observation RPCs are implemented per EXECUTION-SPEC WS1-WS2.

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| Promo exposure backend not ready | Scaffold UI only; defer data integration |
| Large table counts may affect table view | Paginate or virtualize if >50 tables |
| Alert threshold defaults may need tuning | Use configurable defaults from `casino_settings` |

**Resolved Questions:**

1. Admin Dashboard vs Pit Dashboard patch? → **Decision:** Standalone `/admin/*` route tree
2. Baseline trend calculation? → **Decision:** Percentage vs. baseline mean (Option C)
3. Telemetry visual treatment? → **Decision:** Amber dashed border + TELEMETRY badge
4. Table grid in Casino view? → **Decision:** Include as scaffold
5. Top Movers in Phase 1? → **Decision:** Include in P0
6. Separate admin sidebar vs unified sidebar? → **Decision:** Reuse existing `AppSidebar` with semantic nav groups (OPERATIONAL, ADMINISTRATIVE, OTHER)

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `/admin/shift` route loads with KPI card grid (Drop, Win, Hold%, Theo)
- [ ] Time window picker updates all queries (8h, current shift, custom)
- [ ] Casino/Pit/Table view grains accessible via navigation
- [ ] Cash observations panel displays telemetry with TELEMETRY badge
- [ ] Alerts panel shows spike alerts grouped by severity
- [x] Sidebar navigation functional with correct routes (ADMINISTRATIVE group in AppSidebar)

**Data & Integrity**
- [ ] KPI values match backend RPC responses
- [ ] Telemetry metrics never displayed alongside authoritative metrics without visual separation
- [ ] Empty states display correctly when no data exists
- [ ] Time window changes correctly filter all displayed data

**Security & Access**
- [ ] Dashboard respects RLS (user only sees their casino's data)
- [ ] Only authorized roles can access `/admin/*` routes
- [ ] API calls require authenticated session

**Testing**
- [ ] Unit tests for dashboard hooks (query composition)
- [ ] Component tests for KPI cards, alerts panel, cash obs panel
- [ ] E2E test: Load dashboard → Change time window → Drill to table

**Operational Readiness**
- [ ] Skeleton loading states for all async data
- [ ] Error states display user-friendly messages with retry
- [ ] p95 LCP ≤ 2.0s verified for casino view

**Documentation**
- [ ] Component props documented
- [ ] Stylistic patterns documented in reference file

## 9. Related Documents

- **Vision / Strategy:** `docs/00-vision/VIS-001-VISION-AND-SCOPE.md`
- **Stylistic Direction:** `docs/00-vision/shift-dashboards/ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md`
- **UI Context:** `.claude/skills/frontend-design-pt-2/references/shift-dashboards-context.md`
- **Metrics Catalog:** `docs/00-vision/shift-dashboards/SHIFT_METRICS_CATALOG_v0_PATH_B_PATCH_cash-observations.md`
- **PRD (Backend):** `docs/10-prd/PRD-Shift-Dashboards-Shift-Reports-v0.2_PATCH_cash-observations.md`
- **Execution Spec:** `docs/20-architecture/specs/PRD-SHIFT-DASHBOARDS-v0.2-PATCH/EXECUTION-SPEC.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Database Types:** `types/database.types.ts`
- **RLS Policy Matrix:** `docs/30-security/SEC-001-rls-policy-matrix.md`

## 10. File Structure

```
# Existing sidebar (already implemented)
components/layout/
├── app-sidebar.tsx               # Unified sidebar with grouped navigation
├── nav-main.tsx                  # Grouped nav with collapsible trees
└── nav-user.tsx                  # User menu

# New admin routes
app/(dashboard)/admin/
├── layout.tsx                    # Admin layout (inherits dashboard layout)
├── page.tsx                      # Redirect to /admin/shift
├── shift/
│   ├── page.tsx                  # Shift dashboard main view
│   └── loading.tsx               # Skeleton loading UI
├── alerts/
│   └── page.tsx                  # Alert management
├── reports/
│   └── page.tsx                  # Shift reports (scaffold)
└── settings/
    ├── page.tsx                  # Settings index
    ├── thresholds/
    │   └── page.tsx              # Alert thresholds (scaffold)
    └── shifts/
        └── page.tsx              # Shift schedules (scaffold)

# Admin-specific components (page content only, no sidebar)
components/admin/
└── shift-dashboard/
    ├── kpi-card.tsx              # Single KPI card
    ├── kpi-cards.tsx             # KPI card grid
    ├── cash-obs-panel.tsx        # Telemetry panel (amber styling)
    ├── alerts-panel.tsx          # Active alerts grouped by severity
    ├── table-rollups-chart.tsx   # Bar chart comparison
    ├── top-movers-widget.tsx     # Top movers display
    ├── time-window-picker.tsx    # Shift time selector
    └── telemetry-badge.tsx       # Reusable TELEMETRY badge

hooks/admin/
├── use-shift-kpis.ts             # KPI rollup queries
├── use-shift-cash-obs.ts         # Cash observation queries
├── use-shift-alerts.ts           # Alert queries
├── keys.ts                       # Query key factory
└── index.ts                      # Export aggregator
```

> **Note:** Admin routes use the existing `(dashboard)` layout which includes `AppSidebar`. No separate admin sidebar is needed.

---

**Revision History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-07 | Lead Architect | Initial draft |
| 1.1 | 2026-01-09 | Lead Architect | Updated to reuse existing AppSidebar with grouped navigation (no separate admin-sidebar.tsx) |

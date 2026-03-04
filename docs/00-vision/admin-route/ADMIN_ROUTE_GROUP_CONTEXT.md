---
title: "Admin Route Group — Feature Inventory, Context Map & Suitability Findings"
date: 2026-03-03
status: Findings
scope: Admin route group requirements, ADR-039 surface allocation, staleness audit
references:
  - docs/80-adrs/ADR-039-measurement-layer.md
  - docs/00-vision/strategic-hardening/ADR_0XX_B_Measurement_Surface_Allocation.md
  - docs/00-vision/strategic-hardening/PT2_Measurement_Surface_Guidance.md
  - docs/00-vision/shift-dashboards/ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md
  - docs/10-prd/_archive/PRD-021-admin-dashboard-ui.md
---

# Admin Route Group — Feature Inventory, Context Map & Suitability Findings

## 1. Executive Summary

The `/admin` route group was planned in PRD-021 (archived, never implemented). Four
sidebar navigation items point to non-existent routes. The Shift Dashboard was built
at `/shift-dashboard` instead of the planned `/admin/shift`, diverging from the
original PRD route tree.

Five feature streams converge on this route group. Two are unblocked today (alerts,
settings). One depends on ADR-039 Phase 1 migrations (reports/measurement). The admin
route is a **general infrastructure need**, not an ADR-039 deliverable — ADR-039
touches it tangentially through the Reports page.

**Operative principle** (from PT2_Measurement_Surface_Guidance.md):
*"Do not create new pages unless they pay rent."*

---

## 2. Ghost Navigation Inventory

Four sidebar items in `components/layout/app-sidebar.tsx` reference non-existent routes:

| Nav Item | Route | Line | Group | Icon | Status |
|---|---|---|---|---|---|
| Alerts | `/admin/alerts` | 101-105 | Administrative | `Bell` | Ghost — `badge: 0` with `// TODO: Connect to real alert count` |
| Reports | `/admin/reports` | 107-109 | Administrative | `FileText` | Ghost — no backing route |
| Thresholds | `/admin/settings/thresholds` | 124 | Other/Settings | (child of Settings) | Ghost — no backing route |
| Shifts | `/admin/settings/shifts` | 125 | Other/Settings | (child of Settings) | Ghost — no backing route |

No `app/(dashboard)/admin/` or `app/(protected)/admin/` directory exists. No admin
layout, no admin middleware, no `components/admin/` namespace.

---

## 3. Feature Streams Requiring the Admin Route

### 3.1 Alerts — BACKEND READY, FRONTEND MISSING

| Aspect | Detail |
|---|---|
| **Backend** | `rpc_shift_cash_obs_alerts()` fully implemented. Severity guardrails working (GOOD→critical, LOW→warn cap, NONE→info cap). |
| **Frontend gap** | No route, no page, no alert detail component, no alert history view. |
| **Sidebar gap** | Badge count hardcoded to 0. Needs live query from `useCashObsAlerts()`. |
| **What the page shows** | Alert drill-down: entity label, observed value, threshold, severity, downgrade indicators. Historical alerts with acknowledge/dismiss. |
| **Persona** | Shift supervisor, casino management |
| **Dependencies** | None — can ship immediately once route exists |

### 3.2 Reports (ADR-039 Measurement Surfaces) — BLOCKED BY PHASE 1

The Measurement Surface Guidance routes two of four ADR-039 artifacts to the Reports page:

**Panel 1: Loyalty Liability**
- `total_outstanding_points` (canonical truth from append-only ledger)
- `estimated_monetary_value_cents` (policy-based — **must** label "Estimated liability")
- 7/30/90 day trend chart
- CSV export
- **Blocked by:** `loyalty_liability_snapshot` table, `rpc_snapshot_loyalty_liability` RPC, `loyalty_valuation_policy` table — none exist yet

**Panel 2: Theo Discrepancy (future)**
- % variance between `legacy_theo_cents` and `computed_theo_cents` across closed slips
- Casino-level aggregate report
- **Blocked by:** `rating_slip` column additions (`computed_theo_cents`, `legacy_theo_cents`) — not yet migrated

**What does NOT go here:**
- Rating coverage → Shift Dashboard expansion slots + Pit Terminal (operational, shift-actionable)
- Audit event correlation → Rating Slip Modal collapsible "Audit Trace" panel (investigative drill-down)

### 3.3 Settings: Alert Thresholds — BACKEND READY

| Aspect | Detail |
|---|---|
| **Current state** | Thresholds hardcoded: $5K per table, $20K per pit (in `SHIFT_SEVERITY_ALLOWLISTS_v1.md`) |
| **Target** | Configurable via `casino_settings.alert_thresholds` (JSON) |
| **Frontend gap** | No settings UI exists |
| **Future** | Baseline-based thresholds (7-day rolling median ± 3×MAD), per-casino configuration |
| **Dependencies** | None — `casino_settings` table exists, write path TBD |

### 3.4 Settings: Shift Schedules — BACKEND READY

| Aspect | Detail |
|---|---|
| **Current state** | `gaming_day` and `shift` tables exist |
| **Frontend gap** | No schedule config UI |
| **What the page shows** | Gaming day window definitions, shift presets, temporal boundaries |
| **Dependencies** | None — tables exist |

### 3.5 Financial & Operational Reporting (Future Expansion)

| Content | Source | Priority |
|---|---|---|
| Financial transaction CSV export | `PlayerFinancialService` — API routes exist, export endpoint missing | Post-MVP |
| Shift checkpoint delta report | `table_rundown_report`, `shift_checkpoint` (PRD-038) | Post-MVP |
| Legacy theo migration validation | `rating_slip.legacy_theo_cents` — transitional admin tooling | Migration phase only |

---

## 4. What Does NOT Belong in the Admin Route

| Content | Correct Location | Reason |
|---|---|---|
| Rating coverage (per-table + aggregates) | Shift Dashboard expansion slots + Pit Terminal | Actionable within shift — operational |
| Audit event correlation (per-slip lineage) | Rating Slip Modal → collapsible panel | Investigative drill-down, not dashboard |
| Shift KPIs (Win/Loss, Fills, Credits, Drop) | `/shift-dashboard` (stays) | Already implemented, real-time operational |
| MTL compliance tracking | `/compliance` (stays) | Different persona, different workflow |
| Cash observations | Shift Dashboard right rail (stays) | Telemetry — operational, shift-level |

---

## 5. Proposed Route Structure

```
app/(dashboard)/admin/
├── layout.tsx                  # Role guard (admin, pit_boss) + shared admin chrome
├── page.tsx                    # Redirect to /admin/reports
├── reports/
│   └── page.tsx                # Panel 1: Loyalty Liability (ADR-039 Artifact 4)
│                               # Panel 2: Theo Discrepancy (ADR-039 Artifact 1) — when ready
│                               # CSV export controls
├── alerts/
│   └── page.tsx                # Alert drill-down, history, acknowledge
│                               # Wires sidebar badge count
└── settings/
    ├── thresholds/
    │   └── page.tsx            # Alert threshold configuration
    └── shifts/
        └── page.tsx            # Shift schedule definition
```

Four pages. Each pays rent.

---

## 6. Dependency Chain

```
                    ┌──────────────────────────┐
                    │ Admin Layout + Role Guard  │ ← prerequisite for all pages
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                   ▼
    ┌─────────────────┐  ┌─────────────┐  ┌──────────────────┐
    │ /admin/reports   │  │/admin/alerts│  │/admin/settings/* │
    │                  │  │             │  │                  │
    │ Needs:           │  │ Needs:      │  │ Needs:           │
    │ • ADR-039 Ph1    │  │ • Nothing   │  │ • Nothing new    │
    │   migrations     │  │   (backend  │  │   (settings      │
    │ • Loyalty snap   │  │    READY)   │  │    tables exist)  │
    │   table + RPC    │  │             │  │                  │
    │ • Valuation      │  │ Unblocks:   │  │ Unblocks:        │
    │   policy table   │  │ • sidebar   │  │ • configurable   │
    │ • Recharts chart │  │   badge     │  │   thresholds     │
    │                  │  │   count     │  │   (replaces      │
    │ BLOCKED by:      │  │             │  │    hardcoded     │
    │ ADR-039 Phase 1  │  │ UNBLOCKED   │  │    $5K/$20K)     │
    └─────────────────┘  └─────────────┘  └──────────────────┘
```

**Alerts and settings are unblocked today.** Only `/admin/reports` depends on ADR-039
Phase 1 migrations. The admin route group can be built incrementally.

---

## 7. Role Gating — Infrastructure Gap

No route-level role enforcement exists today. The auth pipeline (ADR-024, ADR-030)
provides `staff_role` in the session context (`app.staff_role` via `SET LOCAL`), but no
Next.js layout or middleware enforces role-based route access.

**Options:**
- Layout-level guard in `app/(dashboard)/admin/layout.tsx` checking `staff_role`
- Middleware-based redirect in `middleware.ts`
- Component-level guard (least desirable — leaks role logic into components)

This is a prerequisite for all admin pages and should be built as reusable infrastructure.

---

## 8. Existing Shift Dashboard — Relationship to Admin Route

The Shift Dashboard V3 at `/shift-dashboard` is **not moving** to `/admin/shift`. It was
built at its current location, has 25+ components, 11 query hooks, BFF consolidation, and
is production-ready. The relationship is:

| Surface | Route | Purpose | Update Frequency |
|---|---|---|---|
| Shift Dashboard | `/shift-dashboard` | Real-time operational KPIs, alerts strip, drill-down | 30s refresh |
| Admin Alerts | `/admin/alerts` | Alert management, history, acknowledge/dismiss | On-demand |
| Admin Reports | `/admin/reports` | Executive/finance reporting, trends, exports | Daily/weekly |
| Admin Settings | `/admin/settings/*` | Configuration (thresholds, shifts) | Infrequent |

The Shift Dashboard **feeds** the admin route (same backend RPCs for alerts) but serves a
different temporal context — the admin route is for review and configuration, not real-time
monitoring.

**Shift Dashboard expansion slots** (`data-slot="utilization-timeline"`,
`data-slot="theo-kpi"`, etc.) absorb the operational measurement artifacts (rating
coverage, theo summary). They do not route through `/admin`.

---

## 9. ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md — Staleness Audit

**File:** `docs/00-vision/shift-dashboards/ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md`
**Created:** 2026-01-07 | **Marked:** `status: approved`

### 9.1 The `/admin` Route Was Never Built

PRD-021 proposed `app/(dashboard)/admin/` with sub-routes. **This was archived without
implementation.** The Shift Dashboard was built at `/shift-dashboard` instead.

| Doc Claims | Reality |
|---|---|
| Shift Dashboard at `/admin/shift` | Lives at `/shift-dashboard` (protected group) |
| Admin layout at `app/(dashboard)/admin/layout.tsx` | No admin layout exists |
| `components/admin/` namespace | Directory does not exist |
| `hooks/admin/` namespace | Directory does not exist |
| Routes: `/admin/alerts`, `/admin/reports`, `/admin/settings/*` | Ghost nav only |

### 9.2 Aesthetic Direction: Partially Adopted, Partially Diverged

The Shift Dashboard V3 adopted a **hybrid** approach, not the clean "Modern SaaS"
split the doc prescribes:

**ADOPTED (safe to reference):**

| Pattern | Evidence |
|---|---|
| KPI left-border accent bars | `secondary-kpi-stack.tsx:43` — `absolute left-0 top-0 h-full w-1` |
| Telemetry visual treatment | `telemetry-rail-panel.tsx` — dashed amber border, `bg-amber-50/5`, TELEMETRY badge |
| Color scheme (teal/cyan accent, chart vars) | Exact match across all components |
| Typography (DM Sans labels, JetBrains Mono data) | Labels: `text-[10px] font-medium uppercase tracking-wide` / Values: `font-mono tabular-nums` |
| Skeleton loading (no spinners) | All components use `<Skeleton>` |

**NOT ADOPTED (regression risk if referenced):**

| Pattern | What Happened Instead |
|---|---|
| shadcnblocks Dashboard-3 layout (sidebar + header + 12-col grid) | Three-rail sticky layout (`ShiftDashboardLayout`) |
| `grid-cols-12` responsive system | `flex` + sticky rails |
| "View Report →" action links in KPIs | Not implemented |
| Dot indicator in KPI cards | Not implemented |
| "Recent Activity" table pattern | Not implemented |
| `components/admin/` file structure | Components live in `components/shift-dashboard-v3/` |

### 9.3 Section-by-Section Verdict

| Section | Verdict |
|---|---|
| §1 Overview (aesthetic split) | PARTIALLY STALE — hybrid reality, not clean split |
| §2 Reference Design (layout) | **STALE** — shadcnblocks Dashboard-3 not adopted |
| §3.1 KPI Cards | CURRENT — accent bars implemented as documented |
| §3.2 Telemetry Treatment | CURRENT — fully compliant |
| §3.3 Charts | STALE — prerequisite note outdated, Recharts already working |
| §3.4 Alert Cards | PARTIALLY CURRENT — alert strip exists, different layout |
| §3.6 Recent Activity Table | STALE — not implemented |
| §4 Navigation / Routes | **COMPLETELY STALE** — all URLs wrong |
| §5 Color Scheme | CURRENT |
| §6 Typography | CURRENT |
| §7 Loading States | CURRENT |
| §9 File Structure | **COMPLETELY STALE** — fictional directory tree |
| §10 Implementation Priorities | STALE — different path taken |
| §11 Validation Checklist | **DANGEROUS** — references non-existent structures |

### 9.4 Recommendation

**Do NOT reference this doc for route structure, layout, or file organization.**

The valid design tokens (accent bars, telemetry treatment, color scheme, typography) can
be cherry-picked. The architectural scaffolding (routes, file structure, layout reference,
validation checklist) is fictional and will cause regression if followed.

For the admin route build: follow the existing `app/(protected)/` and
`components/shift-dashboard-v3/` patterns, not the doc's proposed `app/(dashboard)/admin/`
and `components/admin/` structure.

---

## 10. ADR-039 Relationship — Separate, Not Part Of

ADR-039 is a data architecture ADR (views, tables, RPCs, SRM governance). The admin route
is UI infrastructure. The dependency flows one direction:

```
ADR-039 Phase 1 (migrations)  ──►  /admin/reports (UI consumption)
ADR-039 Phase 2 (service)     ──►  React Query hooks for reports page
```

ADR-039 can ship without the admin route. The admin route's reports page cannot ship
without ADR-039 Phase 1. But the alerts and settings pages have zero ADR-039 dependency.

**Three separate concerns:**
1. **ADR-039:** Data artifacts (migrations, views, RPCs, service layer)
2. **Admin route infrastructure:** Route group, layout, role gating (general infra)
3. **Measurement UI surfaces:** Reports page content layered on top of both

---

## 11. Implementation Priority

| Priority | Page | Effort | Blocked By | Value |
|---|---|---|---|---|
| **P0** | Admin layout + role guard | Small | Nothing | Prerequisite for all pages |
| **P1** | `/admin/alerts` | Medium | Nothing (backend ready) | Unblocks sidebar badge, alert management |
| **P2** | `/admin/settings/thresholds` | Small | Nothing (tables exist) | Replaces hardcoded $5K/$20K thresholds |
| **P3** | `/admin/settings/shifts` | Small | Nothing (tables exist) | Shift schedule configuration |
| **P4** | `/admin/reports` — Loyalty Liability | Medium-Large | ADR-039 Phase 1 (snapshot table + RPC) | Executive reporting surface |
| **P5** | `/admin/reports` — Theo Discrepancy | Small (add panel) | ADR-039 Phase 1 (column additions) | Migration validation reporting |

---

## 12. Open Questions

1. **Route group placement:** `app/(dashboard)/admin/` or `app/(protected)/admin/`? The
   shift dashboard lives in `(protected)`, settings in `(dashboard)`. Admin pages span both
   concerns.
2. **Nav restructuring:** Adding alerts + reports + settings to the Administrative sidebar
   group is already planned via ghost nav. Should the group be renamed? Current: "Administrative"
   with Shift Dashboard, Alerts, Reports.
3. **Shift Dashboard relocation:** Should `/shift-dashboard` eventually move under `/admin/shift`
   to unify the admin route tree, or does it stay at its current location permanently?
4. **Stylistic direction doc:** Archive alongside PRD-021, split into "valid tokens" reference
   + archived sections, or update to reflect reality?

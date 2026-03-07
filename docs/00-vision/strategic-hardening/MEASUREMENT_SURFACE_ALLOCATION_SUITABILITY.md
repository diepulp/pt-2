---
title: Measurement Surface Allocation — Suitability Findings Report
date: 2026-03-02
status: Findings (v2 — revised per PT2_Measurement_Surface_Guidance.md)
references:
  - ADR-039-measurement-layer.md
  - ADR_0XX_B_Measurement_Surface_Allocation.md
  - PT2_Measurement_Surface_Guidance.md
scope: UI surface gap analysis for ADR-039 artifact placement
---

# Measurement Surface Allocation — Suitability Findings Report

## 1. Purpose

This report evaluates the current PT-2 UI against the Artifact Allocation Matrix
proposed in ADR-0XX-B, **as corrected by PT2_Measurement_Surface_Guidance.md** which
establishes the operative principle: *"Do not create new pages unless they pay rent."*

The guidance collapses the addendum's four-surface model into three minimal placements:

| Guidance Placement | Maps To | New Page? |
|---|---|---|
| Shift Dashboard (aggregate coverage) | Existing `/shift-dashboard` | No |
| Pit Terminal (table-level coverage) | Existing `/pit` | No |
| Reports page (loyalty liability) | Ghost nav `/admin/reports` | Yes — single lightweight route |
| Slip Detail → "Audit Trace" panel | Existing Rating Slip Modal | No |

**No new "Executive Console." No new "Audit Console."** The guidance explicitly
prevents both as overbuilding.

---

## 2. Corrected Allocation Model

### ADR-0XX-B (Original) vs Guidance (Operative)

| Artifact | ADR-0XX-B Proposed | Guidance Corrective | Delta |
|---|---|---|---|
| `telemetry_completeness_v` | Pit Terminal + Shift Dashboard | Pit Terminal + Shift Dashboard | No change |
| `audit_event_correlation_v` | New Audit Console | Slip Detail → "Audit Trace" panel | **Collapsed from standalone page to drill-down panel** |
| `loyalty_liability_snapshots` | New Executive/Finance View | Single Reports route | **Collapsed from dashboard to lightweight page** |
| `legacy_theo_cents` | Audit Console (migration) | Admin/Migration validation tooling | Unchanged — still needs placement |

---

## 3. Infrastructure Audit: What Exists Today

### 3.1 Shift Dashboard — FULLY IMPLEMENTED, PRE-WIRED

**Route:** `/shift-dashboard` (in `app/(protected)/`)
**Component:** `ShiftDashboardV3` at `components/shift-dashboard-v3/shift-dashboard-v3.tsx`
**Layout:** Three-rail sticky pattern (`ShiftDashboardLayout`)

**Pre-built expansion slots for measurement artifacts:**

| Slot | Location | Line | Ready For |
|---|---|---|---|
| `data-slot="theo-kpi"` | Left rail, below `QualitySummaryCard` | ~197 | Theo discrepancy summary card |
| `data-slot="utilization-timeline"` | Center panel, between charts and alerts | ~222 | Coverage timeline / heat map |
| `data-slot="trending-charts"` | Center panel, below metrics table | ~239 | Historical coverage trends |
| `data-slot="theo-sidebar"` | Right rail, below `QualityDetailCard` | ~265 | Theo detail panel |

**Existing components that coverage metrics integrate with:**
- `MetricsTable` — per-pit/per-table drill-down already renders quality indicators. Adding `accounted_ratio` and `untracked_ratio` columns is incremental.
- `QualitySummaryCard` — data quality overview. Coverage health indicator (Healthy/Warning/Critical per guidance) aligns with this card's purpose.
- `CoverageBar` — already renders `snapshot_coverage_ratio` in the header. Could be extended or paralleled for rating coverage.
- `TelemetryRailPanel` — right rail detail. Natural home for per-table coverage breakdown on drill-down.

**Verdict: READY.** Zero new routes, zero new layouts. Fill the slots.

### 3.2 Pit Terminal — FULLY IMPLEMENTED, HAS INSERTION POINT

**Route:** `/pit` (in `app/(dashboard)/`)
**Component:** `PitPanelsDashboardLayout` at `components/pit-panels/pit-panels-dashboard-layout.tsx`
**Layout:** Resizable dual-panel (`ResizablePanelGroup`)

**Structure:**
- Left panel (64%, min 45%): Table grid floor view (`TablesPanel`), rating slip modals
- Right panel (36%, min 24%): Vertical split
  - Top half: `ExceptionsApprovalsPanel` (fills, drops, credits)
  - Bottom half: `PendingSection` — **explicitly marked "Under Construction"**

**Existing panels that per-table metrics could augment:**
- `AnalyticsPanel` — per-pit/table analytics (pattern exists)
- `ActivityPanel` — real-time session activity
- Table grid tiles — per-table state already rendered; adding coverage ratio as overlay/badge is zero-layout-cost

**Verdict: READY.** The under-construction bottom section is a pre-allocated insertion point. Table grid tiles can host per-table coverage indicators without layout changes.

### 3.3 Reports Route (`/admin/reports`) — GHOST NAV ONLY

**What exists:**

| Layer | Status | Detail |
|---|---|---|
| **Sidebar nav item** | EXISTS | `app-sidebar.tsx:107-109` — title: "Reports", url: `/admin/reports`, icon: `FileText`, group: Administrative |
| **Route directory** | DOES NOT EXIST | No `app/(dashboard)/admin/reports/` or any `app/**/reports/` directory |
| **Page component** | DOES NOT EXIST | No `page.tsx` anywhere for this route |
| **Layout** | DOES NOT EXIST | No layout wrapper for `/admin/*` routes |
| **Components** | DOES NOT EXIST | No report-specific components, no chart components for liability, no KPI cards for financial data |
| **Data hooks** | DOES NOT EXIST | No React Query hooks for `loyalty_liability_snapshot` data |
| **Service layer** | DOES NOT EXIST | No report service, no snapshot fetch functions |
| **Admin stylistic direction** | EXISTS | `docs/00-vision/shift-dashboards/ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md` defines "Modern SaaS" aesthetic for admin routes with KPI card patterns (colored left-border accents, grid layout, sans-serif labels) |

**The ghost nav is the only infrastructure.** One line in sidebar config. Everything else — route, page, components, data layer — must be built.

**However, the guidance scopes this to a single lightweight route with one panel:**
- `total_outstanding_points` (canonical)
- `estimated_dollar_value` (policy-based, clearly labeled)
- 7/30/90 day trend chart
- CSV export

This is a bounded build. Not a dashboard. Not a multi-panel executive console.

### 3.4 Rating Slip Modal — IMPLEMENTED, NO AUDIT TAB

**Component:** `components/modals/rating-slip/rating-slip-modal.tsx` (854 lines)
**Pattern:** `Dialog` → `DialogContent` → scrollable form body → fixed action buttons

**Current modal structure (top to bottom):**

```
DialogHeader (player name, card number, gaming day, pause badge)
├── Error/validation banners
├── CTR Banner (conditional)
├── FormSectionAverageBet
├── FormSectionCashIn (with adjustment trigger)
├── FormSectionStartTime
├── FormSectionMovePlayer
├── FormSectionChipsTaken
├── Financial Summary panel (Cash In / Chips Out / Net Position)
└── Loyalty Points panel (balance, session reward estimate, tier)
Action Buttons (Save / Pause-Resume / Close Session)
```

**What the guidance requires added:**

A new **"Audit Trace" panel** exposing per-slip financial lineage:
- Slip closed event
- Financial transaction created
- MTL entry derived
- Loyalty ledger entry posted
- Actor attribution + timestamps

**Infrastructure gaps for the Audit Trace panel:**

| Requirement | Exists? | Detail |
|---|---|---|
| Tab system in modal | NO | Modal is a single scrollable form. No `Tabs`/`TabsList`/`TabsContent` components are used. Adding an "Audit Trace" tab requires either: (a) refactoring to tabs (Current / Audit Trace), or (b) adding a collapsible section at the bottom. |
| Audit data fetching | NO | `useRatingSlipModalData` aggregates 5 bounded contexts (slip, player, loyalty, financial, tables) but NOT audit log or cross-context correlation data. A new query hook is needed. |
| `measurement_audit_event_correlation_v` query | NO | The view itself doesn't exist yet (ADR-039 Phase 1 migration). Once created, a service-layer fetch function and React Query hook are needed. |
| Read-only lineage display component | NO | No component exists for displaying a vertical event chain (slip → txn → MTL → loyalty → audit_log). Must be built. |
| Conditional rendering (audit-log join) | REQUIRED | Per ADR-039 Approval Condition 1, the audit-enriched variant is blocked until `audit_log` append-only immutability is enforced. The panel must gracefully show lineage without audit_log entries initially. |

**Two integration approaches:**

| Approach | Pros | Cons |
|---|---|---|
| **A: Collapsible section** — Add `<Collapsible>` "Audit Trace" section below Loyalty Points, above action buttons | Zero layout refactor. Incremental. Only visible when expanded. | Modal already long (~6 form sections + 2 summary panels). Another section risks scroll fatigue. |
| **B: Tab refactor** — Wrap current form in a "Session" tab, add "Audit Trace" tab | Clean separation. Audit data loads lazily on tab switch. No scroll length increase. | Larger refactor of the 854-line modal. Must preserve all existing form state, dirty tracking, CTR banner logic across tab changes. |

**Verdict:** The Rating Slip Modal is a suitable host per the guidance principle ("investigative tooling opened when someone asks 'why did this happen?'"), but requires non-trivial modifications. The modal has no tab infrastructure and is already complex (854 lines, 5 bounded-context data sources, Zustand state management, React 19 `useTransition` patterns). Approach A (collapsible section) is lower-risk.

### 3.5 Compliance Dashboard — EXISTS, NOT SUITABLE FOR AUDIT TRACE

**Route:** `/compliance`
**Component:** `ComplianceDashboard` at `components/mtl/compliance-dashboard.tsx`

The guidance explicitly routes audit event correlation to the **Slip Detail drill-down**, not the Compliance Dashboard. This is correct — the Compliance Dashboard serves a different purpose (daily MTL/AML/CTR monitoring per patron), while audit trace is per-slip investigative tooling. No changes needed to the Compliance Dashboard.

---

## 4. Consolidated Infrastructure Matrix

| Surface | Route Exists | Page Exists | Components Exist | Data Layer Exists | Nav Exists | Build Scope |
|---|---|---|---|---|---|---|
| **Shift Dashboard** (coverage widget) | YES | YES | YES (slots ready) | Partial (quality hooks exist, coverage hooks needed) | YES | **Incremental** — fill slots, add coverage query hook |
| **Pit Terminal** (table-level metrics) | YES | YES | YES (insertion point) | Partial (table state exists, per-table coverage needed) | YES | **Incremental** — add coverage overlay/badge to table grid |
| **Reports** (loyalty liability) | NO | NO | NO | NO | YES (ghost) | **New route** — bounded single-page build |
| **Slip Detail Audit Trace** (lineage) | N/A (modal) | N/A | NO | NO | N/A | **Modal extension** — new collapsible section + query hook |

---

## 5. Gap Summary by Build Effort

### Tier 1: Slot-Fill (smallest effort)

**Shift Dashboard coverage widget**
- Replace `data-slot="utilization-timeline"` div with `CoverageTimelineCard`
- Add coverage columns to `MetricsTable`
- New hook: `useMeasurementRatingCoverage(window)` querying `measurement_rating_coverage_v`
- Prerequisite: `measurement_rating_coverage_v` migration deployed (ADR-039 Phase 1, depends on ADR-038)

**Pit Terminal per-table metrics**
- Add coverage ratio badge/indicator to table grid tiles
- Or populate under-construction `PendingSection` with per-table coverage breakdown
- Shares the same query hook as Shift Dashboard (table-level slice vs aggregate)

### Tier 2: Modal Extension (medium effort)

**Slip Detail → Audit Trace panel**
- New collapsible section in `RatingSlipModal` (~50-80 lines)
- New component: `AuditTracePanel` (read-only lineage chain)
- New hook: `useAuditEventCorrelation(slipId)` querying `measurement_audit_event_correlation_v`
- Prerequisite: `measurement_audit_event_correlation_v` base migration deployed (ADR-039 Phase 1)
- Graceful degradation: Show lineage without `audit_log` entries until append-only enforcement ships

### Tier 3: New Route (largest effort)

**Reports page — Loyalty Liability**
- New route: `app/(dashboard)/admin/reports/page.tsx` (or `app/(protected)/reports/page.tsx`)
- New layout: Single-panel, card-based. Follow `ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md` "Modern SaaS" aesthetic.
- New components:
  - `LoyaltyLiabilityCard` — KPI card showing `total_outstanding_points` (canonical) and `estimated_dollar_value` (labeled "Estimated — policy-based valuation")
  - `LiabilityTrendChart` — Recharts line chart (7/30/90d selector). Code-split via `lazy()` following `WinLossTrendChart` pattern.
  - CSV export button
- New hooks: `useLoyaltyLiabilitySnapshots(casinoId, range)` querying `loyalty_liability_snapshot` table
- New service: `services/measurement/` or extend `services/loyalty/` with snapshot read functions
- Prerequisite: `loyalty_liability_snapshot` table + `rpc_snapshot_loyalty_liability` deployed (ADR-039 Phase 1)
- Role gating: Admin-only access. No route-level role gating pattern exists yet — must be established.

---

## 6. Cross-Cutting Gaps

### 6.1 Role Gating — Not Yet Established

The Reports page requires admin-only access. No route-level role gating middleware or layout guard exists today. The auth pipeline (ADR-024, ADR-030) provides `staff_role` in the session context, but no Next.js layout or middleware enforces role-based route access.

**Options:**
- Layout-level guard in `app/(dashboard)/admin/layout.tsx` checking `staff_role`
- Middleware-based redirect in `middleware.ts`
- Component-level guard (least desirable — leaks role logic into components)

This is a prerequisite for the Reports page and should be built as reusable infrastructure.

### 6.2 `measurement_audit_event_correlation_v` — Phased Delivery

ADR-039 Approval Condition 1 blocks the audit-enriched variant. The Audit Trace panel must be designed for two states:
1. **Base:** Slip → Transaction → MTL Entry → Loyalty Ledger (no audit_log)
2. **Enriched:** + Actor attribution from audit_log (once append-only immutability ships)

The component should render available chain links and show a placeholder for audit_log with a note like "Audit trail enrichment pending."

### 6.3 `measurement_rating_coverage_v` — ADR-038 Dependency

The rating coverage view depends on ADR-038's finalized table-lifecycle contract for authoritative "active table-hours." Per ADR-039 Approval Condition 2, the view must bind to that contract, not whatever table happens to exist. The Shift Dashboard and Pit Terminal widgets share this dependency.

### 6.4 Admin Aesthetic Pattern Exists but Is Not Implemented

`ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md` defines a complete design system for admin routes (Modern SaaS aesthetic, colored left-border KPI cards, grid layout, sans-serif labels). This is the correct stylistic reference for the Reports page. It has never been implemented — the Shift Dashboard uses the brutalist operational aesthetic, not the admin SaaS pattern. The Reports page would be the first consumer of this design direction.

### 6.5 No Dedicated Measurement Service Layer

No `services/measurement/` directory exists. The measurement artifacts (views, snapshot table) are cross-cutting read models. Options:
- Create `services/measurement/` with read-only query functions for all measurement views
- Extend existing services (e.g., `services/loyalty/` for liability snapshots, `services/rating-slip/` for coverage)

The guidance's minimal philosophy suggests extending existing services rather than creating a new bounded context.

---

## 7. Implementation Priority (Revised per Guidance)

| Priority | Surface | Effort | Dependencies | Rationale |
|---|---|---|---|---|
| **P0** | Shift Dashboard — coverage widget in expansion slots | Incremental | `measurement_rating_coverage_v` migration (blocked by ADR-038) | Pre-wired slots. Highest operational value. Immediately actionable within shift. |
| **P1** | Pit Terminal — per-table coverage indicators | Incremental | Same migration as P0 | Table-level floor correction. Shares data layer with P0. |
| **P2** | Slip Detail — Audit Trace collapsible panel | Medium | `measurement_audit_event_correlation_v` base migration | Investigative tooling. Opens lineage when needed. No new route. |
| **P3** | Reports page — Loyalty Liability | New route | `loyalty_liability_snapshot` table + RPC + role gating infrastructure | Only truly new page. Bounded to one panel. Ghost nav already exists. |

**Note:** P0 and P1 share a migration dependency (ADR-038 lifecycle contract). P2 depends on the correlation view migration. P3 has the fewest external dependencies but requires the most new infrastructure (route, components, hooks, role gating).

---

## 8. ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md — Staleness Audit

**File:** `docs/00-vision/shift-dashboards/ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md`
**Created:** 2026-01-07 | **Status in doc:** `approved`
**Associated PRD:** PRD-021 (`docs/10-prd/_archive/PRD-021-admin-dashboard-ui.md`) — **archived, never implemented**

### 8.1 Core Finding: The `/admin` Route Was Never Built

PRD-021 proposed a dedicated `app/(dashboard)/admin/` route tree housing `/admin/shift`,
`/admin/alerts`, `/admin/reports`, and `/admin/settings/*`. **This route tree does not exist.**
The PRD was archived. Instead, the Shift Dashboard was implemented at an entirely different
location: `app/(protected)/shift-dashboard/`.

| Doc Claims | Reality |
|---|---|
| Shift Dashboard lives at `/admin/shift` | Lives at `/shift-dashboard` (protected group) |
| Admin layout at `app/(dashboard)/admin/layout.tsx` | No admin layout exists |
| Admin sidebar component at `components/admin/admin-sidebar.tsx` | No `components/admin/` directory exists |
| Admin header at `components/admin/admin-header.tsx` | Uses shared `Header` component |
| File structure: `app/(dashboard)/admin/`, `components/admin/`, `hooks/admin/` | None of these directories exist |
| Routes: `/admin/alerts`, `/admin/reports`, `/admin/settings/*` | Ghost nav items only — no backing routes/pages |

### 8.2 Aesthetic Direction: Partially Adopted, Partially Diverged

The doc prescribes "Modern SaaS" vs "Brutalist" as a hard split. The actual implementation
took a **hybrid approach** — neither pure Modern SaaS nor pure Brutalist:

| Pattern | Doc Prescribes | Actual Implementation | Status |
|---|---|---|---|
| **KPI left-border accent bars** | `absolute left-0 top-0 h-full w-1` with colored class | `secondary-kpi-stack.tsx:43` — exact match | ADOPTED |
| **Hero top accent bar** | (Not in doc — doc only shows left bars) | `hero-win-loss-compact.tsx:80` — `h-1 w-full` horizontal top bar | EVOLVED BEYOND DOC |
| **Telemetry visual treatment** | Dashed amber border, `bg-amber-50/5`, TELEMETRY badge | `telemetry-rail-panel.tsx` — exact match | ADOPTED |
| **Typography: data vs labels** | DM Sans labels, JetBrains Mono for data only | Labels: `text-[10px] font-medium uppercase tracking-wide` / Values: `font-mono tabular-nums` | ADOPTED (labels use `uppercase tracking-wide`, closer to operational than "Title case, clean hierarchy") |
| **Color scheme** | Teal/Cyan accent, chart variables, semantic colors | Exact match | ADOPTED |
| **Skeleton loading** | `<Skeleton>` components, no spinners | Exact match | ADOPTED |
| **Layout: Sidebar + Main + KPI grid** | shadcnblocks Dashboard-3 (sidebar + header + 12-col grid + KPI row + chart + table) | Three-rail sticky layout (`ShiftDashboardLayout`) — completely different paradigm | NOT ADOPTED |
| **12-column CSS grid** | `grid-cols-12` responsive spanning | Not used — uses `flex` + sticky rails | NOT ADOPTED |
| **"View Report →" action links in KPIs** | Pattern §3.1 code sample | Not implemented | NOT ADOPTED |
| **Dot indicator in KPI cards** | `h-2 w-2 rounded-full` status dot | Not implemented | NOT ADOPTED |
| **Recent Activity table** | Avatar + status badge + relative time pattern (§3.6) | Not implemented | NOT ADOPTED |
| **Chart installation** | `npx shadcn@latest add chart` (prerequisite note) | Recharts already integrated, `chart.tsx` exists | STALE (already done) |

### 8.3 Section-by-Section Staleness Verdict

| Section | Verdict | Notes |
|---|---|---|
| §1 Overview (aesthetic split) | PARTIALLY STALE | The brutalist vs SaaS distinction is real but the implementation is hybrid, not a clean split |
| §2 Reference Design (layout) | STALE | shadcnblocks Dashboard-3 layout was not adopted. Three-rail pattern used instead. |
| §3.1 KPI Cards | CURRENT | Left-border accent pattern is implemented as documented |
| §3.2 Telemetry Treatment | CURRENT | Fully compliant — dashed amber border, badge, background tint |
| §3.3 Charts | STALE | Prerequisite note about installing shadcn chart is outdated. Recharts is working. |
| §3.4 Alert Cards | PARTIALLY CURRENT | Alert strip exists but uses different layout than doc sample |
| §3.5 Time Window Picker | PARTIALLY CURRENT | `TimeWindowSelector` exists but uses different UI pattern than doc sample |
| §3.6 Recent Activity Table | STALE | Not implemented. No activity table in shift dashboard. |
| §4 Navigation / Routes | **COMPLETELY STALE** | All `/admin/*` URLs are wrong. Shift dashboard is at `/shift-dashboard`. |
| §4.2 Sidebar Menu Items | **COMPLETELY STALE** | Nav config code sample shows wrong URLs and structure |
| §5 Color Scheme | CURRENT | Accurate representation of PT-2 theme tokens |
| §6 Typography | CURRENT | DM Sans / JetBrains Mono split is accurate |
| §7 Loading States | CURRENT | Skeleton pattern is followed |
| §8 Responsive Breakpoints | STALE | 12-col grid not used |
| §9 File Structure | **COMPLETELY STALE** | Entire directory tree is fictional — none of it exists |
| §10 Implementation Priorities | STALE | Implementation took a different path |
| §11 Validation Checklist | **DANGEROUS** | References non-existent structures (`/admin/*` routes, admin sidebar, 12-col grid) |

### 8.4 Regression Risk Assessment

**If the Reports page implementation references this doc, the following regressions would occur:**

| Risk | Severity | What Would Happen |
|---|---|---|
| Route structure | **HIGH** | Developer creates `app/(dashboard)/admin/reports/page.tsx` — but no admin route group or layout exists. Either the page 404s or requires building the entire admin layout scaffolding. |
| Component namespace | **MEDIUM** | Developer creates `components/admin/` — introducing a namespace that has no precedent and diverges from the actual component organization (`components/shift-dashboard-v3/`, `components/pit-panels/`, etc.) |
| Layout pattern | **HIGH** | Developer follows the shadcnblocks Dashboard-3 sidebar+grid layout — which is completely different from the three-rail or single-panel patterns used everywhere else. Visual inconsistency. |
| Nav config | **MEDIUM** | Developer uses the §4.2 code sample for nav — URLs don't match the actual `app-sidebar.tsx` config |
| Chart prerequisite | **LOW** | Developer runs `npx shadcn@latest add chart` unnecessarily — already installed |
| Validation checklist | **HIGH** | Developer checks items against non-existent structures and either (a) builds unnecessary scaffolding or (b) incorrectly marks items as complete |

### 8.5 Recommendation

**The doc should be split into two artifacts:**

1. **RETAIN as reference** — Extract the still-valid patterns into a "Shift Dashboard Design Tokens" reference:
   - §3.1 KPI card accent pattern (confirmed implemented)
   - §3.2 Telemetry visual treatment (confirmed implemented)
   - §5 Color scheme (confirmed accurate)
   - §6 Typography rules (confirmed accurate)
   - §7 Loading states (confirmed accurate)

2. **MARK AS STALE** — The following sections must be flagged with a prominent staleness warning or removed:
   - §2 Reference design layout (not adopted)
   - §4 Route structure (completely wrong)
   - §9 File structure (fictional)
   - §10 Implementation priorities (superseded)
   - §11 Validation checklist (references non-existent structures)

**For the Reports page build specifically:** Do NOT reference this doc for route structure, layout, or file organization. Instead:
- Route: Follow the existing `app/(protected)/` or `app/(dashboard)/` patterns
- Layout: Use a single-panel card-based layout, not the shadcnblocks Dashboard-3 grid
- Components: Place under `components/reports/` following the existing namespace convention
- Design tokens: Adopt the KPI accent bar and telemetry treatment patterns (the parts that are current)

---

## 9. Open Questions

1. **Reports route path:** Should it live at `/admin/reports` (matching the ghost nav) or a new path like `/reports`? Given that no `/admin` route group exists, using `/admin/reports` would require either (a) creating the admin route group infrastructure or (b) placing the page elsewhere and updating the ghost nav. Option (b) is lower effort.
2. **Rating Slip Modal audit trace:** Collapsible section (approach A) or tab refactor (approach B)? Given the modal's complexity (854 lines, 5 bounded contexts, Zustand + useTransition), approach A is lower risk.
3. **Role gating scope:** Build admin layout guard as part of the Reports page work, or establish it as a separate infrastructure prerequisite?
4. **Legacy theo validation:** The guidance says "Admin / Migration validation tooling." Should this be a section within the Reports page, a hidden admin tool at `/settings/migration`, or a development-only route under `/dev/`?
5. **Stylistic direction doc disposition:** Should `ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md` be archived, split, or updated? Current state creates regression risk for any developer who references it without auditing implementation.

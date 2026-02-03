# PERF-007: Shift Dashboard V3 — Comprehensive Performance, QA & Accessibility Audit

**Status:** Open
**Severity:** Critical (3x P0, 11x P1)
**Category:** Performance / Accessibility / Quality / Architecture / Security
**Created:** 2026-02-02
**Investigation Method:** 5 parallel analysis agents (performance-engineer, qa-specialist, web-design-guidelines, vercel-react-best-practices, rls-expert)

---

## Executive Summary

The shift-dashboard-v3 component tree (22 components, 2,660 source LOC) has **63 total findings** across 5 investigation streams. After deduplication, **54 unique findings** remain — 3 critical (P0), 11 high (P1), 19 major (P2), 15 medium (P3), and 6 low (P4).

Key numbers:
- **5-9 full tree re-renders on cold mount** with zero React.memo boundaries
- **3 broken Tailwind hover classes** in AlertItem (silent CSS failure)
- **Zero aria-live regions** across the entire async dashboard
- **Zero focus indicators** on custom interactive elements
- **Zero error boundaries** at both route segments
- **Edge middleware disabled** (`middleware.ts.bak`) — session refresh not executing
- **Query cache not cleared on logout** — cross-tenant data exposure risk
- **Recharts (~60KB gz) eagerly loaded** without code splitting
- **4 major components with zero test coverage** (orchestrator, MetricsTable, AlertsStrip, TelemetryRailPanel)

### Cross-Audit Consensus Matrix

| # | Finding | S1 Perf | S2 QA | S3 A11y | S4 React | S5 Sec | Consensus |
|---|---------|:-------:|:-----:|:-------:|:--------:|:------:|-----------|
| 1 | Broken dynamic Tailwind classes in AlertItem | | X | | X | | **2/5** |
| 2 | No React.memo on expensive subtrees / list rows | X | | | X | | **2/5** |
| 3 | Missing error.tsx / loading.tsx route boundaries | | X | | X | | **2/5** |
| 4 | Deferred timeWindow init wastes render cycle | X | | | X | | **2/5** |
| 5 | Recharts not code-split (eagerly loaded ~60KB gz) | X | | | X | | **2/5** |
| 6 | No useMemo on derived data (sort/filter/reduce) | X | | | X | | **2/5** |
| 7 | No server-side data prefetching (RSC opportunity) | X | | | X | | **2/5** |
| 8 | Alert key uses array index despite stable entity_id | X | | | X | | **2/5** |
| 9 | No aria-live on async content updates | | | X | | | 1/5 |
| 10 | No focus indicators on custom buttons | | | X | | | 1/5 |
| 11 | No error state handling in orchestrator | | X | | | | 1/5 |
| 12 | Review route bypasses authentication | | | | | X | 1/5 |
| 13 | Edge middleware disabled | | | | | X | 1/5 |
| 14 | Query cache not cleared on logout | | | | | X | 1/5 |
| 15 | staleTime/refetchInterval mismatch + data drift | X | X | | | | **2/5** |

---

## Affected Files

| File | Lines | Role |
|------|-------|------|
| `components/shift-dashboard-v3/shift-dashboard-v3.tsx` | 251 | Root orchestrator, owns 3 query hooks |
| `components/shift-dashboard-v3/center/metrics-table.tsx` | 435 | Tabbed casino/pit/table metrics view |
| `components/shift-dashboard-v3/center/alerts-strip.tsx` | 255 | Alert list with severity sorting |
| `components/shift-dashboard-v3/charts/win-loss-trend-chart.tsx` | 208 | Recharts LineChart |
| `components/shift-dashboard-v3/charts/floor-activity-radar.tsx` | 129 | Recharts RadarChart |
| `components/shift-dashboard-v3/right-rail/telemetry-rail-panel.tsx` | 160 | Telemetry data + accordion |
| `components/shift-dashboard-v3/trust/coverage-bar.tsx` | 111 | Coverage progressbar |
| `components/shift-dashboard-v3/trust/telemetry-quality-indicator.tsx` | 79 | Quality tier dot |
| `components/shift-dashboard-v3/trust/provenance-tooltip.tsx` | 102 | Provenance metadata tooltip |
| `components/shift-dashboard-v3/layout/shift-right-rail.tsx` | 48 | Collapsible right rail |
| `components/shift-dashboard-v3/layout/shift-left-rail.tsx` | 35 | Left rail container |
| `hooks/shift-dashboard/use-shift-dashboard-summary.ts` | ~60 | TanStack Query hook (metrics) |
| `hooks/shift-dashboard/use-cash-obs-summary.ts` | ~65 | TanStack Query hook (telemetry) |
| `hooks/shift-dashboard/use-active-visitors-summary.ts` | ~45 | TanStack Query hook (visitors) |
| `app/(protected)/shift-dashboard/page.tsx` | 22 | Production route entry |
| `app/review/shift-dashboard-v3/page.tsx` | 14 | Review route entry (unprotected) |
| `app/api/v1/shift-dashboards/visitors-summary/route.ts` | ~60 | Visitors summary API |
| `middleware.ts.bak` | — | Disabled edge middleware |
| `components/logout-button.tsx` | ~20 | Logout handler |

---

## P0 — Critical Issues

### P0-1: Broken Dynamic Tailwind Classes in AlertItem (2/5 consensus)

**Confirmed by:** S2 Quality, S4 React/Next.js

**Files:** `components/shift-dashboard-v3/center/alerts-strip.tsx:92`

The `AlertItem` button constructs Tailwind class names via string interpolation at runtime:

```tsx
className={`... hover:${colorConfig.border}/50 ...`}
```

Tailwind CSS uses static analysis at build time. Classes constructed via string interpolation are **invisible to the compiler** and generate no CSS output. The hover border color on alert items is silently broken. The `${colorConfig.border}/30` opacity modifier pattern is also affected.

**Remediation:** Replace with a pre-composed lookup object mapping severity to complete static class strings:
```tsx
const ALERT_STYLES = {
  critical: { border: 'border-rose-500/30', hoverBorder: 'hover:border-rose-500/50', ... },
  warn: { border: 'border-amber-500/30', hoverBorder: 'hover:border-amber-500/50', ... },
  info: { border: 'border-blue-500/30', hoverBorder: 'hover:border-blue-500/50', ... },
};
```

---

### P0-2: No `aria-live` Regions on Any Async Content Updates (1/5)

**Confirmed by:** S3 Accessibility

**Files:** All 22 components in `shift-dashboard-v3/` (zero `aria-live`, `aria-busy`, `role="status"`, or `role="alert"` attributes found)

The dashboard fetches data from 3 async queries and renders loading skeletons, alert counts, and auto-refreshing timestamps — all silently to assistive technology. Screen reader users receive no notification when metrics load, alerts appear, or data refreshes. The entire dashboard is effectively invisible during state transitions.

**Remediation:** Add `aria-live="polite"` to the metrics container, alerts strip, and timestamp. Add `aria-busy="true"` on containers during loading. Add `role="status"` to skeleton wrappers.

---

### P0-3: Zero Focus Indicators on All Custom Interactive Elements (1/5)

**Confirmed by:** S3 Accessibility

**Files:** `win-loss-trend-chart.tsx:126-137`, `alerts-strip.tsx:89-149`, `metrics-table.tsx:85-92,135-142`, `telemetry-rail-panel.tsx:98-108`

Zero instances of `focus:` or `focus-visible:` classes across the entire directory. Custom buttons for series toggles, alert items, pit drill-down, and accordion toggles have no visible focus ring. WCAG 2.4.7 Focus Visible violation.

**Remediation:** Add `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` to every custom `<button>`.

---

## P1 — High Severity Issues

### P1-1: No React.memo Boundaries on Expensive Subtrees (2/5 consensus)

**Confirmed by:** S1 Performance, S4 React/Next.js

**Files:** All 22 components (none use `React.memo`)

The root `ShiftDashboardV3` owns 3 independent query hooks plus 2 useState hooks. Each query resolution triggers a re-render of the entire tree — approximately **5-9 full tree re-renders on cold mount**. Recharts charts perform full SVG reconciliation on each render. `PitRow` and `TableRow` in MetricsTable re-render all rows on every tab switch.

**Remediation:** Wrap `FloorActivityRadar`, `WinLossTrendChart`, `MetricsTable`, `AlertsStrip`, `TelemetryRailPanel`, `PitRow`, `TableRow`, `AlertItem`, `MetricGradeBadge`, and `TelemetryQualityIndicator` with `React.memo()`.

---

### P1-2: Missing `error.tsx` Route-Level Error Boundaries (2/5 consensus)

**Confirmed by:** S2 Quality, S4 React/Next.js
**Governing ADR:** [ADR-032 — Frontend Error Boundary Architecture](../../80-adrs/ADR-032-frontend-error-boundary-architecture.md)

**Files:** `app/(protected)/shift-dashboard/` and `app/review/shift-dashboard-v3/` — neither has `error.tsx`

If any component throws during rendering or a query handler throws, the error propagates to the root layout, producing a full white-screen crash. No per-panel error boundaries exist either. ADR-032 already defines the three-tier error boundary hierarchy (Tier 1: route `error.tsx` → Tier 2: `PanelErrorBoundary` → Tier 3: `QueryErrorResetBoundary`) and the shared `ErrorState` component with `full-page`, `panel`, and `inline` variants.

**Remediation:** Apply ADR-032 pattern to shift-dashboard-v3:
1. **Tier 1:** Add `error.tsx` at `app/(protected)/shift-dashboard/` using `ErrorState` variant `full-page`
2. **Tier 2:** Wrap each panel region (left rail, center charts, center metrics table, right rail) in `PanelErrorBoundary`
3. **Tier 3:** Compose `QueryErrorResetBoundary` inside panel boundaries for data-driven subtrees
4. Wire error logging through `logError()` per ADR-032 §D6 invariants

---

### P1-3: Orchestrator Ignores Query Errors (1/5)

**Confirmed by:** S2 Quality

**Files:** `shift-dashboard-v3.tsx:71-82`

The three TanStack Query hooks destructure only `data`, `isLoading`, and `dataUpdatedAt`. Neither `isError` nor `error` is checked. When an API call fails, the dashboard silently renders as if data is empty with no error indication to the pit boss.

**Remediation:** Destructure `isError`/`error` from each hook. Render an error banner: "Unable to load shift metrics. Retry?"

---

### P1-4: Deferred timeWindow Init Wastes First Render (2/5 consensus)

**Confirmed by:** S1 Performance, S4 React/Next.js

**Files:** `shift-dashboard-v3.tsx:58-68`

`timeWindow` initialized as `null`, then set via `useEffect`. All queries have `enabled: !!window.start && !!window.end`, so they are disabled on the first render. One wasted render cycle + ~16ms fetch delay. The SSR concern is moot — the component is already `'use client'`.

**Remediation:** Use `useState(() => getDefaultWindow())` lazy initializer.

---

### P1-5: Edge Middleware Disabled (1/5)

**Confirmed by:** S5 Security

**Files:** `middleware.ts.bak` (renamed from `middleware.ts`)

The root `middleware.ts` has been renamed to `.bak`, so **no edge middleware executes**. The auth redirect logic and session token refresh are never invoked. Routes outside `(protected)` have zero auth enforcement.

**Remediation:** Restore by renaming `middleware.ts.bak` back to `middleware.ts`. If intentionally disabled, document the reason and add compensating controls.

---

### P1-6: Review Route Bypasses Authentication (1/5)

**Confirmed by:** S5 Security

**Files:** `app/review/shift-dashboard-v3/page.tsx:11`

The `/review/shift-dashboard-v3` route renders `<ShiftDashboardV3 />` with no auth check. No `layout.tsx` enforces authentication. Combined with P1-5 (disabled middleware), this route is completely unprotected.

**Remediation:** Add `app/review/layout.tsx` with auth enforcement, or remove the `/review` middleware exclusion.

---

### P1-7: Zero Test Coverage on Root Orchestrator (1/5)

**Confirmed by:** S2 Quality

**Files:** `shift-dashboard-v3.tsx` (251 lines, zero tests)

The most complex component — owns 3 query hooks, `computeQualityCounts`, time window state, last-update tracking, 12+ sub-component composition — has no test coverage.

**Remediation:** Add tests for SSR-safe init, quality count computation, data flow to sub-components, error states, loading states.

---

### P1-8: Zero Test Coverage on MetricsTable (1/5)

**Confirmed by:** S2 Quality

**Files:** `center/metrics-table.tsx` (435 lines, zero tests)

Largest component with tab state, drill-down state, filtering, and interactive row handlers is completely untested.

**Remediation:** Add tests for tab switching, pit drill-down, "All Pits" back nav, empty states, table filtering.

---

### P1-9: Coverage Bar Missing Progressbar Semantics (1/5)

**Confirmed by:** S3 Accessibility

**Files:** `trust/coverage-bar.tsx:68-87`

Renders as plain `<div>` with no `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, or `aria-valuemax`. Coverage ratio conveyed purely through visual width. WCAG 1.3.1 violation.

**Remediation:** Add `role="progressbar"` and ARIA value attributes.

---

### P1-10: Quality Indicator Conveys Tier via Color Alone (1/5)

**Confirmed by:** S3 Accessibility

**Files:** `trust/telemetry-quality-indicator.tsx:55-78`

When `showLabel={false}` (default), only a colored dot is rendered. No `aria-label` or sr-only text. WCAG 1.4.1 Use of Color violation.

**Remediation:** Add `aria-label={config.label}` or `<span className="sr-only">{config.label}</span>`.

---

### P1-11: Left/Right Rail Content Inaccessible Below Breakpoints (1/5)

**Confirmed by:** S3 Accessibility

**Files:** `layout/shift-left-rail.tsx:22` (`hidden lg:flex`), `layout/shift-right-rail.tsx:34` (`hidden xl:flex`)

Left rail hidden below 1024px, right rail below 1280px. No mobile alternative (drawer, bottom sheet, or inline fallback). Users on tablets lose primary win/loss and KPI data.

**Remediation:** Implement a collapsible drawer or inline critical KPIs into center panel at smaller viewports.

---

## P2 — Major Issues

### P2-1: Recharts Not Code-Split (2/5 consensus)

**Confirmed by:** S1 Performance, S4 React/Next.js

**Files:** `charts/floor-activity-radar.tsx:3`, `charts/win-loss-trend-chart.tsx:4`

Recharts (~60KB gzipped) eagerly loaded in the initial bundle. Charts are below the fold.

**Remediation:** Use `next/dynamic` with `ssr: false` and loading skeleton fallback.

---

### P2-2: No useMemo on Derived Data (2/5 consensus)

**Confirmed by:** S1 Performance, S4 React/Next.js

**Files:** `shift-dashboard-v3.tsx:93`, `alerts-strip.tsx:180-189`, `telemetry-rail-panel.tsx:135-152`, `metrics-table.tsx:214`

`computeQualityCounts`, sorted alerts, sorted tables, and filtered tables all recomputed on every render (5-9 times on cold mount).

**Remediation:** Wrap each in `useMemo` keyed on source data references.

---

### P2-3: staleTime/refetchInterval Mismatch Causes Data Drift (2/5 consensus)

**Confirmed by:** S1 Performance, S2 Quality

**Files:** `use-shift-dashboard-summary.ts:48-54`, `use-cash-obs-summary.ts:58`, `use-active-visitors-summary.ts:38`

Three queries with different refresh cadences (none/60s/30s) cause cascading re-renders at different intervals and visual data staleness where some metrics auto-update and others do not.

**Remediation:** Align all to 60s `refetchInterval` and 60s `staleTime`. Add `refetchInterval: 60_000` to `useShiftDashboardSummary`.

---

### P2-4: No Server-Side Data Prefetching (2/5 consensus)

**Confirmed by:** S1 Performance, S4 React/Next.js

**Files:** `app/(protected)/shift-dashboard/page.tsx:19-21`

Server Component does zero work — could prefetch via TanStack Query dehydrate/hydrate to eliminate client-side loading waterfall.

**Remediation:** Use `queryClient.prefetchQuery()` in server component + `HydrationBoundary`.

---

### P2-5: Query Cache Not Cleared on Logout — Cross-Tenant Risk (1/5)

**Confirmed by:** S5 Security

**Files:** `components/logout-button.tsx:11-14`

TanStack Query cache persists casino financial data (win/loss, fills, credits) after logout. In shared-terminal casino environments, a different tenant's data could be briefly visible.

**Remediation:** Add `queryClient.clear()` before redirect in logout handler.

---

### P2-6: Database Error Messages Leaked to Client (1/5)

**Confirmed by:** S5 Security

**Files:** `app/api/v1/shift-dashboards/visitors-summary/route.ts:44`

Raw Postgres error messages forwarded to client via `throw new Error(\`Database error: ${error.message}\`)`.

**Remediation:** Use generic error message, log actual error server-side.

---

### P2-7: Recharts dot/activeDot Inline Object Props (1/5)

**Confirmed by:** S1 Performance

**Files:** `charts/win-loss-trend-chart.tsx:169-170,189,197`

Inline `{ r: 4 }` creates new references every render, forcing full SVG reconciliation.

**Remediation:** Extract to module-level constants.

---

### P2-8: MetricsTable 435 LOC with Duplicated Tab Content (1/5)

**Confirmed by:** S4 React/Next.js

**Files:** `center/metrics-table.tsx` — casino and pit tabs duplicate identical `<table>` structure

**Remediation:** Extract shared `PitTable` component.

---

### P2-9: Zero Test Coverage on AlertsStrip (1/5)

**Confirmed by:** S2 Quality

**Files:** `center/alerts-strip.tsx` (255 lines, zero tests)

Severity sorting, maxDisplay slicing, downgrade indicator, and recommended action logic untested.

---

### P2-10: activeVisitorsSummary Not Scoped to Time Window (1/5)

**Confirmed by:** S2 Quality

**Files:** `hooks/shift-dashboard/use-active-visitors-summary.ts:27-42`

Hook takes no `window` parameter. Floor activity radar shows "current" visitors regardless of user-selected time window.

**Remediation:** Add `window` parameter or label chart as "Current Floor Activity".

---

### P2-11: E2E Tests Target Review Route, Not Production Auth Route (1/5)

**Confirmed by:** S2 Quality

**Files:** `e2e/workflows/shift-dashboard-v3-layout.spec.ts:13` targets `/review/shift-dashboard-v3`

Does not validate auth-protected route or casino-scoped data flow.

---

### P2-12: E2E Tests Lack Data-Driven Assertions (1/5)

**Confirmed by:** S2 Quality

All E2E assertions check structural layout only, not data rendering.

---

### P2-13: Zero Test Coverage on TelemetryRailPanel (1/5)

**Confirmed by:** S2 Quality

**Files:** `right-rail/telemetry-rail-panel.tsx` (160 lines, zero tests)

---

### P2-14: No Per-Panel Error Boundaries (1/5)

**Confirmed by:** S2 Quality
**Governing ADR:** [ADR-032 — Frontend Error Boundary Architecture](../../80-adrs/ADR-032-frontend-error-boundary-architecture.md) (Tier 2: `PanelErrorBoundary`)

A rendering error in any single panel crashes the entire dashboard. ADR-032 §D3 defines `PanelErrorBoundary` specifically for this — per-panel isolation with `ErrorState variant="panel"` and query cache invalidation on reset. See P1-2 remediation for full implementation plan.

---

### P2-15: `transition-all` Anti-Pattern (5 instances) (1/5)

**Confirmed by:** S3 Accessibility

**Files:** `shift-right-rail.tsx:40`, `coverage-bar.tsx:81`, `quality-summary-card.tsx:68,74,80`

**Remediation:** Replace with specific property transitions.

---

### P2-16: No `prefers-reduced-motion` Respect (1/5)

**Confirmed by:** S3 Accessibility

Zero `motion-safe:` or `motion-reduce:` prefixes. 5+ animations present.

---

### P2-17: Heading Hierarchy Skips (h1 → no h2/h3) (1/5)

**Confirmed by:** S3 Accessibility

Only one `<h1>`. Section labels are `<p>` or `<span>`. Screen readers cannot navigate by headings.

---

### P2-18: Quality Summary Card Legend Uses Color-Only Indicators (1/5)

**Confirmed by:** S3 Accessibility

**Files:** `left-rail/quality-summary-card.tsx:87-100`

Three colored dots with numbers, no text labels. WCAG 1.4.1 violation.

---

### P2-19: Skeleton Loading States Lack Semantic Indicators (1/5)

**Confirmed by:** S3 Accessibility

All 9 skeleton loading locations use plain `<div>` with `animate-pulse`. No `role="status"` or `aria-busy`.

---

## P3 — Medium Issues

| ID | Stream | File | Issue |
|----|--------|------|-------|
| P3-1 | S1 | `alerts-strip.tsx:180-189` | Alerts sort/filter not memoized |
| P3-2 | S1 | `telemetry-rail-panel.tsx:135` | Table sort not memoized |
| P3-3 | S1 | `metrics-table.tsx:214` | filteredTables not memoized |
| P3-4 | S1 | `shift-dashboard-v3.tsx:6` | Cross-module V1 import coupling |
| P3-5 | S1 | `hooks/shift-dashboard/index.ts` | Legacy V1 hook barrel exports |
| P3-6 | S1 | `time-window-selector.tsx:92-96` | useState+useEffect instead of useMemo |
| P3-7 | S2 | `metrics-table.tsx:200-201` | selectedPitId not reset on time window change |
| P3-8 | S2 | `win-loss-trend-chart.tsx:103` | pit_id used as display label (may show UUID) |
| P3-9 | S2 | Various test files | Tautological/incomplete test assertions |
| P3-10 | S3 | `telemetry-rail-panel.tsx:98-108` | Pit accordion missing `aria-expanded` |
| P3-11 | S3 | `win-loss-trend-chart.tsx:125-138` | Series toggle missing `aria-pressed` |
| P3-12 | S3 | `metrics-table.tsx:275-430` | Tables missing `<caption>` and `scope="col"` |
| P3-13 | S4 | `metrics-table.tsx, win-loss-trend-chart.tsx` | No `useTransition` for tab/series toggles |
| P3-14 | S4 | `shift-dashboard-v3.tsx:59,84-88` | lastUpdate via separate state instead of `dataUpdatedAt` |
| P3-15 | S5 | `visitors-summary/route.ts:39` | `as any` type safety bypass on RPC call |

---

## P4 — Low Issues

| ID | Stream | File | Issue |
|----|--------|------|-------|
| P4-1 | S1 | `index.ts` | Barrel re-exports all 22 components |
| P4-2 | S1,S4 | `alerts-strip.tsx:246` | Alert key includes array index with stable ID |
| P4-3 | S2 | `shift-dashboard-v3.tsx:49-55` | getTimeSinceUpdate lacks upper-bound formatting |
| P4-4 | S4 | 12 leaf components | Redundant `'use client'` on presentational components |
| P4-5 | S4 | `use-cash-obs-summary.ts:13` | Unnecessary `'use client'` in hook file |
| P4-6 | S5 | `alerts-strip.tsx:247` | Internal entity UUIDs rendered in DOM keys |

---

## Remediation Phases

### Phase 1: Quick Wins (low risk, high impact)

- **P0-1**: Fix broken Tailwind classes in AlertItem — replace dynamic interpolation with static class map
- **P1-4**: Fix timeWindow lazy initializer — `useState(() => getDefaultWindow())`
- **P2-7**: Extract Recharts dot/activeDot config to module constants
- **P2-2**: Add `useMemo` to `computeQualityCounts`, sorted alerts, sorted tables, filtered tables
- **P1-3**: Destructure `isError`/`error` from query hooks, render error banner
- **P3-14**: Remove `lastUpdate` state, compute directly from `dataUpdatedAt`

### Phase 2: Structural Changes (medium risk)

- **P1-1**: Add `React.memo` to expensive subtrees (charts, table, rows, trust primitives)
- **P2-1**: Lazy-load Recharts via `next/dynamic` with `ssr: false`
- **P1-2**: Apply ADR-032 three-tier error boundary hierarchy (route `error.tsx` + `PanelErrorBoundary` + `QueryErrorResetBoundary`)
- **P2-3**: Align staleTime/refetchInterval across all 3 hooks to 60s
- **P2-8**: Extract shared `PitTable` from MetricsTable
- **P2-4**: Add RSC data prefetching with TanStack Query dehydrate/hydrate

### Phase 3: Security & Auth (higher risk)

- **P1-5**: Restore `middleware.ts` from `.bak` or implement replacement
- **P1-6**: Add auth enforcement to review route
- **P2-5**: Clear query cache on logout
- **P2-6**: Sanitize database error messages before client response
- **P3-15**: Remove `as any` on RPC call, regenerate types

### Phase 4: Accessibility (medium risk)

- **P0-2**: Add `aria-live` regions to all async content areas
- **P0-3**: Add `focus-visible` styles to all custom buttons
- **P1-9**: Add progressbar semantics to coverage bar
- **P1-10**: Add sr-only labels to quality indicators
- **P1-11**: Implement mobile alternatives for hidden rails
- **P2-15**: Replace `transition-all` with specific properties + `motion-safe:` prefix
- **P2-17**: Add proper heading hierarchy (h2/h3 for sections)
- **P3-10/P3-11/P3-12**: Add ARIA attributes to accordion, series toggles, tables

### Phase 5: Testing & Validation

- **P1-7**: Test coverage for `ShiftDashboardV3` orchestrator
- **P1-8**: Test coverage for `MetricsTable`
- **P2-9**: Test coverage for `AlertsStrip`
- **P2-13**: Test coverage for `TelemetryRailPanel`
- **P2-11/P2-12**: Add auth-path E2E tests with data-driven assertions

---

## Summary Scorecard

| Stream | P0 | P1 | P2 | P3 | P4 | Total |
|--------|:--:|:--:|:--:|:--:|:--:|:-----:|
| S1 Performance | 0 | 2 | 5 | 8 | 2 | **17** |
| S2 Quality | 0 | 4 | 7 | 5 | 2 | **18** |
| S3 Accessibility | 2 | 5 | 5 | 3 | 0 | **15** |
| S4 React/Next.js | 1 | 2 | 5 | 6 | 3 | **17** |
| S5 Security | 0 | 2 | 2 | 2 | 1 | **7** |
| **Deduplicated Total** | **3** | **11** | **19** | **15** | **6** | **54** |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation Phase |
|------|-----------|--------|-----------------|
| Full white-screen crash on API failure (no error boundary) | High | Critical | Phase 2 |
| Cross-tenant data exposure via cached query data | Medium | Critical | Phase 3 |
| Keyboard users cannot operate dashboard (no focus indicators) | High | High | Phase 4 |
| Screen readers receive no async update notifications | High | High | Phase 4 |
| Broken alert hover styles mislead pit boss severity assessment | High | Medium | Phase 1 |
| 5-9 unnecessary re-renders degrade TTI on cold mount | High | Medium | Phase 2 |
| Edge middleware disabled leaves non-protected routes open | Medium | High | Phase 3 |
| 60KB unnecessary Recharts in initial bundle degrades FCP | Medium | Medium | Phase 2 |

---

*Generated by PERF-007 Audit Swarm — 2026-02-02*

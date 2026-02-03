---
prd_id: PRD-026
title: "Shift Dashboard v3: Three-Panel Layout & Statistical Model Readiness"
status: Draft
version: 0.3.0
created: 2026-01-30
updated: 2026-01-30
author: Claude (frontend-design-pt-2)
priority: P1
category: FEATURE/SHIFT-DASHBOARD + UX/LAYOUT
bounded_contexts:
  - TableContextService (Read — inventory metrics)
  - RatingSlipService (Read — cash observations, telemetry)
  - CasinoService (Read — casino/pit hierarchy)
depends_on:
  - PRD-Shift-Dashboards-Implementation-v0.2 (existing BFF hooks + RPCs)
  - PRD-023 (Player 360 three-panel surface pattern)
supersedes:
  - app/review/shift-dashboard-v2 (interim layout)
tags: [shift-dashboard, three-panel, layout, statistical-model, ux-upgrade, ui-only]
---

# PRD-026: Shift Dashboard v3 — Three-Panel Layout & Statistical Model Readiness

## 1. Overview

| Field      | Value                                        |
|------------|----------------------------------------------|
| Owner      | Frontend / UX                                |
| Status     | Draft                                        |
| Summary    | Redesign the shift dashboard layout from the current flat grid into a **vertically scrollable three-panel surface** with sticky side rails, preserving all existing functionality while adding chart-based data visualization (radar chart for floor activity, line chart for win/loss trends) and creating structural slots for upcoming statistical model phases. **UI-only scope — no new data hooks, RPCs, or backend changes.** |

## 2. Problem & Goals

### Problem

The current shift dashboard v2 (`app/review/shift-dashboard-v2/`) uses a conventional stacked layout: header → hero KPI row → secondary KPIs → alerts → content grid. While functional, this layout has several shortcomings as the statistical model grows:

1. **No fixed reference points** — scrolling loses the hero KPI context. A shift manager checking table-level drill-downs loses sight of the casino-level win/loss.
2. **Flat hierarchy** — authoritative metrics and telemetry data compete for the same visual space rather than being spatially separated by data stream.
3. **No expansion slots** — adding utilization timelines (Phase 2), trending charts (Phase 3), or theoretical value cards (Phase 5) would further lengthen the page, worsening scroll fatigue.
4. **Inconsistent surface** — the pit-panel dashboard and Player 360 already use three-panel patterns. The shift dashboard is the only major operational surface without structured panel separation.
5. **No trend visualization** — win/loss, fills, and credits are displayed as aggregate totals. Shift managers cannot see how these metrics distribute across pits or evolve within the time window without drilling into individual rows.

### Goals

1. **G1**: Shift managers can view casino-level KPIs at all times while scrolling through detail sections (sticky left rail keeps hero W/L and KPIs anchored).
2. **G2**: Authoritative metrics (center panel) and telemetry/observational data (right rail) are spatially separated, reinforcing the two-data-stream model.
3. **G3**: The layout provides named expansion slots for Phases 2–5 of the statistical model without requiring future layout restructuring.
4. **G4**: All current shift dashboard v2 functionality (hero win/loss, secondary KPIs, floor activity, alerts, metrics table, telemetry drawer) is preserved with no data regressions.
5. **G5**: The center panel scrolls naturally, giving each content section (radar, line chart, table, alerts) the vertical space it needs without cramming.
6. **G6**: Win/loss trends are visualized as a labeled line chart, making per-pit performance comparison immediately legible without row-by-row reading.

### Non-Goals

- New data hooks, RPCs, or API routes (existing BFF hooks are reused as-is).
- Statistical model Phase 2+ metric computation (utilization, trending, theo).
- Mobile-first redesign (mobile remains single-column stacked; responsive breakpoints follow Player 360 precedent).
- Backend performance changes.

## 3. Users & Use Cases

### Primary Users

| Persona            | Role                      | Context                                      |
|--------------------|---------------------------|----------------------------------------------|
| **Shift Manager**  | Casino floor supervisor    | Monitors casino performance during 8–12h shifts from a desktop terminal in the pit |
| **Pit Boss**       | Pit area supervisor        | Drills into specific pit/table performance, cross-references telemetry quality       |
| **Operations Lead**| Multi-property oversight   | Glances at casino-level KPIs, reviews alerts, shares shift summaries                 |

### Jobs-to-Be-Done

- **JTB-1**: As a shift manager, I need casino-level win/loss always visible so I can contextualize any pit/table detail I drill into.
- **JTB-2**: As a pit boss, I need telemetry quality and cash observations in a dedicated rail so I can assess data confidence without switching views.
- **JTB-3**: As a shift manager, I need alerts visible alongside the metrics table so I can correlate spikes with specific pit/table data.
- **JTB-4**: As an operations lead, I need a consistent three-panel surface across dashboards (Player 360, Pit Panels, Shift Dashboard) so I don't relearn navigation patterns.

## 4. Scope & Feature List

### In-Scope

1. **Vertically scrollable three-panel layout** with sticky side rails. The page scrolls naturally; the left and right rails remain anchored via `position: sticky`.
2. **Left rail** (sticky) housing: Hero Win/Loss (compact), Secondary KPIs (Fills, Credits, Est. Drop), Quality Summary.
3. **Center panel** (scrollable) housing: **Floor Activity Radar**, **Win/Loss Trend Line Chart**, Metrics navigation tabs (Casino / By Pit / By Table), MetricsTable, AlertsStrip. Each section gets the vertical space it needs.
4. **Right rail** (sticky) housing: Telemetry panel (cash observations at casino/pit/table levels), Quality detail breakdown.
5. **Floor Activity chart upgrade**: Replace the custom SVG donut (`FloorActivityDonut`) with a **shadcn/ui Radar Chart** (`recharts RadarChart` via `ChartContainer`). The radar visualizes per-pit occupancy dimensions (rated count, unrated count, rated percentage) across pit areas.
6. **Win/Loss Trend Line Chart**: New **shadcn/ui Line Chart - Label** showing per-pit win/loss as labeled data points. Provides at-a-glance trend comparison across pits without reading table rows. Can extend to show fills/credits as secondary series.
7. **shadcn chart component installation**: Add `components/ui/chart.tsx` via `npx shadcn@latest add chart` with Recharts v3 compatibility patch (project uses `recharts ^3.2.1`).
8. **Sticky header** with title, time window selector, and coverage badge.
9. **Right rail collapse/expand** toggle (xl+ breakpoint, defaults expanded).
10. **Responsive degradation**: xl → three panels; lg → left rail + center; <lg → single column stacked.
11. **Named expansion slots** (empty containers with `data-slot` attributes) for future phases.
12. **Consistent design tokens** (color coding, typography, spacing) matching Player 360 and Pit Panels.

### Out-of-Scope

- New data fetching or backend logic.
- Utilization timeline component (Phase 2 — slot reserved).
- Trending/z-score charts (Phase 3 — slot reserved).
- Theoretical value cards (Phase 5 — slot reserved).
- Print/export layout.
- Drag-and-drop panel reordering.

## 5. Requirements

### Functional Requirements

| ID   | Requirement                                                                                 |
|------|---------------------------------------------------------------------------------------------|
| FR-1 | The page MUST scroll vertically as a natural document flow. The left and right rails MUST use `position: sticky; top: <header-height>` to remain anchored while the center panel content scrolls. The root container MUST NOT be viewport-locked (`overflow-hidden`). |
| FR-2 | The left rail MUST render Hero Win/Loss (compact), Secondary KPIs (Fills, Credits, Est. Drop), and a Quality Summary section. |
| FR-3 | The center panel MUST render, in order: (1) Floor Activity Radar, (2) Win/Loss Trend Line Chart, (3) tab navigation (Casino / By Pit / By Table) with MetricsTable, (4) AlertsStrip. Each section occupies full center-panel width with natural vertical spacing (`space-y-6`). |
| FR-3a | The Floor Activity Radar MUST replace the current custom SVG donut with a shadcn/ui Radar Chart (`ChartContainer` + recharts `RadarChart`). The radar MUST display per-pit breakdown axes showing rated count, unrated count, and rated percentage. When only casino-level data is available (no per-pit breakdown), it MUST fall back to a two-axis radar (rated vs unrated) preserving the current data contract. |
| FR-3b | The Floor Activity Radar MUST preserve the existing `FloorActivityDonutProps` data contract (`ratedCount`, `unratedCount`, `ratedPercentage`, `isLoading`) and extend it with an optional `pitBreakdown` prop for per-pit axis data when available. |
| FR-3c | The Win/Loss Trend Line Chart MUST use the shadcn/ui Line Chart - Label pattern (`LineChart` + `Line` with `LabelList`). It MUST plot per-pit win/loss values as labeled data points (one point per pit on the x-axis, win/loss cents on the y-axis). |
| FR-3d | The Win/Loss Trend Line Chart MUST support an optional secondary series toggle for fills and credits (multi-line with legend). The default view shows win/loss only. |
| FR-3e | The Win/Loss Trend Line Chart MUST consume `pitsData` from `useShiftDashboardSummary` (already available). No new API calls. When `pitsData` is empty or loading, it MUST show a skeleton placeholder matching the chart's `min-h-[250px]` container. |
| FR-4 | The right rail MUST render the Telemetry panel (refactored from TelemetryDrawer) showing cash observations at the currently selected drill-down level. |
| FR-5 | Drill-down navigation (casino → pit → table) in the center panel MUST NOT cause layout reflow in the left or right rails. |
| FR-6 | The right rail MUST be collapsible to a 48px icon strip at xl+ breakpoints. Collapse state persists for the session (React state, not localStorage). |
| FR-7 | At breakpoints <lg, the layout MUST degrade to a single-column stacked layout preserving the current v2 rendering order. |
| FR-8 | The sticky header MUST display: dashboard title, time window selector (right-aligned), last-updated indicator, and a loading spinner during data fetches. |
| FR-9 | The layout MUST include empty expansion slot containers (`data-slot="utilization-timeline"`, `data-slot="trending-charts"`, `data-slot="theo-cards"`) that render nothing but reserve structural position. |
| FR-10 | All existing v2 component props and data bindings MUST be preserved — components are repositioned, not rewritten. |
| FR-11 | The project MUST install the shadcn chart component (`npx shadcn@latest add chart`) and apply the Recharts v3 compatibility patch to `components/ui/chart.tsx` before implementing the radar or line charts. |

### Non-Functional Requirements

| ID    | Requirement                                                                      |
|-------|----------------------------------------------------------------------------------|
| NFR-1 | Layout shift (CLS) MUST be < 0.1 during data loading transitions.                |
| NFR-2 | Sticky rails MUST remain anchored during vertical page scroll without jitter or repaint flicker. Rails MUST NOT scroll independently — they stick in place while the center content scrolls past. |
| NFR-3 | All text MUST meet WCAG 2.1 AA contrast ratios (4.5:1 body, 3:1 large).          |
| NFR-4 | Tab order MUST follow left-to-right, top-to-bottom across the three panels.        |
| NFR-5 | The layout MUST render correctly in Chromium and Firefox latest stable releases.    |

### Architecture References

- **Player 360 layout pattern**: `components/player-360/layout.tsx` (three-panel reference; shift dashboard adapts to sticky-rail scrollable variant)
- **Pit Panels pattern**: `components/pit-panels/panel-container.tsx` (tab navigation, collapsible sidebar)
- **shadcn/ui Charts**: Radar Chart + Line Chart - Label patterns (recharts v3 via ChartContainer)
- **Existing hooks**: `hooks/shift-dashboard/` (useShiftDashboardSummary, useCashObsSummary, useActiveVisitorsSummary)
- **Statistical model**: `docs/00-vision/shift-dashboards/shift-dashboard-statistical-model-mvp-outline.md`

## 6. Layout Specification

### Three-Panel Structure

```
xl+ (>= 1280px) — page scrolls vertically; side rails stick

┌──────────────────────────────────────────────────────────────────────────┐
│  STICKY HEADER (position: sticky, top: 0, z-30)                         │
│  ┌────────────────────────────────────────────────┬──────────────────┐   │
│  │ "Shift Dashboard"  •  Last updated 32s ago     │ [TimeWindow ▾]   │   │
│  └────────────────────────────────────────────────┴──────────────────┘   │
├──────────────────────────────────────────────────────────────────────────┤
│  BODY (flex, gap-6, min-h-0) — page scroll drives content              │
│  ┌──────────────┬──────────────────────────────────┬─────────────────┐  │
│  │ LEFT RAIL    │ CENTER PANEL                     │ RIGHT RAIL      │  │
│  │ sticky       │ flex-1 (natural flow)            │ sticky          │  │
│  │ top: 64px    │                                  │ top: 64px       │  │
│  │ self-start   │                                  │ self-start      │  │
│  │ w-72 xl:w-80 │                                  │ w-80 / w-12     │  │
│  │ border-r     │                                  │ border-l        │  │
│  ├──────────────┼──────────────────────────────────┼─────────────────┤  │
│  │              │                                  │                 │  │
│  │ ┌──────────┐│ ┌──────────────────────────────┐  │ TELEMETRY PANEL │  │
│  │ │HERO W/L  ││ │  FLOOR ACTIVITY RADAR        │  │                 │  │
│  │ │(compact) ││ │                              │  │ Casino Totals   │  │
│  │ │          ││ │    Pit C                      │  │ • Est Cash-Out  │  │
│  │ │ +$47,200 ││ │   ╱    ╲     68% rated       │  │ • Confirmed     │  │
│  │ └──────────┘│ │  ╱  ●●  ╲    142 active      │  │ • Obs Count     │  │
│  │              │ │ Pit B ── Pit A  Legend:       │  │                 │  │
│  │ ┌──────────┐│ │  ╲      ╱   ■ Rated          │  │ ───────────────│  │
│  │ │Fills     ││ │   ╲    ╱    □ Unrated         │  │                 │  │
│  │ │ $52,300  ││ │    Pit D                      │  │ By Pit          │  │
│  │ └──────────┘│ │                              │  │ • Pit A: $xxx   │  │
│  │ ┌──────────┐│ │  (shadcn RadarChart via       │  │ • Pit B: $xxx   │  │
│  │ │Credits   ││ │   ChartContainer + recharts)  │  │                 │  │
│  │ │ $12,100  ││ └──────────────────────────────┘  │ ───────────────│  │
│  │ └──────────┘│                                   │                 │  │
│  │ ┌──────────┐│ ┌──────────────────────────────┐  │ Top Tables      │  │
│  │ │Est. Drop ││ │  WIN/LOSS TREND (Line Chart)  │  │ (by obs count)  │  │
│  │ │ $98,500  ││ │                              │  │ • T-1: $x (5)   │  │
│  │ └──────────┘│ │  +12k •                       │  │ • T-2: $x (3)   │  │
│  │              │ │       \    +8k •              │  │                 │  │
│  │ ─────────── │ │        \  /                   │  │ ───────────────│  │
│  │              │ │    -3k •                      │  │                 │  │
│  │ ┌──────────┐│ │  ───┼─────┼─────┼───         │  │ QUALITY DETAIL  │  │
│  │ │QUALITY   ││ │    Pit A  Pit B  Pit C        │  │ • Good: 12      │  │
│  │ │SUMMARY   ││ │                              │  │ • Low: 3        │  │
│  │ │ 75% cov  ││ │  [■ Win/Loss] [□ Fills]      │  │ • None: 1       │  │
│  │ └──────────┘│ │  (toggle: + Credits)          │  │                 │  │
│  │              │ └──────────────────────────────┘  │ ┌ ─ ─ ─ ─ ─ ─ ┐│  │
│  │ ┌ ─ ─ ─ ─ ┐│                                   │  data-slot=    ││  │
│  │  data-slot= ││ Tab Bar                           │ │"theo-sidebar"││  │
│  │ │"theo-kpi" ││ [Casino] [By Pit] [By Table]      │  (Phase 5)     ││  │
│  │  (Phase 5)  ││                                   │ └ ─ ─ ─ ─ ─ ─ ┘│  │
│  │ └ ─ ─ ─ ─ ┘│ ┌──────────────────────────────┐  │                 │  │
│  │              │ │     MetricsTable              │  │                 │  │
│  │    (sticky   │ │     (full width)              │  │    (sticky     │  │
│  │     rails    │ │                              │  │     rails      │  │
│  │     stay     │ │  Pit | W/L  | Fills | Cred  │  │     stay       │  │
│  │     anchored │ │  ────┼──────┼───────┼────── │  │     anchored   │  │
│  │     while    │ │  A   | +12k | 5.2k  | 1.1k │  │     while      │  │
│  │     center   │ │  B   | -3k  | 2.1k  | 0.8k │  │     center     │  │
│  │     scrolls) │ │  C   | +8k  | 3.0k  | 0.5k │  │     scrolls)   │  │
│  │              │ └──────────────────────────────┘  │                 │  │
│  │              │                                   │                 │  │
│  │              │ ┌──────────────────────────────┐  │                 │  │
│  │              │ │ AlertsStrip                  │  │                 │  │
│  │              │ │ [!] Cash-out spike Pit A     │  │                 │  │
│  │              │ │ [!] Low coverage Table 12    │  │                 │  │
│  │              │ └──────────────────────────────┘  │                 │  │
│  │              │                                   │                 │  │
│  │              │ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │                 │  │
│  │              │   data-slot="utilization"         │                 │  │
│  │              │ │ (Phase 2 — empty)            │  │                 │  │
│  │              │ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │                 │  │
│  │              │                                   │                 │  │
│  │              │ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │                 │  │
│  │              │   data-slot="trending"            │                 │  │
│  │              │ │ (Phase 3 — empty)            │  │                 │  │
│  │              │ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │                 │  │
│  └──────────────┴──────────────────────────────────┴─────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Scroll behavior:** The browser's native vertical scroll drives the page. The center panel's content (radar → line chart → table → alerts → slots) flows naturally downward. The left and right rails use `position: sticky; top: 64px; align-self: flex-start` to remain anchored at the header's bottom edge as the user scrolls. When the rail content exceeds viewport height, the rail itself becomes scrollable (`max-h-[calc(100vh-64px)] overflow-y-auto`).

### Responsive Breakpoints

| Breakpoint     | Left Rail          | Center Panel | Right Rail            |
|----------------|--------------------|--------------|-----------------------|
| < lg (<1024px) | Hidden             | Full width   | Hidden                |
| lg (1024–1279) | Visible (w-72)     | Flexible     | Hidden                |
| xl+ (>=1280)   | Visible (w-80)     | Flexible     | Visible (w-80, collapsible to w-12) |

At < lg, components render in stacked order: Header → Hero W/L → Secondary KPIs → Floor Activity Radar → Quality Summary → Metrics Table → Alerts → Telemetry Panel.

### Left Rail Content Budget

The left rail follows the Player 360 "content budget" approach:

**Above the fold (~340px):**
1. Hero Win/Loss Card (compact variant, ~120px) — always visible
2. Secondary KPI stack (Fills, Credits, Est. Drop, ~180px) — always visible

**Below the fold (scrollable):**
3. Quality Summary (~80px) — coverage percentage, grade distribution
4. *Future: Theoretical Value KPIs (Phase 5 slot)*

> **Note:** Floor Activity is promoted to the center panel (see §6.4) to give the radar chart sufficient width and visual prominence as an occupancy trends surface.

### Center Panel Sections

Content flows vertically with `space-y-6` between sections. No cramming — each section gets the height it needs.

1. **Floor Activity Radar** — Promoted from v2 sidebar to center-panel hero position. Occupancy trends visualization using shadcn/ui Radar Chart. See §6.4 for chart specification.
2. **Win/Loss Trend Line Chart** — Per-pit win/loss as labeled data points with optional fills/credits toggle. See §6.5 for chart specification.
3. **Metrics Tab Bar** — Casino | By Pit | By Table
4. **MetricsTable** — Full-width table, existing component repositioned
5. **AlertsStrip** — Below the table, existing component repositioned
6. *Future: Utilization Timeline (Phase 2 slot)*
7. *Future: Trending Charts (Phase 3 slot)*

### 6.4 Floor Activity Radar — Chart Specification

**Rationale:** The current `FloorActivityDonut` is a 2-segment SVG donut showing a single casino-level rated/unrated ratio. This provides limited insight — a shift manager cannot see which pits drive the ratio. A radar chart adds per-pit dimensional axes, making occupancy trends spatially legible alongside the metrics table below it.

**Chart technology:**
- `@/components/ui/chart` — shadcn `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`
- `recharts` — `RadarChart`, `Radar`, `PolarAngleAxis`, `PolarGrid`
- Recharts v3 compatibility: The standard shadcn `chart.tsx` targets Recharts v2. Since this project uses `recharts ^3.2.1`, the generated `components/ui/chart.tsx` MUST be patched with the Recharts v3-compatible drop-in (see [noxify/chart.tsx gist](https://gist.github.com/noxify/92bc410cc2d01109f4160002da9a61e5) or shadcn PR #8486).

**Data model:**

```typescript
// Casino-level fallback (current data contract — always available)
interface FloorActivityRadarProps {
  ratedCount: number;        // gaming_identified_rated
  unratedCount: number;      // gaming_ghost_unrated
  ratedPercentage?: number;  // pre-computed
  isLoading?: boolean;

  // Per-pit breakdown (optional — enhances radar when available)
  pitBreakdown?: Array<{
    pitLabel: string;        // e.g. "Pit A"
    pitId: string;
    ratedCount: number;
    unratedCount: number;
  }>;
}
```

**Radar axes:**
- **With `pitBreakdown`**: One axis per pit. Each axis shows rated (emerald fill, 0.6 opacity) and unrated (slate fill, 0.3 opacity) as overlaid radar polygons. `PolarAngleAxis dataKey="pitLabel"`.
- **Without `pitBreakdown`** (fallback): Two-axis radar with "Rated" and "Unrated" as categories, single polygon. Visually similar to the current donut but rendered via the radar chart for consistency.

**Chart configuration:**

```typescript
const chartConfig = {
  rated: {
    label: 'Rated Visitors',
    color: 'var(--color-emerald-500)',  // or theme token
  },
  unrated: {
    label: 'Unrated Visitors',
    color: 'var(--color-slate-600)',
  },
} satisfies ChartConfig;
```

**Visual requirements:**
- `min-h-[200px]` on `ChartContainer` for responsive sizing
- `PolarGrid` with `gridType="circle"` for clean circular grid lines
- `ChartTooltip` showing count + percentage on hover
- `ChartLegend` below chart with rated/unrated labels
- Key insight callout preserved: `"X% of floor generating value"` (emerald callout box below chart)
- Card wrapper matching the shadcn Card styling used by other dashboard sections

**Loading state:** Skeleton matching `min-h-[200px]` card with centered circular placeholder.

### 6.5 Win/Loss Trend Line Chart — Chart Specification

**Rationale:** The MetricsTable shows per-pit numbers in rows, but comparing across pits requires mental math. A labeled line chart makes relative performance instantly legible — the shape of the line tells the story (which pit is up, which is down) while labels provide exact values without hovering.

**Chart technology:**
- `@/components/ui/chart` — `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`
- `recharts` — `LineChart`, `Line`, `CartesianGrid`, `XAxis`, `LabelList`

**Data model:**

```typescript
interface WinLossTrendChartProps {
  pitsData: ShiftPitMetricsDTO[] | undefined;
  isLoading?: boolean;
  /** Which series to show. Default: ['winLoss'] */
  visibleSeries?: Array<'winLoss' | 'fills' | 'credits'>;
}

// Transformed for recharts consumption:
type ChartDataPoint = {
  pitLabel: string;             // x-axis category
  winLoss: number;              // win_loss_estimated_total_cents → dollars
  fills: number;                // fills_total_cents → dollars
  credits: number;              // credits_total_cents → dollars
};
```

**Chart configuration:**

```typescript
const chartConfig = {
  winLoss: {
    label: 'Win/Loss',
    color: 'var(--chart-1)',    // emerald for positive context
  },
  fills: {
    label: 'Fills',
    color: 'var(--chart-2)',    // blue
  },
  credits: {
    label: 'Credits',
    color: 'var(--chart-3)',    // violet
  },
} satisfies ChartConfig;
```

**Visual requirements:**
- `min-h-[250px]` on `ChartContainer`
- `margin: { top: 20, left: 12, right: 12 }` on `LineChart` (room for labels)
- `CartesianGrid vertical={false}` — horizontal grid lines only
- `XAxis` with pit labels, `tickLine={false}`, `axisLine={false}`
- No `YAxis` — labeled data points make the y-axis redundant (Label variant pattern)
- Primary `Line` (win/loss): `type="natural"`, `strokeWidth={2}`, emerald color
  - `dot={{ fill: "var(--color-winLoss)" }}`
  - `activeDot={{ r: 6 }}`
  - `<LabelList position="top" offset={12} className="fill-foreground" fontSize={12} />`
- Secondary `Line`(s) (fills, credits): shown only when toggled via `visibleSeries`
  - Same `LabelList` pattern, different colors
  - `ChartLegend` appears when multiple series are active
- `ChartTooltip` with `indicator="line"` showing formatted dollar values
- Card wrapper with header: "Win/Loss by Pit" and toggle buttons for series visibility
- Dollar values formatted with `formatCurrency()` (reuse existing formatter from v2 `lib/format`)

**Series toggle UX:**
- Default view: Win/Loss line only (clean, uncluttered)
- Toggle buttons (small, pill-style) in card header: `[Win/Loss ✓] [Fills] [Credits]`
- Active series get filled button style; inactive get outline
- Multiple series can be active simultaneously (multi-line with legend)

**Loading state:** Skeleton matching `min-h-[250px]` card with horizontal line placeholders.

**Empty state:** When `pitsData` is empty or has < 2 pits, show a centered message: "Pit data unavailable for trend visualization".

### Right Rail Sections

1. **Telemetry Panel** — Refactored from TelemetryDrawer into a rail-native layout:
   - Casino totals (always shown)
   - By-pit breakdown (collapsible)
   - Top tables by observation count (top 5)
2. **Quality Detail** — Per-quality-tier table counts (GOOD / LOW / NONE)
3. *Future: Theoretical Sidebar (Phase 5 slot)*

**Collapsed state (w-12):** Shows vertical icon strip — telemetry icon + quality icon. Click expands to full width.

### Component Mapping (v2 → v3)

| v2 Component         | v3 Location          | Changes                                      |
|-----------------------|----------------------|----------------------------------------------|
| HeroWinLossCard       | Left Rail (top)      | Compact variant: remove trend, reduce to text-3xl hero value |
| SecondaryKpisRow      | Left Rail            | Vertical stack (3 cards), not horizontal grid |
| FloorActivityDonut    | **Center Panel (top)** | **Replaced** with `FloorActivityRadar` using shadcn Radar Chart. Promoted from sidebar to center panel for full-width occupancy visualization. Data contract preserved + extended with optional `pitBreakdown`. |
| MetricsTable          | Center Panel         | Full width, no col-span constraints           |
| AlertsStrip           | Center Panel         | Below metrics table                           |
| TelemetryDrawer       | Right Rail           | Refactored from collapsible drawer to rail panel (always visible when rail is open) |
| TimeWindowSelector    | Sticky Header        | Repositioned to header right (same component) |

### New Components Required

| Component               | Location      | Purpose                                        |
|-------------------------|---------------|------------------------------------------------|
| `ShiftDashboardLayout`  | Layout        | Three-panel container with sticky rails and scrollable center |
| `ShiftLeftRail`         | Left Rail     | Sticky rail wrapper (`position: sticky`) with content budget |
| `ShiftCenterPanel`      | Center        | Natural-flow center panel (`space-y-6`)         |
| `ShiftRightRail`        | Right Rail    | Sticky, collapsible rail wrapper                |
| `HeroWinLossCompact`    | Left Rail     | Compact variant of HeroWinLossCard              |
| `SecondaryKpiStack`     | Left Rail     | Vertical stack layout for secondary KPIs        |
| `QualitySummaryCard`    | Left Rail     | Coverage % + grade distribution mini-card       |
| `FloorActivityRadar`    | Center Panel  | **New.** Replaces `FloorActivityDonut`. shadcn Radar Chart showing per-pit occupancy breakdown (rated/unrated). Falls back to 2-axis radar when pit breakdown unavailable. |
| `WinLossTrendChart`     | Center Panel  | **New.** shadcn Line Chart - Label showing per-pit win/loss with optional fills/credits series toggle. Consumes existing `pitsData` from `useShiftDashboardSummary`. |
| `TelemetryRailPanel`    | Right Rail    | Rail-native refactor of TelemetryDrawer         |
| `QualityDetailCard`     | Right Rail    | Per-tier breakdown (GOOD/LOW/NONE counts)       |
| `RailCollapseToggle`    | Right Rail    | Collapse/expand button for right rail           |
| `components/ui/chart`   | UI library    | **New.** shadcn chart component (Recharts v3-patched). Provides `ChartContainer`, `ChartTooltip`, `ChartLegend`. |

### Expansion Slots

Named slots reserve structural position for future statistical model phases:

| Slot Name                | Location      | Phase | Purpose                            |
|--------------------------|---------------|-------|------------------------------------|
| `utilization-timeline`   | Center Panel  | 2     | Table open/close timeline chart     |
| `trending-charts`        | Center Panel  | 3     | 7d/30d rolling mean, z-score charts |
| `theo-kpi`               | Left Rail     | 5     | Theo amount, handle, win-minus-theo |
| `theo-sidebar`           | Right Rail    | 5     | Theoretical breakdown by game type  |

Slots render as empty `<div data-slot="name" />` elements with no visual footprint until populated.

## 7. UX Flow

1. **Page load** → Sticky header renders with time window selector. Left rail shows loading skeletons (matching compact card dimensions). Center shows chart + table skeletons. Right rail shows telemetry skeleton.
2. **Data arrives** → Left rail populates top-down: Hero W/L → KPIs → Quality. Center populates top-down: Floor Activity Radar → Win/Loss Trend → MetricsTable → Alerts. Right rail populates telemetry panel.
3. **Vertical scroll** → User scrolls down past the radar and line chart to reach the metrics table. Left and right rails remain sticky-anchored at the header bottom edge, always visible as reference context.
4. **Line chart series toggle** → User clicks "Fills" pill in chart header → fills line appears overlaid on win/loss with legend. Multiple series can be active simultaneously.
5. **Pit drill-down** → User clicks pit row in center → table tab activates with pit filter. Left and right rails remain stable (no reflow). Right rail telemetry updates to show pit-level observations.
6. **Right rail collapse** → User clicks collapse toggle → rail animates to w-12 icon strip. Center panel expands to fill. Toggle click re-expands.
7. **Time window change** → All three panels show loading indicators simultaneously. Data refreshes in place without layout shift.
8. **Mobile (<lg)** → Layout degrades to single column. Components stack in logical reading order: Header → Hero W/L → KPIs → Floor Activity Radar → Win/Loss Trend → Quality → Metrics Table → Alerts → Telemetry Panel. No hidden functionality.

## 8. Dependencies & Risks

### Dependencies

| Dependency                          | Status        | Impact if Blocked                          |
|-------------------------------------|---------------|--------------------------------------------|
| Player 360 layout pattern code      | Shipped       | Reference implementation for three-panel    |
| Existing BFF hooks (shift-dashboard)| Shipped       | Data layer — no changes needed              |
| All v2 components                   | Shipped       | Repositioned, not rewritten                 |
| shadcn/ui Card, Tabs, Tooltip       | Available     | Used in new wrapper components              |
| recharts ^3.2.1                     | Installed     | Already in package.json                     |
| shadcn chart component              | **Not installed** | Must run `npx shadcn@latest add chart` + apply Recharts v3 patch |

### Risks & Mitigations

| Risk                                              | Likelihood | Mitigation                                          |
|---------------------------------------------------|------------|-----------------------------------------------------|
| Left rail content exceeds above-fold budget        | Medium     | Compact card variants with strict height constraints; Floor Activity moved to center panel frees ~100px |
| Recharts v3 incompatibility with shadcn chart.tsx  | High       | Apply community Recharts v3 patch immediately after `npx shadcn@latest add chart`; verified working in production projects |
| Right rail collapse animation causes jank          | Low        | Use CSS `transition-all duration-200` (proven in Player 360) |
| Independent scroll areas confuse mobile users      | N/A        | Mobile uses single-column stacked (no rail scroll)  |
| Future phase components don't fit expansion slots   | Low        | Slots are structural markers, not size-constrained  |

## 9. Definition of Done

### Functionality
- [ ] Three-panel layout renders at xl+ with sticky side rails and vertically scrollable center
- [ ] Sticky rails remain anchored during vertical scroll without jitter
- [ ] All v2 components render with correct data bindings (no data regressions)
- [ ] Floor Activity Radar renders in center panel with rated/unrated overlaid polygons
- [ ] Floor Activity Radar falls back gracefully when `pitBreakdown` is undefined (2-axis mode)
- [ ] Win/Loss Trend Line Chart renders per-pit labeled data points from `pitsData`
- [ ] Win/Loss Trend Line Chart series toggle (Fills, Credits) adds/removes lines dynamically
- [ ] Right rail collapses/expands with smooth animation
- [ ] Responsive degradation works at lg (2 panels) and <lg (1 column)
- [ ] Drill-down from casino → pit → table updates center panel without left/right rail reflow

### Data & Integrity
- [ ] All existing BFF hooks are consumed with identical query parameters
- [ ] `FloorActivityRadar` consumes the same `useActiveVisitorsSummary` data with no new API calls
- [ ] `WinLossTrendChart` consumes `pitsData` from existing `useShiftDashboardSummary` with no new API calls
- [ ] No new API calls introduced

### Security & Access
- [ ] No new data endpoints or RLS surface area (UI-only change)

### Testing
- [ ] Playwright visual regression test at xl, lg, and mobile breakpoints
- [ ] Component render tests for new layout wrappers (ShiftDashboardLayout, ShiftLeftRail, ShiftCenterPanel, ShiftRightRail)

### Operational Readiness
- [ ] Bundle size increase < 15KB gzipped (layout wrappers + shadcn chart component; recharts already tree-shaken)
- [ ] CLS < 0.1 verified via Lighthouse
- [ ] `components/ui/chart.tsx` passes `npm run type-check` with recharts v3

### Documentation
- [ ] Component mapping table in this PRD updated if implementation deviates

## 10. Related Documents

| Category         | Document                                                                  |
|------------------|---------------------------------------------------------------------------|
| Vision           | `docs/00-vision/shift-dashboards/shift-dashboard-statistical-model-mvp-outline.md` |
| Architecture     | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v4.11.0)         |
| Prior PRD        | `docs/10-prd/PRD-Shift-Dashboards-Implementation-v0.2.md`                |
| Pattern Source   | `docs/10-prd/PRD-023-player-360-panels-v0.md` (three-panel reference)     |
| Interim Code     | `app/review/shift-dashboard-v2/shift-dashboard-v2.tsx`                    |
| Hooks            | `hooks/shift-dashboard/` (BFF hooks, query keys)                          |
| Governance       | `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`                        |

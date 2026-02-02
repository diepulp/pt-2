---
title: "Shift Dashboard Precis — Metrics Model & UI Clarification"
status: current
created: 2026-02-02
scope: "Complete reference for what the shift dashboard measures, how it computes, what it shows, and how it communicates trust"
related:
  - SHIFT_DASHBOARD_DATA_PIPELINE_STATUS.md
  - shift-dashboard-statistical-model-mvp-outline.md
  - ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md
  - docs/25-api-data/SHIFT_METRICS_CONTRACT_v1.md
---

# Shift Dashboard Precis

## What This Document Is

A single-page clarification of the shift dashboard: what it measures, where the numbers come from, how they flow through the system, and how the UI communicates confidence. Written for anyone who needs to understand the dashboard without reading 10 separate specs.

---

## 1. The Problem It Solves

A shift manager oversees a casino floor for 8 hours. During that window they need to answer:

- **Casino level**: "How is the property doing this shift?" — total win/loss, fills, credits, estimated drop.
- **Pit level**: "Which pit needs attention?" — compare pits by performance and data quality.
- **Table level**: "What is happening at this table and can I trust the number?" — individual table metrics with provenance.

The dashboard consolidates inventory records, telemetry observations, and alert signals into a single view with explicit trust indicators so the manager knows which numbers are authoritative and which are estimates.

---

## 2. Two Data Streams

Every metric on the dashboard originates from one of two streams. They are never mixed without labeling.

### Authoritative (Inventory-Based)

Physical chip counts and custody events. These are the accounting backbone.

| Metric | What It Represents | Source |
|--------|--------------------|--------|
| Opening bankroll | Chip tray count at shift start | `table_inventory_snapshot` (type=open) |
| Closing bankroll | Chip tray count at shift end | `table_inventory_snapshot` (type=close) |
| Fills | Chips delivered to table from cage | `table_fill` |
| Credits | Chips removed from table to cage | `table_credit` |
| Win/Loss (inventory) | `opening + fills - credits - closing` | Computed from above |

Win/loss inventory is the gold standard. It requires both opening and closing snapshots to exist. When either is missing, the value is `null` — never zero.

### Telemetry (Observational)

Estimated activity from buy-in tracking and cash observations. Useful for operational awareness but not accounting-grade.

| Metric | What It Represents | Source |
|--------|--------------------|--------|
| Estimated drop (rated) | Buy-ins from identified players | `table_buyin_telemetry` (RATED_BUYIN) |
| Estimated drop (grind) | Buy-ins from unrated players | `table_buyin_telemetry` (GRIND_BUYIN) |
| Estimated drop (total) | rated + grind | Computed |
| Cash-out observed (estimate) | Floor-reported cash-outs | `pit_cash_observation` (estimate) |
| Cash-out observed (confirmed) | Cage-confirmed cash-outs | `pit_cash_observation` (cage_confirmed) |
| Win/Loss (estimated) | Inventory win/loss adjusted by estimated drop | Computed |

Telemetry quality depends on whether both rated and grind buy-ins are tracked:

| Quality | Meaning | Criteria |
|---------|---------|----------|
| `GOOD_COVERAGE` | Full tracking | grind_count > 0 |
| `LOW_COVERAGE` | Rated only | rated_count > 0, grind_count = 0 |
| `NONE` | No buy-in data | rated_count = 0, grind_count = 0 |

---

## 3. Aggregation Hierarchy

```
Table metrics (from RPC)
  └──► Pit metrics (client-side aggregation from tables)
        └──► Casino metrics (client-side aggregation from ALL tables)
              └──► BFF envelope (single HTTP response)
```

The database RPC (`rpc_shift_table_metrics`) returns per-table rows. The service layer aggregates these into pit and casino summaries on the server, then returns everything in a single `ShiftDashboardSummaryDTO` to minimize HTTP round-trips (7 calls compressed to 1).

Casino aggregation is computed from all tables directly, not from pits. This avoids double-counting tables with no pit assignment.

---

## 4. Trust Layer

The dashboard never presents a number without context about its reliability.

### 4.1 Provenance Metadata

Every metric entity (table, pit, casino) carries:

```
{
  source:         'inventory' | 'telemetry' | 'mixed'
  grade:          'ESTIMATE' | 'AUTHORITATIVE'
  quality:        'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE'
  coverage_ratio: 0.0 to 1.0
  null_reasons:   ['missing_opening', 'missing_closing', 'misaligned', 'partial_coverage']
}
```

### 4.2 Rollup Semantics (Worst-Of)

When aggregating from tables to pits or casino:

- **Grade** = ESTIMATE if any child table is ESTIMATE
- **Quality** = minimum quality across all child tables
- **Source** = 'mixed' if children have different sources
- **Coverage ratio** = MIN(tables_with_opening, tables_with_closing) / total_tables
- **Null reasons** = deduplicated union of all child reasons

This is conservative by design. A pit with 9 good tables and 1 bad table reports the quality of the bad table. Operators see the weakest link.

### 4.3 Coverage Tiers

| Tier | Range | Color |
|------|-------|-------|
| HIGH | >= 80% | Emerald |
| MEDIUM | 50-79% | Amber |
| LOW | 1-49% | Red |
| NONE | 0% | Gray |

### 4.4 Alert Severity Guardrails

Cash-out spike alerts from telemetry carry a base severity computed from threshold ratios. This severity is then **capped** by the telemetry quality of the source entity:

| Telemetry Quality | Maximum Severity |
|-------------------|-----------------|
| GOOD_COVERAGE | critical |
| LOW_COVERAGE | warn |
| NONE | info |

If a table with `LOW_COVERAGE` triggers what would be a critical alert, the dashboard downgrades it to warn and annotates: "Downgraded from critical — low telemetry coverage." The system will never produce a critical alert from unreliable data.

---

## 5. UI Architecture (V3 — Three-Panel Layout)

The V3 dashboard uses a three-panel layout optimized for shift manager triage speed.

```
┌─────────────────────────────────────────────────────────────────────┐
│  STICKY HEADER                                                       │
│  Shift Dashboard · 23s ago     [Time Window: Last 8 hours ▼]       │
│  ████████████████████░░░░  (coverage bar — 82% HIGH)                │
├──────────┬─────────────────────────────────┬────────────────────────┤
│          │                                 │                        │
│  LEFT    │       CENTER PANEL              │  RIGHT RAIL            │
│  RAIL    │                                 │  (collapsible)         │
│  240px   │  ┌────────────┬────────────┐    │                        │
│  sticky  │  │Floor       │Win/Loss    │    │  Telemetry             │
│          │  │Activity    │Trend       │    │  (cash observations)   │
│ ┌──────┐ │  │Radar       │by Pit      │    │                        │
│ │Win/  │ │  └────────────┴────────────┘    │  Quality Detail        │
│ │Loss  │ │                                 │  ● Good  12            │
│ │$42K  │ │  Alerts (2)                     │  ● Low    3            │
│ │ Est ▴│ │  ┌─────────────────────────┐    │  ● None   1            │
│ └──────┘ │  │ ⚠ warn  BJ-04          │    │                        │
│          │  │ Cash-out $8.2K > $5K    │    │                        │
│ ┌──────┐ │  │ Downgraded from critical│    │                        │
│ │Fills │ │  └─────────────────────────┘    │                        │
│ │$18K  │ │                                 │                        │
│ ├──────┤ │  Metrics Table                  │                        │
│ │Credit│ │  [Casino] [By Pit] [By Table]   │                        │
│ │$6K   │ │  ┌────┬───────┬─────┬────┬───┐  │                        │
│ ├──────┤ │  │Pit │W/L    │Fills│Cov │Tbl│  │                        │
│ │Est.  │ │  │A   │$22K   │$10K │████│ 8 │  │                        │
│ │Drop  │ │  │B   │$20K   │$8K  │██░░│ 5 │  │                        │
│ │$31K  │ │  └────┴───────┴─────┴────┴───┘  │                        │
│ │ Est ▴│ │                                 │                        │
│ └──────┘ │  By Table view adds:            │                        │
│          │  Quality + Grade columns         │                        │
│ ┌──────┐ │                                 │                        │
│ │Qualit│ │                                 │                        │
│ │██▓░░ │ │                                 │                        │
│ │12/3/1│ │                                 │                        │
│ └──────┘ │                                 │                        │
│          │                                 │                        │
└──────────┴─────────────────────────────────┴────────────────────────┘
```

### 5.1 Sticky Header

- Title + last-update timestamp with animated refresh indicator
- Time window selector (preset: Last 8 hours, Last 4 hours, Custom)
- Casino-wide **coverage bar** — a thin progress bar showing snapshot coverage ratio, color-coded by tier. Tooltip shows opening/closing snapshot breakdown.

### 5.2 Left Rail (240px, sticky)

Fixed-width summary column. Designed for peripheral vision — glance left, see the headline numbers.

| Component | Content | Trust Indicator |
|-----------|---------|-----------------|
| HeroWinLossCompact | Casino win/loss total (text-3xl), color-coded positive/negative | **MetricGradeBadge** next to label shows ESTIMATE or AUTHORITATIVE |
| SecondaryKpiStack | Fills, Credits, Est. Drop in compact cards with colored accent bars | **MetricGradeBadge** on "Est. Drop" card (always ESTIMATE) |
| QualitySummaryCard | Coverage percentage + segmented bar (green/amber/gray) showing GOOD/LOW/NONE distribution | Visual quality breakdown |

### 5.3 Center Panel (flex-grow, scrollable)

Primary analytical workspace. Contains charts, alerts, and the drill-down table.

**Charts row** (2-column grid):
- **FloorActivityRadar** — Donut chart showing rated vs unrated visitor split
- **WinLossTrendChart** — Bar chart comparing win/loss across pits

**AlertsStrip** — Condensed alert cards sorted by severity. Each alert shows:
- Severity badge (critical/warn/info) with icon
- Entity label and threshold breach details
- **Downgrade indicator** when severity was reduced due to low telemetry quality
- Recommended action text

**MetricsTable** — Tabbed drill-down view with three levels:
- **Casino tab**: PitRows with win/loss, fills, credits, **CoverageBar**, table count
- **By Pit tab**: Same PitRow layout
- **By Table tab**: TableRows with win/loss, fills, credits, **TelemetryQualityIndicator** (replaces legacy QualityDots), **MetricGradeBadge** (ESTIMATE/AUTHORITATIVE), status badge

Clicking a pit drills down to its tables. "All Pits" button returns to casino view.

### 5.4 Right Rail (280px, collapsible)

Secondary context. Collapses to an icon strip when the operator needs more center-panel space.

| Component | Content |
|-----------|---------|
| TelemetryRailPanel | Cash observation rollups (estimate vs confirmed totals) at casino/pit/table level |
| QualityDetailCard | Per-tier breakdown using **TelemetryQualityIndicator** — green dot "Good: 12", amber dot "Low: 3", gray dot "None: 1" |

### 5.5 Expansion Slots

The layout includes reserved `data-slot` divs for future phases:

| Slot | Location | Future Content |
|------|----------|---------------|
| `utilization-timeline` | Center, below charts | Phase 2: table open/idle minutes timeline |
| `trending-charts` | Center, below table | Phase 3: z-score trending, top movers |
| `theo-kpi` | Left rail, bottom | Phase 5: theoretical win, handle estimates |
| `theo-sidebar` | Right rail, bottom | Phase 5: theo variance details |

---

## 6. Trust UI Primitives

Five composable components provide trust communication across the dashboard.

| Component | Purpose | Visual |
|-----------|---------|--------|
| **MetricGradeBadge** | ESTIMATE (amber, dashed circle) or AUTHORITATIVE (green, checkmark) | Compact badge with icon + abbreviated text |
| **TelemetryQualityIndicator** | GOOD (green filled dot), LOW (amber half dot), NONE (gray empty dot) | Colored dot with optional label |
| **CoverageBar** | Snapshot coverage ratio as a progress bar | Thin bar, color-coded by tier, optional tooltip |
| **ProvenanceTooltip** | Wraps any value with a hover tooltip showing source, quality, ratio, null_reasons | Radix tooltip with structured content |
| **MissingDataWarning** | Shown when data is null — inline em-dash or block-level message | Never hides missing data silently |

---

## 7. Data Flow Summary

```
PostgreSQL RPCs
    │
    ▼
Service Layer (services/table-context/shift-metrics/service.ts)
    │  • Calls rpc_shift_table_metrics
    │  • Aggregates tables → pits → casino (client-side)
    │  • Attaches provenance via deriveTableProvenance() / rollupPitProvenance() / rollupCasinoProvenance()
    │  • Computes coverage ratio and tier per entity
    │
    ▼
BFF API Route (GET /api/v1/shift-dashboards/summary)
    │  • Returns ShiftDashboardSummaryDTO { casino, pits[], tables[] }
    │
    ▼
TanStack Query Hook (useShiftDashboardSummary)
    │  • Stale time: 60s, refetch on window focus
    │
    ▼
ShiftDashboardV3 Component
    │  • Distributes data to three panels
    │  • Passes provenance.grade to trust badges
    │  • Passes coverage_ratio/tier to coverage bars
    │  • Passes telemetry_quality to quality indicators
    │
    ▼
User sees: numbers + trust context at every level
```

Cash observations follow a parallel path through `useCashObsSummary` with 30s stale time and 60s auto-refetch (telemetry is more volatile).

---

## 8. What the Dashboard Does NOT Do (MVP Boundaries)

| Deferred Capability | Reason | Phase |
|--------------------|--------|-------|
| Authoritative drop (count room) | Requires external count room integration | Phase 4 |
| Hold percentage | Requires authoritative drop | Phase 4 |
| Table utilization (open_minutes) | Requires status event timeline | Phase 2 |
| Theo / expected value | Requires decisions-per-hour config | Phase 5 |
| Z-score anomaly detection | Requires rolling baseline materialized views | Phase 3 |
| Shift-over-shift comparison | Requires baseline computation | Phase 3 |
| Forecast ranges | Post-MVP analytics | Future |

---

## 9. File Inventory

### Components (25 files)

```
components/shift-dashboard-v3/
├── shift-dashboard-v3.tsx          # Root orchestrator
├── layout/
│   ├── shift-dashboard-layout.tsx  # Grid container
│   ├── shift-dashboard-header.tsx  # Sticky header
│   ├── shift-left-rail.tsx         # Left rail (240px, sticky)
│   ├── shift-center-panel.tsx      # Center (flex-grow, scroll)
│   └── shift-right-rail.tsx        # Right rail (280px, collapsible)
├── left-rail/
│   ├── hero-win-loss-compact.tsx   # Primary KPI with grade badge
│   ├── secondary-kpi-stack.tsx     # Fills, Credits, Est. Drop
│   └── quality-summary-card.tsx    # Quality distribution bar
├── center/
│   ├── alerts-strip.tsx            # Alert cards with downgrade cues
│   └── metrics-table.tsx           # Tabbed drill-down (casino/pit/table)
├── right-rail/
│   ├── telemetry-rail-panel.tsx    # Cash observation rollups
│   ├── quality-detail-card.tsx     # Per-tier quality breakdown
│   ├── rail-collapse-toggle.tsx    # Collapse/expand button
│   └── collapsed-icon-strip.tsx    # Minimized rail icons
├── charts/
│   ├── floor-activity-radar.tsx    # Rated vs unrated donut
│   └── win-loss-trend-chart.tsx    # Pit comparison bars
└── trust/
    ├── metric-grade-badge.tsx       # ESTIMATE / AUTHORITATIVE badge
    ├── telemetry-quality-indicator.tsx  # Quality dot indicator
    ├── coverage-bar.tsx             # Coverage ratio progress bar
    ├── provenance-tooltip.tsx       # Trust metadata tooltip
    ├── missing-data-warning.tsx     # Null data indicator
    └── index.ts                     # Barrel exports
```

### Service Layer

```
services/table-context/
├── shift-metrics/
│   ├── dtos.ts                     # Table / Pit / Casino / Summary DTOs
│   ├── service.ts                  # BFF aggregation, provenance attachment
│   ├── provenance.ts               # Provenance derivation and rollup
│   ├── snapshot-rules.ts           # Coverage computation and tiers
│   └── index.ts                    # Barrel exports
├── shift-cash-obs/
│   └── severity.ts                 # Alert severity guardrails
├── shift-cash-obs.ts               # Cash observation queries
└── dtos.ts                         # Cash obs DTOs (CashObsSpikeAlertDTO)
```

### Governance Documents

```
docs/20-architecture/specs/SHIFT-STAT-MODEL-MVP/
├── SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md
├── SHIFT_SNAPSHOT_RULES_v1.md
├── SHIFT_SEVERITY_ALLOWLISTS_v1.md
├── TRUST_LAYER_RULES.md
├── SHIFT_METRICS_UX_CONTRACT_v1.md
└── EXECUTION-SPEC-SHIFT-STAT-MODEL-MVP-PATCHED.md

docs/25-api-data/
└── SHIFT_METRICS_CONTRACT_v1.md
```

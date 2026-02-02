---
title: "Shift Metrics UX Contract v1"
doc_kind: api-data-contract
version: v1.0
status: active
created: 2026-02-02
applies_to: components/shift-dashboard-v3/
related:
  - TRUST_LAYER_RULES.md
  - SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md
  - SHIFT_SEVERITY_ALLOWLISTS_v1.md
---

# Shift Metrics UX Contract v1

Defines the visual contract between the shift-metrics data layer and the V3 dashboard UI. Every component in the dashboard MUST adhere to these rules when displaying metrics, alerts, and quality information.

---

## 1. Coverage Bar

### 1.1 Placement

The coverage bar is displayed in the **dashboard header** (`shift-dashboard-header.tsx`), visible at all times.

### 1.2 Data Source

```
coverage_ratio = MIN(tables_with_opening_snapshot, tables_with_closing_snapshot) / tables_count
```

Sourced from `ShiftCasinoMetricsDTO` (casino level) or `ShiftPitMetricsDTO` (pit level, when drilled down).

### 1.3 Visual Specification

| Coverage | Color | Label |
|----------|-------|-------|
| >= 80% | Green (`emerald-500`) | "X/Y tables covered" |
| 50-79% | Amber (`amber-500`) | "Partial coverage: X/Y tables" |
| 1-49% | Red (`red-500`) | "Low coverage: X/Y tables" |
| 0% | Gray (`zinc-400`) | "No snapshot data" |

### 1.4 Interaction

- Hover: Show tooltip with breakdown (opening snapshot count, closing snapshot count, total tables)
- Click: No action (informational only for MVP)

---

## 2. KPI Grade Badges

### 2.1 Placement

Every KPI value in the hero section and secondary KPI stack MUST display a grade badge adjacent to the value.

### 2.2 Badge Variants

| Grade | Icon | Color | Tooltip |
|-------|------|-------|---------|
| `ESTIMATE` | Dashed circle or "~" | Amber (`amber-500`) | "Estimated value based on available telemetry" |
| `AUTHORITATIVE` | Solid shield or checkmark | Green (`emerald-500`) | "Verified value from complete inventory chain" |

### 2.3 Size and Position

- Badge appears to the right of the KPI value
- Size: 16x16px (icon) or text badge ("Est." / "Auth.")
- Does NOT replace or overlap the value itself

---

## 3. Telemetry Quality Indicator

### 3.1 Placement

Appears next to every metric that depends on telemetry data (estimated drop, cash observations).

### 3.2 Visual Specification

| Quality | Icon | Color | Label |
|---------|------|-------|-------|
| `GOOD_COVERAGE` | Filled circle | Green (`emerald-500`) | "Good telemetry" |
| `LOW_COVERAGE` | Half-filled circle | Amber (`amber-500`) | "Limited telemetry" |
| `NONE` | Empty circle | Gray (`zinc-400`) | "No telemetry" |

### 3.3 Interaction

- Hover: Show provenance tooltip (see section 6)

---

## 4. Alert Severity Cues

### 4.1 Color Coding

| Severity | Background | Border | Text | Icon |
|----------|------------|--------|------|------|
| `info` | `blue-50` | `blue-200` | `blue-700` | Info circle |
| `warn` | `amber-50` | `amber-200` | `amber-700` | Warning triangle |
| `critical` | `red-50` | `red-200` | `red-700` | Alert octagon |

### 4.2 Downgraded Alert Display

When an alert has been downgraded (see `SHIFT_SEVERITY_ALLOWLISTS_v1.md`):

```
┌─────────────────────────────────────────┐
│ ⚠ Table BJ-3: Cash out spike detected  │
│ Severity: warn (was: critical)          │
│ ℹ Downgraded due to limited telemetry   │
└─────────────────────────────────────────┘
```

- Show current severity with normal styling
- Show original severity in parentheses with strikethrough styling
- Show downgrade reason in muted text below

### 4.3 Alert Strip Layout

Alerts are displayed in the center panel's alert strip (`alerts-strip.tsx`):
- Sorted by severity (critical first, then warn, then info)
- Maximum 5 visible; overflow shows "+N more" with expandable list
- Each alert is a compact card with severity color, entity label, and message

---

## 5. Missing Data Warnings

### 5.1 Inline Warnings

When a metric has `null_reasons`, display an inline warning instead of or alongside the value:

| Null Reason | Warning Text | Icon |
|-------------|-------------|------|
| `missing_opening` | "Missing opening snapshot" | Warning triangle (amber) |
| `missing_closing` | "Missing closing snapshot" | Warning triangle (amber) |
| `misaligned` | "Snapshot timing mismatch" | Clock icon (amber) |
| `partial_coverage` | "Based on limited telemetry" | Signal icon (amber) |

### 5.2 Value Display with Warning

```
Win/Loss (Inventory): —
  ⚠ Missing opening snapshot

Win/Loss (Estimated): $12,450
  ~ Estimated from telemetry
```

- NULL values show em-dash ("—") with the specific reason
- Non-null estimated values show the value with a quality annotation

### 5.3 No Silent Nulls

**Invariant**: A NULL metric value MUST ALWAYS be accompanied by a visible reason. The UI MUST NOT show a blank cell without explanation.

---

## 6. Provenance Tooltip

### 6.1 Content Structure

```
┌─────────────────────────────────┐
│ Data Source                     │
│ ● Inventory + Telemetry (mixed)│
│                                 │
│ Quality                         │
│ ● Good telemetry coverage       │
│                                 │
│ Coverage                        │
│ ● 8 of 10 tables (80%)         │
│                                 │
│ Notes                           │
│ ● 2 tables missing snapshots   │
└─────────────────────────────────┘
```

### 6.2 Content Rules

| Section | Source Field | Display |
|---------|-------------|---------|
| Data Source | `provenance.source` | Human-readable: "Inventory data" / "Telemetry observations" / "Inventory + Telemetry" |
| Quality | `provenance.quality` | Human-readable with colored dot |
| Coverage | `provenance.coverage_ratio` | "X of Y tables" computed from coverage_ratio and tables_count |
| Notes | `provenance.null_reasons` | Human-readable list of issues |

### 6.3 When to Show

The provenance tooltip is accessible via hover on:
- Grade badges
- Quality indicators
- Coverage bar segments
- Any metric value with non-default provenance

---

## 7. Comparison Rules

### 7.1 Same-Grade Comparison

When comparing two entities (e.g., Pit A vs Pit B) with the same grade:
- Display comparison normally (delta, percentage change, etc.)
- No special disclaimer needed

### 7.2 Cross-Grade Comparison

When comparing entities with different grades:
- Show a visible disclaimer banner: "Comparing estimated and verified values — interpret with caution"
- Style the disclaimer in amber with info icon
- The disclaimer appears at the top of the comparison view, not per-cell

### 7.3 Quality Mismatch

When comparing entities where one has `NONE` quality:
- Suppress the comparison column for telemetry-derived metrics
- Show "Insufficient data for comparison" message
- Allow comparison of non-telemetry metrics (fills, credits) normally

---

## 8. Metrics Table Columns

### 8.1 Required Columns

The metrics table (`metrics-table.tsx`) MUST include:

| Column | Source | Width | Notes |
|--------|--------|-------|-------|
| Table/Pit | `table_label` / `pit_id` | Auto | Entity identifier |
| Win/Loss (Inv.) | `win_loss_inventory_cents` | Fixed | Shows "—" if NULL |
| Win/Loss (Est.) | `win_loss_estimated_cents` | Fixed | Shows "—" if NULL |
| Fills | `fills_total_cents` | Fixed | Always present |
| Credits | `credits_total_cents` | Fixed | Always present |
| Drop (Est.) | `estimated_drop_buyins_cents` | Fixed | Telemetry-derived |
| Quality | `telemetry_quality` | 48px | Color-coded indicator |
| Grade | `metric_grade` | 48px | Badge icon |

### 8.2 Quality Column

The quality column displays the `TelemetryQualityIndicator` component:
- Compact mode (icon only) in the table
- Full mode (icon + label) in the detail panel

### 8.3 Sorting

- Default sort: by `win_loss_inventory_cents` descending (NULL values last)
- Quality column is sortable (GOOD_COVERAGE first, then LOW, then NONE)
- Grade column is sortable (AUTHORITATIVE first, then ESTIMATE)

---

## 9. Component Mapping

| UX Element | Component | Location |
|------------|-----------|----------|
| Coverage Bar | `CoverageBar` | `components/shift-dashboard-v3/trust/coverage-bar.tsx` |
| Grade Badge | `MetricGradeBadge` | `components/shift-dashboard-v3/trust/metric-grade-badge.tsx` |
| Quality Indicator | `TelemetryQualityIndicator` | `components/shift-dashboard-v3/trust/telemetry-quality-indicator.tsx` |
| Provenance Tooltip | `ProvenanceTooltip` | `components/shift-dashboard-v3/trust/provenance-tooltip.tsx` |
| Missing Data Warning | `MissingDataWarning` | `components/shift-dashboard-v3/trust/missing-data-warning.tsx` |
| Alert Severity Card | `AlertSeverityCard` (within alerts-strip) | `components/shift-dashboard-v3/center/alerts-strip.tsx` |

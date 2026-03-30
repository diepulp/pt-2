Here's the full picture of the analytics panel and what can feed it.

## Current State: Analytics Panel

The panel at `components/pit-panels/analytics-panel.tsx` has **one live section and three dead stubs**:

| Section | Status | Data Source |
|---------|--------|------------|
| **Rating Coverage** (MEAS-003) | **LIVE** | `useTableCoverage` → `measurement_rating_coverage_v`. Shows coverage tier, rated ratio, untracked seconds, slip count. |
| **Table Metrics** (Win/Loss, Handle, Avg Session, Active Players) | **DEAD** — hardcoded mock values (`+$12,450`, `$145,200`, `47 min`, `6`) at 60% opacity with "Placeholder" badge | Nothing |
| **Hourly Activity** chart | **DEAD** — hardcoded bar heights (`[35, 55, 75, 45, ...]`) at 60% opacity with "Placeholder" badge | Nothing |
| **Session Breakdown** (High Rollers / Regular / Casual) | **DEAD** — hardcoded values (`2/$8,200`, `3/$3,150`, `1/$1,100`) at 60% opacity with "Placeholder" badge | Nothing |

## What Can Feed the Stubs Right Now

The data to replace every stub **already exists** in the service layer. Here's the mapping:

### Stub 1: Table Metrics (Win/Loss, Handle, Avg Session, Active Players)

| Mock Metric | Real Data Source | Service Method | Already Wired? |
|-------------|-----------------|----------------|---------------|
| **Win/Loss: +$12,450** | `ShiftTableMetricsDTO.win_loss_inventory_cents` (per-table, inventory-based W/L) | `getShiftTableMetrics()` → filter by `selectedTableId` | No — shift metrics service exists, not consumed by analytics panel |
| **Handle: $145,200** | `ShiftTableMetricsDTO.estimated_drop_buyins_cents` (total estimated drop for the table) | Same call, same DTO | No |
| **Avg Session: 47 min** | Computable from closed rating slips: `AVG(final_duration_seconds)` for slips on the selected table today | `queryRatingCoverage` already returns `rated_seconds` and `slip_count` — average = `rated_seconds / slip_count` | Partially — coverage hook has the raw data |
| **Active Players: 6** | `activeSlips.length` filtered to selected table — already a prop on the panel container | `PanelContainer` passes `activeSlips` | Yes — data is in the parent, just not passed to AnalyticsPanel |

### Stub 2: Hourly Activity Chart

| Mock | Real Data Source | Exists? |
|------|-----------------|---------|
| 12 hardcoded bars | Rating slips bucketed by `start_time` hour for the selected table. Count of slips per hour. | **No dedicated query** — but `rating_slip` rows have `start_time`. A simple `GROUP BY date_trunc('hour', start_time)` on the existing coverage or closed-sessions query would produce this. Alternatively, the shift dashboard's `rpc_shift_table_metrics` already computes per-table metrics over a time window — calling it with hourly windows would work but is expensive (12 RPC calls). A lightweight dedicated query is better. |

### Stub 3: Session Breakdown (Player Segments)

| Mock | Real Data Source | Exists? |
|------|-----------------|---------|
| High Rollers / Regular / Casual | Rating slips for selected table with `average_bet` → classify into tiers based on thresholds (e.g., >$100 = high roller, $25-$100 = regular, <$25 = casual). Count + sum `computed_theo_cents` per tier. | **No dedicated query or classification** — but `rating_slip` has `average_bet` and `computed_theo_cents`. Classification thresholds could come from `game_settings.min_bet` / `max_bet` or a simple configurable rule. |

## The Gap: One Missing Link

The shift metrics service (`services/table-context/shift-metrics/service.ts`) already provides `getShiftTableMetrics()` which returns per-table win/loss, fills, credits, drop, provenance, and quality grades. The analytics panel doesn't consume it. The wiring is:

```
rpc_shift_table_metrics (SQL, 26 columns)
  → ShiftTableMetricsDTO (TypeScript DTO, fully typed)
    → getShiftTableMetrics() (service method, operational)
      → getShiftDashboardSummary() (BFF, returns casino + pits + tables in one call)
        → Shift Dashboard v3 (CONSUMES THIS — shows all table metrics in drill-down rows)
        → Analytics Panel (DOES NOT CONSUME — shows hardcoded mocks instead)
```

The shift dashboard already renders this data in its metrics table with drill-down. The analytics panel is showing mock values for the same metrics that are live 2 tabs away.

## What It Would Take to Liven It Up

**Phase 1 — Wire existing data (1 day):**
- Pass `ShiftTableMetricsDTO` for the selected table into `AnalyticsPanel` (parent already calls the BFF)
- Replace Win/Loss mock with `win_loss_inventory_cents` (or `win_loss_estimated_cents` with grade badge)
- Replace Handle mock with `estimated_drop_buyins_cents`
- Replace Active Players mock with `activeSlips.filter(s => s.table_id === selectedTableId).length`
- Compute Avg Session from existing coverage data: `rated_seconds / slip_count`
- Remove "Placeholder" badges and 60% opacity from Table Metrics section

**Phase 2 — Hourly activity chart (0.5 day):**
- Single query: closed slips for selected table on gaming day, grouped by hour
- Feed into the existing bar chart layout (replace hardcoded heights with real counts)
- This is a lightweight client-side query, not a new RPC

**Phase 3 — Session breakdown by player segment (0.5 day):**
- Query closed slips for selected table with `average_bet` and `computed_theo_cents`
- Client-side classification: high / regular / casual based on bet thresholds
- Replace mock rows with real counts and theo totals
- Thresholds could be derived from `game_settings.min_bet` / `max_bet` or hardcoded initial values

**Total: ~2 days** to transform the analytics panel from 75% dead stubs to fully live, using data sources that already exist in the system.
---
title: "Shift Dashboard Data Pipeline Status"
status: current
created: 2026-01-19
scope: "Implementation status, data flows, and statistical model gaps"
related:
  - SHIFT_METRICS_CATALOG_v0_PATH_B_PATCH_cash-observations.md
  - ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md
---

# Shift Dashboard Data Pipeline Status

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI Components                           │
│  ┌───────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │CasinoSummary  │  │PitMetricsTable  │  │TableMetricsTable │   │
│  │Card           │  │                 │  │                  │   │
│  └───────┬───────┘  └────────┬────────┘  └────────┬─────────┘   │
│          │                   │                    │             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  CashObservationsPanel   │   AlertsPanel                 │  │
│  │  (TELEMETRY-ONLY)        │   (Spike Alerts)              │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                     TanStack Query Hooks                        │
│  useShiftDashboardSummary()   │   useCashObsSummary()          │
│  (BFF: 3→1 HTTP calls)        │   (BFF: 4→1 HTTP calls)        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                     API Routes (/api/v1/shift-dashboards)       │
│  /summary           │  /metrics/casino  │  /metrics/pits       │
│  /metrics/tables    │  /cash-observations/summary              │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                     PostgreSQL RPCs                             │
│  rpc_shift_table_metrics()   │  rpc_shift_pit_metrics()        │
│  rpc_shift_casino_metrics()  │  rpc_shift_cash_obs_*()         │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Data Streams

The dashboard separates **authoritative** from **telemetry** data:

### 2.1 Authoritative Metrics (Inventory-Based)

**Source RPC**: `rpc_shift_table_metrics` → rolled up via `rpc_shift_pit_metrics`, `rpc_shift_casino_metrics`

| Metric | Formula | Source Tables |
|--------|---------|---------------|
| `opening_bankroll_total_cents` | `chipset_total_cents(snapshot)` | `table_inventory_snapshot` |
| `closing_bankroll_total_cents` | `chipset_total_cents(snapshot)` | `table_inventory_snapshot` |
| `fills_total_cents` | `SUM(amount_cents)` | `table_fill` |
| `credits_total_cents` | `SUM(amount_cents)` | `table_credit` |
| `win_loss_inventory_cents` | `(closing - opening) + fills - credits` | Computed |
| `win_loss_estimated_cents` | `win_loss_inventory + estimated_drop_buyins` | Computed |

### 2.2 Telemetry Metrics (Observational Only)

**Source RPCs**: `rpc_shift_cash_obs_table`, `rpc_shift_cash_obs_pit`, `rpc_shift_cash_obs_casino`

| Metric | Formula | Source Tables |
|--------|---------|---------------|
| `estimated_drop_rated_cents` | `SUM(amount)` WHERE `telemetry_kind='RATED_BUYIN'` | `table_buyin_telemetry` |
| `estimated_drop_grind_cents` | `SUM(amount)` WHERE `telemetry_kind='GRIND_BUYIN'` | `table_buyin_telemetry` |
| `cash_out_observed_estimate_total` | `SUM(amount)` WHERE `direction='out', amount_kind='estimate'` | `pit_cash_observation` |
| `cash_out_observed_confirmed_total` | `SUM(amount)` WHERE `direction='out', amount_kind='cage_confirmed'` | `pit_cash_observation` |

## 3. Implemented Metrics by Component

### 3.1 Casino Summary Card (KPIs)

| KPI | Description | Data Source | Status |
|-----|-------------|-------------|--------|
| Win/Loss (Inventory) | Tray delta + chip movements | Authoritative | Implemented |
| Win/Loss (Estimated) | Inventory + telemetry | Hybrid | Implemented |
| Fills Total | Sum of all table fills | Authoritative | Implemented |
| Credits Total | Sum of all table credits | Authoritative | Implemented |
| Est. Drop (Rated) | Rated player buy-ins | Telemetry | Implemented |
| Est. Drop (Grind) | Unrated player estimate | Telemetry | Implemented |
| Est. Drop (Cash) | Observed buy-ins | Telemetry | Implemented |
| Coverage Badge | % tables with telemetry | Derived | Implemented |

### 3.2 Pit Metrics Table

| Column | Description | Status |
|--------|-------------|--------|
| Tables | Count of tables in pit | Implemented |
| Win/Loss (Inv) | Inventory-based win/loss | Implemented |
| Win/Loss (Est) | Estimated win/loss | Implemented |
| Fills | Total fills for pit | Implemented |
| Credits | Total credits for pit | Implemented |
| Coverage | % tables with good telemetry | Implemented |

### 3.3 Table Metrics Table

| Column | Description | Status |
|--------|-------------|--------|
| Opening | Opening bankroll snapshot | Implemented |
| Closing | Closing bankroll snapshot | Implemented |
| Fills/Credits | Chip movements | Implemented |
| Win/Loss | Selected based on grade | Implemented |
| Quality | `GOOD_COVERAGE`, `LOW_COVERAGE`, `NONE` | Implemented |
| Grade | `ESTIMATE` or `AUTHORITATIVE` | Implemented (MVP: always ESTIMATE) |

### 3.4 Cash Observations Panel (Telemetry)

| Metric | Description | Status |
|--------|-------------|--------|
| Estimated Total | Sum of estimated cash-outs | Implemented |
| Confirmed Total | Cage-confirmed cash-outs | Implemented |
| Observation Count | Number of observations | Implemented |
| Last Observed | Most recent observation | Implemented |

### 3.5 Spike Alerts Panel

| Field | Description | Status |
|-------|-------------|--------|
| Severity | `info`, `warn`, `critical` | Implemented |
| Entity | Table or Pit identifier | Implemented |
| Observed Value | Cash-out total observed | Implemented |
| Threshold | Alert trigger threshold | Implemented |

## 4. Quality Flags & Grading

### 4.1 Telemetry Quality (per table)

| Quality | Meaning | Criteria |
|---------|---------|----------|
| `GOOD_COVERAGE` | Both rated + grind tracked | `grind_count > 0` |
| `LOW_COVERAGE` | Only rated buy-ins | `rated_count > 0 AND grind_count = 0` |
| `NONE` | No buy-in telemetry | `rated_count = 0 AND grind_count = 0` |

### 4.2 Metric Grade (per table)

| Grade | Meaning | Current State |
|-------|---------|---------------|
| `ESTIMATE` | Based on telemetry estimates | Default for MVP |
| `AUTHORITATIVE` | Based on count room drop | Not implemented (deferred) |

## 5. Performance Optimizations

### 5.1 BFF (Backend-for-Frontend) Consolidation

| Original Pattern | Optimized Pattern | Improvement |
|------------------|-------------------|-------------|
| 3 separate metrics calls | `useShiftDashboardSummary` | 3→1 HTTP calls |
| 4 separate cash obs calls | `useCashObsSummary` | 4→1 HTTP calls |

### 5.2 Query Configuration

| Hook | Stale Time | Refetch Interval | Rationale |
|------|------------|------------------|-----------|
| `useShiftDashboardSummary` | 60s | Window focus | Authoritative data |
| `useCashObsSummary` | 30s | 60s auto | Telemetry alerting |

## 6. Statistical Model Gaps

The following areas require development for a complete statistical model:

### 6.1 Not Implemented

| Metric | Definition | Blocked By |
|--------|------------|------------|
| `hold_pct` | `win / drop` | Count room integration |
| `stat_drop_amount` | Authoritative drop from count | Count room integration |
| `drop_per_hour` | `drop / open_hours` | Count room + status events |
| `win_per_hour` | `win / open_hours` | Requires `open_hours` |
| `open_minutes` | Minutes table was active | Status event timeline |
| `idle_minutes` | Open but no activity | Status + activity signals |
| `occupancy_avg` | Concurrent active slips | Rating slip intervals |
| `theo_amount` | Expected win from rated play | Decisions/hour, house edge |
| `handle_est_amount` | Total wagered estimate | Decisions/hour calculation |
| `win_minus_theo` | Variance from expected | Theo calculation needed |

### 6.2 Trending & Baselines (Not Implemented)

Per SHIFT_METRICS_CATALOG §5, the following are planned but not built:

| Baseline | Description | Status |
|----------|-------------|--------|
| 7-day rolling mean/stddev | Per-table KPI trends | Not implemented |
| 30-day rolling mean/stddev | Longer-term baselines | Not implemented |
| Z-score computation | Variance detection | Not implemented |
| Top movers ranking | Z-score based ranking | Not implemented |

### 6.3 Anomaly Detection (Basic Only)

| Feature | Current State | Future Enhancement |
|---------|---------------|-------------------|
| Threshold alerts | Basic static thresholds | Statistical outlier detection |
| Pattern detection | Not implemented | Repeated near-threshold patterns |
| Time-series analysis | Not implemented | Trend breakpoints, seasonality |

### 6.4 Forecasting (Not Implemented)

| Feature | Description | Status |
|---------|-------------|--------|
| Expected win/loss | Based on historical patterns | Not implemented |
| Shift-over-shift comparison | Current vs prior | Not implemented |
| Day-part optimization | Peak/trough analysis | Not implemented |

## 7. Dependencies for Statistical Model Completion

### 7.1 Count Room Integration

Required for authoritative drop:
- `table_drop_event` population from count room system
- `drop_posted_at` timestamp to signal when drop is official
- Grade promotion from `ESTIMATE` to `AUTHORITATIVE`

### 7.2 Table Status Events

Required for utilization metrics:
- `gaming_table_status_event` table (per SHIFT_METRICS_CATALOG §2.2.A)
- State transitions: `inactive → active → inactive/closed`
- Integration with shift window queries

### 7.3 Game Configuration

Required for theoretical calculations:
- `decisions_per_hour` by game type
- `house_advantage` by game type
- `gaming_table_settings` with effective-dated limits

## 8. File References

### 8.1 UI Components

- `components/shift-dashboard/shift-dashboard-page.tsx` - Main orchestration
- `components/shift-dashboard/casino-summary-card.tsx` - KPI display
- `components/shift-dashboard/pit-metrics-table.tsx` - Pit rollups
- `components/shift-dashboard/table-metrics-table.tsx` - Table details
- `components/shift-dashboard/cash-observations-panel.tsx` - Telemetry display
- `components/shift-dashboard/alerts-panel.tsx` - Spike alerts

### 8.2 Data Layer

- `hooks/shift-dashboard/use-shift-dashboard-summary.ts` - BFF hook
- `hooks/shift-dashboard/use-cash-obs-summary.ts` - Cash obs BFF hook
- `hooks/shift-dashboard/http.ts` - Fetch functions
- `services/table-context/shift-metrics/dtos.ts` - Authoritative DTOs
- `services/table-context/dtos.ts` - Cash observation DTOs

### 8.3 Database RPCs

- `supabase/migrations/20260114004336_rpc_shift_table_metrics.sql`
- `supabase/migrations/20260114004455_rpc_shift_rollups.sql`
- `supabase/migrations/20260107015907_shift_cash_obs_rollup_rpcs.sql`
- `supabase/migrations/20260107020746_shift_cash_obs_alerts.sql`

## 9. Next Steps for Statistical Model Development

### Priority 1: Table Status Timeline
1. Implement `gaming_table_status_event` table
2. Create status transition triggers
3. Add `open_minutes` computation to `rpc_shift_table_metrics`
4. Add utilization metrics to dashboard

### Priority 2: Baselines & Trending
1. Create materialized view for rolling stats
2. Add z-score computation to alerts RPC
3. Implement comparison to prior shift/day
4. Add "top movers" ranking to dashboard

### Priority 3: Count Room Integration
1. Define count room event ingestion interface
2. Implement grade promotion logic
3. Update win/loss formulas for authoritative drop
4. Add `hold_pct` to dashboard metrics

### Priority 4: Theoretical Calculations
1. Add `decisions_per_hour` to game settings
2. Add `house_advantage` to game settings
3. Implement `theo_amount` calculation
4. Add `win_minus_theo` variance display

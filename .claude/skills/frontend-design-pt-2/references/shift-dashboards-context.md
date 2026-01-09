# Shift Dashboards UI Context

**Source Documents**:
- `docs/10-prd/PRD-Shift-Dashboards-Shift-Reports-v0.2_PATCH_cash-observations.md`
- `docs/00-vision/shift-dashboards/SHIFT_METRICS_CATALOG_v0_PATH_B_PATCH_cash-observations.md`
- `docs/00-vision/shift-dashboards/ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md`
- `docs/20-architecture/specs/PRD-SHIFT-DASHBOARDS-v0.2-PATCH/EXECUTION-SPEC.md`

**Prerequisite**: EXECUTION-SPEC backend workstreams (WS1-WS3) must be complete before UI development.

---

## Overview

The Shift Dashboards feature surfaces **cash observation telemetry rollups** in a **dedicated Admin Dashboard** at `/admin/shift`. This is **NOT a patch to the Pit Dashboard** — it is a separate administrative interface for shift supervisors and casino management.

### Key Distinction: Admin Dashboard vs Pit Dashboard

| Feature | Pit Dashboard (`/pit`) | Admin Dashboard (`/admin/shift`) |
|---------|------------------------|----------------------------------|
| **Purpose** | Real-time table operations | Operational telemetry & KPI rollups |
| **Users** | Pit bosses at tables | Shift supervisors, management |
| **Data Focus** | Active slips, seat occupancy | KPI rollups, alerts, trends |
| **Update Frequency** | Real-time (WebSocket) | Periodic refresh (30s-5min) |
| **Components** | TableLayoutTerminal, ActiveSlipsPanel | KPI Cards, Charts, Alert Panels |

**Key Constraint**: Cash observations are **TELEMETRY-ONLY** — they are NOT authoritative Drop/Win/Hold metrics and must be visually distinguished from accounting truth.

---

## UI Requirements Summary (from PRD §12)

### Views Required

| View | Purpose | KPIs |
|------|---------|------|
| **Casino view** | Top KPIs + alerts + pits leaderboard | Win, Drop, Hold, Theo, Cash Obs (telemetry) |
| **Pit view** | Tables list + occupancy + alerts | Per-pit rollups, alert count |
| **Table view** | Event timeline + rating summary | Per-table rollups, spike alerts |

### Dashboard Widgets

1. **KPI Cards**: Win, Drop, Hold, Theo, Open hours, Occupancy
2. **Cash Observations Panel** (NEW - telemetry):
   - `cash_out_observed_estimate_total`
   - `cash_out_observed_confirmed_total`
   - `cash_out_observation_count`
   - `cash_out_last_observed_at`
3. **Top Movers**: Biggest win/theo delta, biggest drop/hour delta
4. **Alerts Panel**: Grouped by severity, includes `cash_out_observed_spike_telemetry`
5. **Table Grid**: Per-table KPIs and status

### Ad-hoc Access

- Filter by time window, pit, table, game type
- Export shift report payload (JSON + CSV)

---

## Charts Library

**Use shadcn/ui charts** for all shift dashboard visualizations.

```bash
npx shadcn@latest add chart
```

shadcn charts are built on Recharts with pre-configured theming. Use for:
- **Bar charts**: Table/pit comparisons, top movers
- **Line charts**: Time-series trends (cash obs over shift window)
- **Area charts**: Cumulative telemetry visualization

```tsx
import { Bar, BarChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

// Example: Table cash-out comparison
const chartConfig = {
  estimate: { label: "Estimate", color: "hsl(var(--chart-1))" },
  confirmed: { label: "Confirmed", color: "hsl(var(--chart-2))" },
}

<ChartContainer config={chartConfig}>
  <BarChart data={tableRollups}>
    <XAxis dataKey="table_label" />
    <YAxis />
    <ChartTooltip content={<ChartTooltipContent />} />
    <Bar dataKey="cash_out_observed_estimate_total" fill="var(--color-estimate)" />
    <Bar dataKey="cash_out_observed_confirmed_total" fill="var(--color-confirmed)" />
  </BarChart>
</ChartContainer>
```

---

## Telemetry Visual Treatment (CRITICAL)

Per PRD §8.1 and SHIFT_METRICS_CATALOG §3.7, all cash observation metrics MUST be displayed under a visually distinct **"Cash Observations (Telemetry)"** section with:

1. **Explicit TELEMETRY label** — Use badge/tag with "TELEMETRY" text
2. **Visual separation** — Different card style, muted colors, or bordered section
3. **Disclaimer tooltip** — "Observational estimates, not authoritative accounting"
4. **No mixing** — Cash obs metrics NEVER appear alongside Drop/Win/Hold without separation

### Recommended Visual Pattern

```tsx
// TELEMETRY badge for all cash observation displays
<Badge variant="outline" className="border-amber-500/50 text-amber-600 text-[10px]">
  TELEMETRY
</Badge>

// Card with visual distinction
<Card className="border-dashed border-amber-500/30 bg-amber-50/5">
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      Cash Observations
      <Badge variant="outline">TELEMETRY</Badge>
    </CardTitle>
  </CardHeader>
  ...
</Card>
```

---

## Data Sources (Backend Dependencies)

### RPCs (from EXECUTION-SPEC WS1-WS2)

| RPC | Grain | Returns |
|-----|-------|---------|
| `rpc_shift_cash_obs_table` | Table | `table_id`, `table_label`, `pit`, `cash_out_*` fields |
| `rpc_shift_cash_obs_pit` | Pit | `pit`, `cash_out_*` fields |
| `rpc_shift_cash_obs_casino` | Casino | `cash_out_*` fields (single row) |
| `rpc_shift_cash_obs_alerts` | Table/Pit | Spike alerts with `is_telemetry: true` |

### DTOs (from EXECUTION-SPEC WS3)

```typescript
// services/table-context/dtos.ts
interface CashObsTableRollupDTO {
  table_id: string;
  table_label: string;
  pit: string | null;
  cash_out_observed_estimate_total: number;
  cash_out_observed_confirmed_total: number;
  cash_out_observation_count: number;
  cash_out_last_observed_at: string | null;
}

interface CashObsSpikeAlertDTO {
  alert_type: 'cash_out_observed_spike_telemetry';
  severity: 'warn' | 'critical';
  entity_type: 'table' | 'pit';
  entity_id: string;
  entity_label: string;
  observed_value: number;
  threshold: number;
  message: string;
  is_telemetry: true;
}
```

### React Query Keys (from EXECUTION-SPEC WS3)

```typescript
// services/table-context/keys.ts
shiftCashObs: {
  table: (casinoId, startTs, endTs, tableId?) => [...],
  pit: (casinoId, startTs, endTs, pit?) => [...],
  casino: (casinoId, startTs, endTs) => [...],
  alerts: (casinoId, startTs, endTs) => [...],
}
```

---

## Alert Display Requirements

### Spike Alerts (PRD §9.1)

Cash-out spike alerts trigger when `cash_out_observed_estimate_total` exceeds threshold:
- **Table threshold**: Default $5,000 (configurable via `casino_settings.alert_thresholds`)
- **Pit threshold**: Default $25,000

### Alert Card Pattern

```tsx
interface SpikAlertProps {
  alert: CashObsSpikeAlertDTO;
}

function SpikeAlertCard({ alert }: SpikeAlertProps) {
  return (
    <div className="border-l-4 border-amber-500 bg-amber-50/10 p-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-amber-600">TELEMETRY</Badge>
        <span className="font-mono text-sm">{alert.entity_label}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{alert.message}</p>
      <div className="flex gap-4 mt-2 text-xs">
        <span>Observed: ${alert.observed_value.toLocaleString()}</span>
        <span>Threshold: ${alert.threshold.toLocaleString()}</span>
      </div>
    </div>
  );
}
```

---

## Time Window Input

All rollup queries require a time window:
- `startTs`: ISO timestamp (shift start)
- `endTs`: ISO timestamp (shift end)

### UI Pattern: Time Picker

```tsx
// Shift time window selector
interface ShiftWindowPicker {
  startTs: string;
  endTs: string;
  onWindowChange: (start: string, end: string) => void;
}

// Presets: "Last 8 hours", "Current shift", "Custom range"
```

---

## Integration Points

### Admin Dashboard Architecture

The Admin Dashboard is a **standalone feature** at `/admin/*` with its own layout, navigation, and components. It does NOT extend or patch the Pit Dashboard.

**Route Structure**:
```
app/(dashboard)/admin/
├── layout.tsx                    # Admin layout with sub-nav
├── page.tsx                      # Redirects to /admin/shift
├── shift/
│   └── page.tsx                  # Shift dashboard main view
├── alerts/
│   └── page.tsx                  # Alert management
├── reports/
│   └── page.tsx                  # Shift reports & exports
└── settings/
    └── thresholds/
        └── page.tsx              # Alert thresholds config
```

### Component Organization

```
components/admin/
├── shift-dashboard/
│   ├── kpi-cards.tsx             # KPI card grid
│   ├── cash-obs-panel.tsx        # Telemetry panel (amber styling)
│   ├── alerts-panel.tsx          # Active alerts
│   ├── table-rollups-chart.tsx   # Bar chart comparison
│   └── time-window-picker.tsx    # Shift time selector
├── admin-sidebar.tsx             # Admin-specific sidebar
└── admin-header.tsx              # Admin header with breadcrumbs
```

### Hooks Location

New hooks for admin features in `hooks/admin/`:

```typescript
// hooks/admin/use-shift-cash-obs.ts
export function useShiftCashObsTable(params: ShiftCashObsTableParams) { ... }
export function useShiftCashObsPit(params: ShiftCashObsPitParams) { ... }
export function useShiftCashObsCasino(params: ShiftCashObsTimeWindow) { ... }
export function useShiftCashObsAlerts(params: ShiftCashObsTimeWindow) { ... }
```

---

## Performance Requirements (PRD §15)

- Casino/pit view: **<2 seconds** load time
- Table view: **<5 seconds** (event timeline joins)
- Use React Query with stale-while-revalidate for responsive UX

---

## Validation Checklist

Before marking Admin Dashboard complete:

- [ ] Dedicated `/admin/*` routes (NOT patch to pit dashboard)
- [ ] Admin layout with sidebar navigation
- [ ] KPI cards follow icon + metric + trend pattern (per stylistic direction)
- [ ] Cash observations displayed in distinct "TELEMETRY" section (amber styling)
- [ ] TELEMETRY badge present on all cash obs displays
- [ ] Alert messages show "TELEMETRY:" prefix (from RPC)
- [ ] Time window picker with presets (8h, current shift, custom)
- [ ] Table/pit/casino grain views implemented
- [ ] Spike alerts integrated into alerts panel
- [ ] Charts using shadcn/ui chart components
- [ ] Mobile-responsive 12-column grid layout
- [ ] Loading skeletons (not spinners) for all async data
- [ ] Error states with retry option
- [ ] `npm run type-check` passes
- [ ] React 19 patterns (useTransition, no manual loading state)

---

## File Structure

```
app/(dashboard)/admin/
├── layout.tsx                    # Admin layout with sub-nav
├── page.tsx                      # Redirects to /admin/shift
├── shift/
│   └── page.tsx                  # Shift dashboard main view
├── alerts/
│   └── page.tsx                  # Alert management
├── reports/
│   └── page.tsx                  # Shift reports & exports
└── settings/
    ├── page.tsx                  # Settings index
    └── thresholds/
        └── page.tsx              # Alert thresholds config

components/admin/
├── shift-dashboard/
│   ├── kpi-cards.tsx             # KPI card grid
│   ├── cash-obs-panel.tsx        # Telemetry panel (amber styling)
│   ├── alerts-panel.tsx          # Active alerts
│   ├── table-rollups-chart.tsx   # Bar chart comparison
│   └── time-window-picker.tsx    # Shift time selector
├── admin-sidebar.tsx             # Admin-specific sidebar
└── admin-header.tsx              # Admin header with breadcrumbs

hooks/admin/
├── use-shift-cash-obs.ts         # Cash observation queries
├── use-shift-alerts.ts           # Alert queries
└── index.ts                      # Export aggregator
```

---

## Related Documentation

- **Stylistic Direction**: `docs/00-vision/shift-dashboards/ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md`
- **PRD**: `docs/10-prd/PRD-Shift-Dashboards-Shift-Reports-v0.2_PATCH_cash-observations.md`
- **Metrics Catalog**: `docs/00-vision/shift-dashboards/SHIFT_METRICS_CATALOG_v0_PATH_B_PATCH_cash-observations.md`
- **Execution Spec**: `docs/20-architecture/specs/PRD-SHIFT-DASHBOARDS-v0.2-PATCH/EXECUTION-SPEC.md`
- **Alert Thresholds**: `docs/00-vision/loyalty-service-extension/SHIFT_DASHBOARDS_V0_ALERT_THRESHOLDS_BASELINES_PATCH.md`

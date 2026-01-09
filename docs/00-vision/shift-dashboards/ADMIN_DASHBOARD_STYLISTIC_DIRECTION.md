---
title: "Admin Dashboard Stylistic Direction"
status: approved
created: 2026-01-07
scope: "Admin Dashboard UI scaffold, Shift Dashboards, Config Panels"
reference_design: "shadcnblocks-admin Dashboard-3"
---

# Admin Dashboard Stylistic Direction

## 1. Overview

The Admin Dashboard is a **dedicated route** (`/admin/*`) housing operational telemetry, shift dashboards, configuration panels, and administrative controls. This is **NOT a patch to the Pit Dashboard** — it is a separate administrative interface for shift supervisors and casino management.

### Key Distinction

| Feature | Pit Dashboard (`/pit`) | Admin Dashboard (`/admin`) |
|---------|------------------------|---------------------------|
| **Purpose** | Real-time table operations | Operational telemetry & config |
| **Users** | Pit bosses at tables | Shift supervisors, management |
| **Data Focus** | Active slips, seat occupancy | KPI rollups, alerts, trends |
| **Update Frequency** | Real-time (WebSocket) | Periodic refresh (30s-5min) |
| **Aesthetic** | Brutalist (exposed structure) | Modern SaaS (polished, refined) |

### Aesthetic Direction

The Admin Dashboard **intentionally diverges** from the Pit Dashboard's brutalist aesthetic:

| Aspect | Pit Dashboard (Brutalist) | Admin Dashboard (Modern SaaS) |
|--------|---------------------------|-------------------------------|
| **Typography** | `uppercase tracking-widest` | Title case, clean hierarchy |
| **Borders** | `border-2` hard edges | `rounded-xl` with subtle shadows |
| **Labels** | Monospace throughout | Sans-serif labels, monospace for data only |
| **Visual weight** | Exposed/raw structure | Polished/refined surfaces |
| **Telemetry** | Dashed borders, amber accent | Colored left-border accent strips |

**Rationale**: The Pit Dashboard serves pit bosses at tables who need high-contrast, glanceable information during active play. The Admin Dashboard serves shift supervisors in back-office contexts who review aggregated data—a more refined aesthetic supports extended analytical sessions.

> **Implementation Note**: While aesthetics differ, both dashboards share PT-2's core design tokens (`--accent`, `--chart-*`, semantic colors) and component library (shadcn/ui).

---

## 2. Reference Design

**Source**: [shadcnblocks-admin Dashboard-3](https://shadcnblocks-admin.vercel.app/dashboard-3)

### Layout Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ [Logo] │ Header (breadcrumb, search, theme toggle, user)   │
├────────┼────────────────────────────────────────────────────┤
│        │                                                    │
│  S     │  Main Content Area                                 │
│  I     │  ┌─────────┬─────────┬─────────┬─────────┐        │
│  D     │  │ KPI 1   │ KPI 2   │ KPI 3   │ KPI 4   │        │
│  E     │  └─────────┴─────────┴─────────┴─────────┘        │
│  B     │                                                    │
│  A     │  ┌───────────────────┬─────────────────────┐      │
│  R     │  │                   │                     │      │
│        │  │  Primary Chart    │  Secondary Panel    │      │
│        │  │                   │                     │      │
│        │  └───────────────────┴─────────────────────┘      │
│        │                                                    │
│        │  ┌─────────────────────────────────────────┐      │
│        │  │  Data Table / Grid                      │      │
│        │  └─────────────────────────────────────────┘      │
│        │                                                    │
└────────┴────────────────────────────────────────────────────┘
```

### Grid System

- **CSS Grid**: `grid-cols-12` for responsive spanning
- **Gap**: `gap-4` to `gap-6` between major sections
- **KPI Cards**: 4-column layout on desktop, 2-column tablet, 1-column mobile

---

## 3. Component Patterns

### 3.1 KPI Cards

Per the reference design, KPI cards use a **colored left-border accent** pattern:

```
┌─────────────────────────────────┐
│ ● Total Sales              ··· │  ← Status dot + title + menu
│ $4,523,189                     │  ← Large metric (font-mono)
│ ↑ 90.2% +1,454 today          │  ← Trend with icon (colored)
│ View Report →                  │  ← Action link
└─────────────────────────────────┘
```

```tsx
// Pattern: Colored accent + metric + trend + action
<Card className="relative overflow-hidden">
  {/* Colored left accent bar */}
  <div className="absolute left-0 top-0 h-full w-1 bg-accent" />

  <div className="p-6 pl-5">
    {/* Header: dot indicator + title */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-sm font-medium">Total Sales</span>
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </div>

    {/* Metric */}
    <p className="mt-3 text-2xl font-semibold font-mono tabular-nums">
      $4,523,189
    </p>

    {/* Trend line */}
    <div className="mt-1 flex items-center gap-1 text-xs">
      <TrendingUp className="h-3 w-3 text-emerald-500" />
      <span className="text-emerald-500">90.2%</span>
      <span className="text-muted-foreground">+1,454 today</span>
    </div>

    {/* Action link */}
    <Button variant="link" className="mt-3 h-auto p-0 text-xs">
      View Report <ArrowRight className="ml-1 h-3 w-3" />
    </Button>
  </div>
</Card>
```

**Accent Bar Colors** (by metric type):
| Metric Type | Accent Color | Tailwind Class |
|-------------|--------------|----------------|
| Financial (Sales, Drop) | Teal/Cyan | `bg-accent` |
| Growth metrics | Emerald | `bg-emerald-500` |
| Visitor/Traffic | Blue | `bg-blue-500` |
| Alerts/Warnings | Amber | `bg-amber-500` |
| Negative/Refund | Red | `bg-red-500` |

**Status Dot Colors** (trend indicator):
- Emerald dot: Positive trend
- Red dot: Negative trend
- Gray dot: Neutral/flat

### 3.2 Telemetry Visual Treatment (CRITICAL)

All cash observation / telemetry metrics MUST be visually distinct:

```tsx
// TELEMETRY section - visually separated
<Card className="border-dashed border-amber-500/30 bg-amber-50/5">
  <CardHeader className="pb-2">
    <div className="flex items-center gap-2">
      <CardTitle className="text-sm font-medium">Cash Observations</CardTitle>
      <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-[10px]">
        TELEMETRY
      </Badge>
    </div>
  </CardHeader>
  <CardContent>
    {/* Telemetry metrics here */}
  </CardContent>
</Card>
```

**Telemetry Visual Rules**:
1. Dashed border (`border-dashed`)
2. Amber accent color (`border-amber-500/30`)
3. Subtle background tint (`bg-amber-50/5`)
4. "TELEMETRY" badge on all displays
5. Never mix with authoritative Drop/Win/Hold metrics

### 3.3 Charts (shadcn/ui charts)

> **⚠️ Prerequisite**: The shadcn chart component is NOT yet installed in PT-2.
> Run this command before implementing charts:
> ```bash
> npx shadcn@latest add chart
> ```
> This will add `components/ui/chart.tsx` with Recharts integration.

**Chart Types by Use Case** (per reference design):
| Chart Type | Use Case | Reference Example |
|------------|----------|-------------------|
| Bar | Table/pit comparisons, top movers | "Budgets - Consolidated" |
| Line | Time-series trends over shift window | Revenue over time |
| Area | Cumulative telemetry visualization | Visitor trends |
| Donut/Radial | Category breakdowns, totals | "Total Visitors Chart" |
| Radar | Multi-dimensional comparisons | "Sales By Month" |

```tsx
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Bar, BarChart, XAxis, YAxis } from "recharts"

const chartConfig = {
  estimate: { label: "Estimate", color: "hsl(var(--chart-1))" },
  confirmed: { label: "Confirmed", color: "hsl(var(--chart-2))" },
}

<ChartContainer config={chartConfig} className="h-[200px]">
  <BarChart data={tableRollups}>
    <XAxis dataKey="table_label" />
    <YAxis />
    <ChartTooltip content={<ChartTooltipContent />} />
    <Bar dataKey="estimate" fill="var(--color-estimate)" />
    <Bar dataKey="confirmed" fill="var(--color-confirmed)" />
  </BarChart>
</ChartContainer>
```

### 3.4 Alert Cards

```tsx
// Spike alert pattern
<div className="border-l-4 border-amber-500 bg-amber-50/10 p-3 rounded-r-lg">
  <div className="flex items-center gap-2">
    <Badge variant="outline" className="text-amber-600 text-[10px]">TELEMETRY</Badge>
    <span className="font-mono text-sm">{alert.entity_label}</span>
  </div>
  <p className="text-xs text-muted-foreground mt-1">{alert.message}</p>
  <div className="flex gap-4 mt-2 text-xs">
    <span>Observed: ${alert.observed_value.toLocaleString()}</span>
    <span className="text-muted-foreground">Threshold: ${alert.threshold.toLocaleString()}</span>
  </div>
</div>
```

**Alert Severity Colors**:
- `warn`: `border-amber-500`
- `critical`: `border-red-500`
- `info`: `border-blue-500`

### 3.5 Time Window Picker

```tsx
// Shift time window selector with presets
<div className="flex items-center gap-2">
  <Select value={preset} onValueChange={handlePresetChange}>
    <SelectTrigger className="w-[180px]">
      <SelectValue placeholder="Select window" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="8h">Last 8 hours</SelectItem>
      <SelectItem value="current">Current shift</SelectItem>
      <SelectItem value="custom">Custom range</SelectItem>
    </SelectContent>
  </Select>
  {preset === "custom" && (
    <DateRangePicker value={range} onChange={setRange} />
  )}
</div>
```

### 3.6 Recent Activity Table

Per the reference design, activity tables display user actions with status indicators:

```
┌──────────────────────────────────────────────────────────────────┐
│ Recent Activity                                    Period ▼      │
├────────┬────────────┬──────────┬─────────────┬──────────────────┤
│ User   │ Status     │ ID       │ Date        │ Amount           │
├────────┼────────────┼──────────┼─────────────┼──────────────────┤
│ Jo Jose│ ●          │ #329341  │ 46 min ago  │ $484.61          │
│ Na Nata│ Delete     │ #329341  │ 33 min ago  │ $411.44          │
│ Ot Otto│ Delete     │ #329341  │ 42 min ago  │ $658.00          │
└────────┴────────────┴──────────┴─────────────┴──────────────────┘
```

```tsx
// Activity table pattern
<Card>
  <CardHeader className="flex flex-row items-center justify-between pb-2">
    <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
    <Select defaultValue="period">
      <SelectTrigger className="w-[100px] h-8 text-xs">
        <SelectValue placeholder="Period" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="period">Period</SelectItem>
        <SelectItem value="today">Today</SelectItem>
        <SelectItem value="week">This Week</SelectItem>
      </SelectContent>
    </Select>
  </CardHeader>
  <CardContent className="p-0">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs">User</TableHead>
          <TableHead className="text-xs">Status</TableHead>
          <TableHead className="text-xs">ID</TableHead>
          <TableHead className="text-xs">Date</TableHead>
          <TableHead className="text-xs text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {activities.map((activity) => (
          <TableRow key={activity.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px]">
                    {activity.initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{activity.name}</p>
                  <p className="text-xs text-muted-foreground">{activity.email}</p>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge status={activity.status} />
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              #{activity.id}
            </TableCell>
            <TableCell className="font-mono text-xs">
              {activity.relativeTime}
            </TableCell>
            <TableCell className="font-mono text-sm text-right">
              ${activity.amount.toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </CardContent>
</Card>
```

**Status Badge Component**:
```tsx
function StatusBadge({ status }: { status: 'active' | 'delete' | 'invited' | 'pending' }) {
  const variants = {
    active: 'bg-emerald-500',
    delete: 'bg-red-500/10 text-red-500 border border-red-500/20',
    invited: 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
    pending: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
  }

  if (status === 'active') {
    return <div className="h-2 w-2 rounded-full bg-emerald-500" />
  }

  return (
    <span className={cn('rounded px-2 py-0.5 text-[10px] font-medium', variants[status])}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}
```

---

## 4. Navigation Structure

### 4.1 Admin Dashboard Routes

```
/admin
├── /shift                   # Shift Dashboard (default)
│   ├── ?view=casino        # Casino-level rollups
│   ├── ?view=pit&pit=A     # Pit-level detail
│   └── ?view=table&id=...  # Table-level detail
├── /alerts                  # Alert management
├── /reports                 # Shift reports & exports
└── /settings                # Admin-only configuration
    ├── /thresholds          # Alert threshold config
    └── /shifts              # Shift schedule config
```

### 4.2 Sidebar Menu Items

```tsx
const adminNavItems = [
  {
    title: "Shift Dashboard",
    href: "/admin/shift",
    icon: LayoutDashboard,
    description: "Operational telemetry and KPIs"
  },
  {
    title: "Alerts",
    href: "/admin/alerts",
    icon: Bell,
    badge: alertCount > 0 ? alertCount : undefined
  },
  {
    title: "Reports",
    href: "/admin/reports",
    icon: FileText
  },
  {
    title: "Settings",
    href: "/admin/settings",
    icon: Settings,
    children: [
      { title: "Thresholds", href: "/admin/settings/thresholds" },
      { title: "Shifts", href: "/admin/settings/shifts" }
    ]
  }
]
```

---

## 5. Color Scheme

### 5.1 PT-2 Theme Integration

The Admin Dashboard inherits PT-2's **Industrial Theme** defined in `app/globals.css`:

| Token | Light Mode | Dark Mode | HSL Value |
|-------|------------|-----------|-----------|
| `--accent` | Teal 600 | Cyan 500 | `189 94% 37%` / `189 94% 43%` |
| `--chart-1` | Teal 600 | Blue 500 | Primary data visualization |
| `--chart-2` | Emerald 600 | Emerald 500 | `142 72% 29%` / `160 60% 45%` |
| `--chart-3` | Orange 500 | Orange 400 | `24 80% 50%` / `30 80% 55%` |
| `--chart-4` | Violet 500 | Violet 400 | `262 52% 47%` / `280 65% 60%` |
| `--chart-5` | Red 600 | Red 500 | `0 72% 51%` / `340 75% 55%` |

**Key distinction from reference design**: PT-2 uses **Teal/Cyan** (`HSL 189°`) as its primary accent, not pure blue. This carries through to charts and highlights.

### 5.2 Semantic Color Mapping

| Semantic Purpose | Color | Tailwind Class |
|-----------------|-------|----------------|
| **Primary accent** | Teal/Cyan | `text-accent`, `bg-accent/10` |
| **Positive trend** | Emerald | `text-emerald-500` |
| **Negative trend** | Red | `text-red-500` |
| **Warning/Telemetry** | Amber | `text-amber-500`, `border-amber-500/30` |
| **Promo/Loyalty** | Purple | `text-purple-400`, `border-purple-500/30` |
| **Neutral/Muted** | Zinc | `text-muted-foreground` |

### 5.3 Badge Variants

```tsx
// Trend indicators (with icons from lucide-react)
<Badge className="bg-emerald-500/10 text-emerald-500">
  <TrendingUp className="mr-1 h-3 w-3" />
  +90.2%
</Badge>

<Badge className="bg-red-500/10 text-red-500">
  <TrendingDown className="mr-1 h-3 w-3" />
  -40%
</Badge>

<Badge className="bg-muted text-muted-foreground">0%</Badge>

// Status badges
<Badge variant="outline" className="border-amber-500/50 text-amber-600">TELEMETRY</Badge>
<Badge variant="outline" className="border-purple-500/50 text-purple-500">PROMO</Badge>
<Badge variant="destructive">CRITICAL</Badge>
<Badge variant="secondary">INFO</Badge>
```

---

## 6. Typography

### 6.1 Font System

PT-2 uses the following font stack (defined in `app/layout.tsx`):

| Variable | Font | Usage |
|----------|------|-------|
| `--font-sans` | **DM Sans** | Body text, labels, headings |
| `--font-mono` | **JetBrains Mono** | Numeric data, IDs, timestamps |

**Admin Dashboard Policy**:
- Use `font-sans` (DM Sans) for all labels and headings
- Use `font-mono` (JetBrains Mono) **only** for:
  - Currency values: `$124,592`
  - IDs: `#329341`
  - Timestamps: `46 min ago`
  - Table cell data

This differs from the Pit Dashboard which uses monospace more liberally for its brutalist aesthetic.

### 6.2 Hierarchy

| Element | Class | Usage |
|---------|-------|-------|
| Page title | `text-2xl font-semibold tracking-tight` | "Shift Dashboard" |
| Page subtitle | `text-sm text-muted-foreground` | "Here's the details of your analysis" |
| Section header | `text-lg font-medium` | "Cash Observations" |
| Card title | `text-sm font-medium` | KPI labels |
| Metric value | `text-2xl font-semibold font-mono tabular-nums` | "$124,592" |
| Metric label | `text-sm text-muted-foreground` | "Total Drop" |
| Trend text | `text-xs` | "+90.2% +1,454 today" |
| Table header | `text-xs font-medium text-muted-foreground` | Column headers |

### 6.3 Monospace for Data

```tsx
// Use monospace for numerical data in tables and metrics
<span className="font-mono text-sm tabular-nums">$12,345.00</span>

// Use monospace for IDs
<span className="font-mono text-xs text-muted-foreground">#329341</span>

// Use monospace for timestamps
<span className="font-mono text-xs">46 min ago</span>
```

---

## 7. Loading States

### 7.1 Skeleton Pattern (NOT Spinners)

```tsx
// KPI card skeleton
<Card className="p-6">
  <div className="flex items-center justify-between">
    <Skeleton className="h-10 w-10 rounded-lg" />
    <Skeleton className="h-5 w-16" />
  </div>
  <div className="mt-4 space-y-2">
    <Skeleton className="h-8 w-24" />
    <Skeleton className="h-4 w-20" />
  </div>
</Card>
```

**Loading Rules**:
1. Use `<Skeleton>` components, never spinners
2. Match skeleton dimensions to expected content
3. Use `useTransition` for navigation (React 19)
4. Implement stale-while-revalidate with TanStack Query

---

## 8. Responsive Breakpoints

```tsx
// Grid responsive pattern
<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
  {kpiCards}
</div>

// Chart container responsive
<div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
  <div className="lg:col-span-2">{/* Primary chart */}</div>
  <div>{/* Secondary panel */}</div>
</div>
```

---

## 9. File Structure

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
    ├── thresholds/
    │   └── page.tsx              # Alert thresholds config
    └── shifts/
        └── page.tsx              # Shift schedule config

components/admin/
├── shift-dashboard/
│   ├── kpi-cards.tsx             # KPI card grid
│   ├── cash-obs-panel.tsx        # Telemetry panel
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

## 10. Implementation Priorities

### Phase 1: Scaffold
1. Admin layout with sidebar navigation
2. Shift dashboard page structure
3. KPI card grid (with mock data)
4. Time window picker

### Phase 2: Telemetry Integration
1. Cash observations panel (with backend RPCs)
2. Alert display panel
3. Table rollups chart

### Phase 3: Configuration
1. Alert thresholds settings page
2. Shift schedule configuration

---

## 11. Validation Checklist

Before marking Admin Dashboard complete:

**Architecture**:
- [ ] Dedicated `/admin/*` routes (NOT patch to pit dashboard)
- [ ] Sidebar navigation with admin menu items
- [ ] Responsive grid layout (12-column system)

**Design System Compliance**:
- [ ] Uses DM Sans for labels, JetBrains Mono for data only
- [ ] Follows Modern SaaS aesthetic (rounded corners, subtle shadows)
- [ ] PT-2 theme tokens used (`--accent`, `--chart-*`)
- [ ] Teal/Cyan as primary accent (not blue)

**Component Patterns**:
- [ ] KPI cards: colored left-border accent + metric + trend + action link
- [ ] Telemetry sections visually distinct (amber accent, TELEMETRY badge)
- [ ] Recent Activity tables with avatars, status dots, monospace IDs
- [ ] Charts using shadcn/ui chart components (prerequisite: `npx shadcn@latest add chart`)
- [ ] Time window picker with presets

**Technical**:
- [ ] Skeleton loading states (no spinners)
- [ ] `npm run type-check` passes
- [ ] React 19 patterns (useTransition, no manual loading state)

---

## Related Documents

- **Shift Dashboards Context**: `.claude/skills/frontend-design-pt-2/references/shift-dashboards-context.md`
- **Metrics Catalog**: `docs/00-vision/shift-dashboards/SHIFT_METRICS_CATALOG_v0_PATH_B_PATCH_cash-observations.md`
- **PRD**: `docs/10-prd/PRD-Shift-Dashboards-Shift-Reports-v0.2_PATCH_cash-observations.md`
- **Alert Thresholds**: `docs/00-vision/loyalty-service-extension/SHIFT_DASHBOARDS_V0_ALERT_THRESHOLDS_BASELINES_PATCH.md`

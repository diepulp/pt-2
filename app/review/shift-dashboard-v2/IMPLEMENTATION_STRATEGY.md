# Shift Dashboard V2 - Implementation Strategy

## Executive Summary

This document outlines the strategic redesign of the PT-2 Shift Dashboard, applying Nielsen's 10 Usability Heuristics to transform a cluttered, overwhelming interface into a focused command center for pit bosses and floor supervisors.

---

## 1. Current State Analysis

### 1.1 Existing Component Inventory

| Component | Purpose | Data Source | Issues |
|-----------|---------|-------------|--------|
| `CasinoSummaryCard` | 7 KPI cards (4+3 grid) | `ShiftCasinoMetricsDTO` | Information overload, competes for attention |
| `AlertsPanel` | Spike alerts list | `CashObsSpikeAlertDTO[]` | Ambiguous severity, unclear actions |
| `CashObservationsPanel` | Telemetry rollups | `CashObsSummaryDTO` | Unclear value, "TELEMETRY" label confusing |
| `PitMetricsTable` | Pit rollups | `ShiftPitMetricsDTO[]` | Good, but buried below KPIs |
| `TableMetricsTable` | Table details | `ShiftTableMetricsDTO[]` | Good, but rarely first-look data |
| `TimeWindowSelector` | Shift window control | Local state | Adequate |

### 1.2 Information Architecture Problems

```
CURRENT LAYOUT:
┌─────────────────────────────────────────────────────────────┐
│ Header + Time Window Selector                               │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────┬─────────┬─────────┬─────────┐                  │
│ │ Win/Loss│ Win/Loss│ Fills   │ Credits │  ← 4 cards       │
│ │ Inv     │ Est     │         │         │    competing     │
│ └─────────┴─────────┴─────────┴─────────┘                  │
│ ┌─────────┬─────────┬─────────┐                            │
│ │ Est Drop│ Est Drop│ Est Drop│  ← 3 more cards            │
│ │ Rated   │ Grind   │ Cash    │    (telemetry detail)      │
│ └─────────┴─────────┴─────────┘                            │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────┐ ┌─────────────────────────┐  │
│ │ Pit/Table Metrics         │ │ Alerts (ambiguous)      │  │
│ │ (Tabs: Casino/Pit/Table)  │ │ Cash Obs (what is this?)│  │
│ │                           │ │                         │  │
│ └───────────────────────────┘ └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

PROBLEMS:
1. 7 metrics compete equally for attention
2. No clear hierarchy - what's most important?
3. "Telemetry" label is jargon
4. Alerts buried in sidebar
5. No visual summary of player activity
6. User must mentally aggregate data
```

---

## 2. Nielsen's Heuristics Applied

### Heuristic 1: Visibility of System Status
**Current Violation**: No real-time activity indicators. User can't tell if data is live.
**Solution**:
- Add "Last updated X sec ago" indicator with auto-refresh status
- Pulse animation on critical alerts
- Visual diff indicators when values change

### Heuristic 2: Match Between System and Real World
**Current Violation**: "Telemetry", "ESTIMATE grade", "coverage" are internal jargon.
**Solution**:
- Replace "Telemetry" with "Live Observations" or hide the distinction
- Replace "ESTIMATE" grade with visual confidence indicator
- Use casino terminology: "Floor Activity", "Player Action", "Cash Movement"

### Heuristic 3: User Control and Freedom
**Current Violation**: No quick way to focus/filter or compare time periods.
**Solution**:
- Quick filters for "Hot Tables" (high activity)
- One-click drill-down from KPI to table detail
- Collapsible sections for advanced data

### Heuristic 4: Consistency and Standards
**Current Violation**: Currency formatting inconsistent, color coding unclear.
**Solution**:
- Establish semantic color system:
  - Emerald (#10B981): Positive win, good status
  - Rose (#F43F5E): Loss, critical alerts
  - Amber (#F59E0B): Warning, attention needed
  - Blue (#3B82F6): Informational, neutral
- Consistent `$X,XXX` formatting, always cents-to-dollars

### Heuristic 5: Error Prevention
**Current Violation**: Alerts shown but no guidance on action.
**Solution**:
- Alerts include recommended action
- Visual severity hierarchy (critical floats to top, has call-to-action)
- Confirmation for any state-changing actions

### Heuristic 6: Recognition Rather Than Recall
**Current Violation**: User must remember thresholds and compare mentally.
**Solution**:
- Show threshold inline with observed value
- Use progress bars for coverage metrics
- Display trend sparklines for pattern recognition

### Heuristic 7: Flexibility and Efficiency of Use
**Current Violation**: No shortcuts for expert users.
**Solution**:
- Keyboard shortcuts for pit navigation (1-9)
- "Expert Mode" toggle for full data density
- Pinnable tables for focused monitoring

### Heuristic 8: Aesthetic and Minimalist Design
**Current Violation**: Every metric shown regardless of relevance.
**Solution**:
- **Primary**: Win/Loss (the number that matters)
- **Secondary**: Fills, Credits, Est. Drop (operational inputs)
- **Progressive Disclosure**: Detailed breakdowns in expandable sections
- **Remove**: Redundant counts, duplicate metrics

### Heuristic 9: Help Users Recognize, Diagnose, and Recover from Errors
**Current Violation**: Alerts say "spike detected" but not what to do.
**Solution**:
- Alert message format: `[Entity] + [Issue] + [Recommended Action]`
- Link alerts to relevant table detail
- Severity indicates urgency, not just magnitude

### Heuristic 10: Help and Documentation
**Current Violation**: No tooltips explaining metrics.
**Solution**:
- Tooltips on all metric labels explaining calculation
- Help icon with metric glossary
- Inline formula display for computed values

---

## 3. Proposed Layout Architecture

### 3.1 Visual Hierarchy (F-Pattern Reading)

```
PROPOSED LAYOUT:
┌────────────────────────────────────────────────────────────────────┐
│ Shift Dashboard                              [Time: 8h window ▼]  │
│ Operational metrics • Last updated 12s ago                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────────────────┐  ┌────────────────────────┐ │
│  │  ★ WIN/LOSS                      │  │  FLOOR ACTIVITY       │ │
│  │  ┌────────────────────────────┐  │  │  ┌──────────────────┐  │ │
│  │  │         $45,230            │  │  │  │    ████████      │  │ │
│  │  │  ▲ +$12,400 vs prior       │  │  │  │    █  60  █      │  │ │
│  │  │  [━━━━━━━━━ sparkline ━━━] │  │  │  │    ████████      │  │ │
│  │  └────────────────────────────┘  │  │  │                  │  │ │
│  │                                  │  │  │  ● Rated    42   │  │ │
│  │  Inventory ────── Estimated ───  │  │  │  ○ Unrated  18   │  │ │
│  │  $42,100          $48,360        │  │  └──────────────────┘  │ │
│  └──────────────────────────────────┘  │  70% generating value  │ │
│                                        └────────────────────────┘ │
│                                                                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                   │
│  │  FILLS     │  │  CREDITS   │  │  EST. DROP │                   │
│  │  $18,500   │  │  $4,200    │  │  $67,800   │                   │
│  │  12 txns   │  │  3 txns    │  │  Rated+Cash│                   │
│  └────────────┘  └────────────┘  └────────────┘                   │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│  ⚠ ALERTS (2)                                        [View All →] │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │ 🔴 BJ-04: Large cash-out $8,500 (threshold $5,000)        │   │
│  │    → Review player activity, verify with cage              │   │
│  └────────────────────────────────────────────────────────────┘   │
├────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ [Casino] [Pit 1] [Pit 2] [Pit 3]          🔍 [Filter ▼]     │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │ Table      Win/Loss   Fills    Credits   Quality   Status   │ │
│  │ ──────     ────────   ─────    ───────   ───────   ──────   │ │
│  │ BJ-01      +$3,200    $2,000   $500      ●●●○      Active   │ │
│  │ BJ-02      -$1,400    $1,500   $0        ●●○○      Active   │ │
│  │ BJ-03      +$8,100    $4,000   $1,200    ●●●●      Active   │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ▼ Advanced: Telemetry Details                     [Collapsed]    │
└────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Breakdown

| Zone | Component | Purpose | Priority |
|------|-----------|---------|----------|
| A | Hero Win/Loss Card | Primary KPI with trend | P0 - Always visible |
| B | Floor Activity Donut | Rated vs Unrated visitor ratio (value metric) | P0 - Quick scan |
| C | Secondary KPIs | Operational inputs (Fills, Credits, Drop) | P1 - Supporting context |
| D | Alerts Strip | Actionable notifications | P1 - Attention when needed |
| E | Metrics Table | Detailed breakdown by pit/table | P2 - Drill-down |
| F | Telemetry Drawer | Advanced cash observations | P3 - Expert only |

---

## 4. Data Dependencies Summary

### Available Data (No Backend Changes)

| Component | Data Source | Hook | Status |
|-----------|-------------|------|--------|
| Hero Win/Loss | `ShiftCasinoMetricsDTO` | `useShiftDashboardSummary()` | ✅ Available |
| Secondary KPIs | `ShiftCasinoMetricsDTO` | `useShiftDashboardSummary()` | ✅ Available |
| Alerts Strip | `CashObsSpikeAlertDTO[]` | `useCashObsSummary()` | ✅ Available |
| Metrics Table | `ShiftPitMetricsDTO[]`, `ShiftTableMetricsDTO[]` | `useShiftDashboardSummary()` | ✅ Available |
| Telemetry Drawer | `CashObsSummaryDTO` | `useCashObsSummary()` | ✅ Available |

### New Backend Work Required

| Component | Data Needed | Required Work |
|-----------|-------------|---------------|
| Floor Activity Donut | `ActiveVisitorsSummaryDTO` | New RPC + API route + hook |

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ EXISTING DATA FLOW (No Changes)                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  useShiftDashboardSummary() ──► /api/v1/shift-dashboards/summary   │
│       │                              │                              │
│       │                              ▼                              │
│       │                    rpc_shift_casino_metrics                 │
│       │                    rpc_shift_pit_metrics                    │
│       │                    rpc_shift_table_metrics                  │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ Hero W/L    │  │ Secondary   │  │ Metrics     │                 │
│  │ Card        │  │ KPIs        │  │ Table       │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
│                                                                     │
│  useCashObsSummary() ──► /api/v1/shift-dashboards/cash-obs/summary │
│       │                              │                              │
│       │                              ▼                              │
│       │                    rpc_shift_cash_obs_*                     │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────┐  ┌─────────────┐                                  │
│  │ Alerts      │  │ Telemetry   │                                  │
│  │ Strip       │  │ Drawer      │                                  │
│  └─────────────┘  └─────────────┘                                  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ NEW DATA FLOW (Phase 4)                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  useActiveVisitorsSummary() ──► /api/v1/shift-dashboards/visitors  │
│       │                              │                              │
│       │                              ▼                              │
│       │                    rpc_shift_active_visitors_summary [NEW]  │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────┐                                                   │
│  │ Floor       │                                                   │
│  │ Activity    │                                                   │
│  │ Donut       │                                                   │
│  └─────────────┘                                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Data Contract Mapping

### 5.1 Hero Win/Loss Card

**Source**: `ShiftCasinoMetricsDTO`
```typescript
// Primary display
const primaryWinLoss = data.win_loss_estimated_total_cents; // Headline number

// Secondary comparison
const inventoryWinLoss = data.win_loss_inventory_total_cents;

// Sparkline data - requires historical query (future enhancement)
// For MVP: Show current vs prior shift comparison
```

### 5.2 Active Visitors Donut (Rated vs Unrated)

**Business Purpose**: Show shift supervisors the ratio of **value-generating** players (rated, tracked theo) vs **resource-consuming** players (unrated, using comps without tracked play). This is a key shift productivity metric.

**Data Model**: The `visit.visit_kind` enum provides the classification:

| Visit Kind | Label | Meaning | Shift Value |
|------------|-------|---------|-------------|
| `gaming_identified_rated` | **Rated** | Player identified, gaming, loyalty accrual | VALUE - generating theo |
| `gaming_ghost_unrated` | **Unrated** | No player ID, gaming, compliance only | NON-VALUE - consuming resources |
| `reward_identified` | Comps Only | Player identified, no gaming, redemptions | COMP USER - redeeming only |

**Source**: NEW aggregate RPC needed - `rpc_shift_active_visitors_summary`

```typescript
// Required output for donut chart
interface ActiveVisitorsSummaryDTO {
  // Rated players (gaming_identified_rated) with active slips
  rated_count: number;

  // Unrated players (gaming_ghost_unrated) with active slips
  unrated_count: number;

  // Total active visitors
  total_count: number;

  // Percentage of rated (value metric)
  rated_percentage: number;
}
```

**Existing RPC**: `rpc_list_active_players_casino_wide` returns slip-level detail but not a summary. For the donut we need counts only.

**Implementation Options**:

1. **Option A (Preferred)**: Create new `rpc_shift_active_visitors_summary` that aggregates counts by `visit_kind`
2. **Option B**: Extend `rpc_shift_casino_metrics` to include visitor counts alongside table metrics
3. **Option C**: Client-side aggregation from `rpc_list_active_players_casino_wide` (less efficient, more data transfer)

**SQL Sketch for Option A**:
```sql
CREATE OR REPLACE FUNCTION rpc_shift_active_visitors_summary()
RETURNS TABLE (
  rated_count bigint,
  unrated_count bigint,
  total_count bigint,
  rated_percentage numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_casino_id uuid;
BEGIN
  PERFORM set_rls_context_from_staff();
  v_casino_id := current_setting('app.casino_id', true)::uuid;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE v.visit_kind = 'gaming_identified_rated') AS rated_count,
    COUNT(*) FILTER (WHERE v.visit_kind = 'gaming_ghost_unrated') AS unrated_count,
    COUNT(*) AS total_count,
    ROUND(
      COUNT(*) FILTER (WHERE v.visit_kind = 'gaming_identified_rated')::numeric /
      NULLIF(COUNT(*), 0) * 100,
      1
    ) AS rated_percentage
  FROM rating_slip rs
  INNER JOIN visit v ON v.id = rs.visit_id
  WHERE rs.status IN ('open', 'paused')
    AND rs.casino_id = v_casino_id;
END;
$$;
```

### 5.3 Secondary KPIs

**Source**: `ShiftCasinoMetricsDTO`
```typescript
// Fills
fills_total_cents: number;

// Credits
credits_total_cents: number;

// Est. Drop (combined for simplicity)
const estDropTotal =
  data.estimated_drop_rated_total_cents +
  data.estimated_drop_grind_total_cents +
  data.estimated_drop_buyins_total_cents;
```

### 5.4 Alerts Strip

**Source**: `CashObsSpikeAlertDTO[]`
```typescript
// Filter to show max 2 most critical
const topAlerts = alerts
  .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
  .slice(0, 2);

// Enhancement: Add recommended action
const getRecommendedAction = (alert: CashObsSpikeAlertDTO): string => {
  switch (alert.alert_type) {
    case 'cash_out_observed_spike_telemetry':
      return 'Review player activity, verify with cage';
    default:
      return 'Investigate unusual activity';
  }
};
```

### 5.5 Metrics Table

**Source**: `ShiftPitMetricsDTO[]` and `ShiftTableMetricsDTO[]`
- Existing DTOs are sufficient
- Add visual quality indicator (dots instead of text)
- Simplify columns to essentials

---

## 6. Implementation Phases

### Phase 1: Layout Skeleton (Foundation)
**Scope**: Restructure layout without changing data fetching
**Files**:
- `shift-dashboard-v2.tsx` - Main orchestration
- `hero-win-loss-card.tsx` - Primary KPI
- `active-players-chart.tsx` - Donut (mocked data initially)
- `secondary-kpis.tsx` - Fills, Credits, Drop
- `alerts-strip.tsx` - Condensed alerts

**Acceptance**:
- [ ] Layout matches proposed wireframe
- [ ] All existing data displays correctly
- [ ] Responsive on tablet and desktop

### Phase 2: Visual Polish (Aesthetics)
**Scope**: Apply design system, animations, color semantics
**Changes**:
- Color system implementation
- Typography hierarchy
- Micro-interactions (hover, focus)
- Loading skeletons
- Dark theme refinement

**Acceptance**:
- [ ] Passes Heuristic 4 (Consistency)
- [ ] Passes Heuristic 8 (Minimalist Design)
- [ ] Accessible color contrast (WCAG AA)

### Phase 3: Interactivity (UX)
**Scope**: Progressive disclosure, collapsible sections
**Changes**:
- Collapsible telemetry drawer
- Alert expand/collapse
- Keyboard navigation
- Drill-down from KPI to table

**Acceptance**:
- [ ] Passes Heuristic 3 (User Control)
- [ ] Passes Heuristic 7 (Flexibility)

### Phase 4: Floor Activity Donut (Requires Backend)
**Scope**: Add rated vs unrated visitor visualization
**Backend Work Required**:
1. Create `rpc_shift_active_visitors_summary` RPC (see §4.2 SQL sketch)
2. Add hook `useActiveVisitorsSummary()` in `hooks/shift-dashboard/`
3. Add endpoint `/api/v1/shift-dashboards/visitors-summary`

**Frontend Work**:
- `floor-activity-donut.tsx` component with real data
- Recharts or custom SVG donut implementation
- Integration with dashboard data flow

**Acceptance Criteria**:
- [ ] Donut shows rated (emerald) vs unrated (slate) segments
- [ ] Center displays total count
- [ ] Legend shows counts and percentages
- [ ] "X% generating value" call-out is prominent
- [ ] Loading skeleton during data fetch

### Phase 5: Telemetry Improvements (Future)
**Scope**: Statistical model gaps from `SHIFT_DASHBOARD_DATA_PIPELINE_STATUS.md`
- Trending/baselines
- Z-score anomaly detection
- Prior shift comparison

---

## 7. Component Specifications

### 7.1 Hero Win/Loss Card

```
┌──────────────────────────────────────────────────┐
│  ★ WIN/LOSS                              ⓘ      │
│                                                  │
│     $45,230                                      │
│     ▲ +$12,400 from prior shift                 │
│                                                  │
│  [━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ sparkline]   │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ Inventory    │  │ Estimated    │             │
│  │ $42,100      │  │ $48,360      │             │
│  │ (tray delta) │  │ (+telemetry) │             │
│  └──────────────┘  └──────────────┘             │
└──────────────────────────────────────────────────┘

Props:
- winLossCents: number
- inventoryWinLossCents: number
- estimatedWinLossCents: number
- priorShiftDelta?: number (future)
- sparklineData?: number[] (future)
- isLoading: boolean
```

### 7.2 Active Visitors Donut (Rated vs Unrated)

```
┌──────────────────────────────────┐
│  FLOOR ACTIVITY            ⓘ   │
│                                  │
│      ┌─────────────┐            │
│      │  ██████     │            │
│      │  █ 60 █     │  ← Donut   │
│      │  ██████     │    chart   │
│      └─────────────┘            │
│                                  │
│  ● Rated Visitors   42  (70%)   │  ← VALUE players
│  ○ Unrated Visitors 18  (30%)   │  ← NON-VALUE players
│                                  │
│  70% of floor generating value  │  ← Key insight
└──────────────────────────────────┘

Business Context:
- RATED = Players who identify themselves, generate tracked theo,
          earn comps based on actual play. THESE ARE VALUE.
- UNRATED = Players who don't identify (ghosts), use casino
            resources/comps but don't generate tracked value.
            THESE CONSUME WITHOUT CONTRIBUTING.

Props:
- ratedCount: number          // gaming_identified_rated visits
- unratedCount: number        // gaming_ghost_unrated visits
- ratedPercentage: number     // Key value metric for shift
- isLoading: boolean

Visual Design:
- Emerald (#10B981) = Rated segment (positive, value)
- Slate (#64748B) = Unrated segment (neutral, untracked)
- Center: Total count with "visitors" label
- Legend: Clear labeling with percentages
- Call-out: "X% of floor generating value" as primary insight
```

### 7.3 Secondary KPI Card

```
┌────────────────┐
│  FILLS     ⓘ  │
│  $18,500      │
│  12 transactions│
│  ▼ -$2,000    │
└────────────────┘

Props:
- title: string
- valueCents: number
- subtitle?: string
- trend?: { value: number; direction: 'up' | 'down' }
- accentColor: string
- isLoading: boolean
```

### 7.4 Alerts Strip

```
┌────────────────────────────────────────────────────────────────┐
│ ⚠ ALERTS (2)                                     [View All →] │
│                                                                │
│ 🔴 CRITICAL  BJ-04: Cash-out $8,500 exceeds $5,000 threshold  │
│              → Review player activity                          │
│                                                                │
│ 🟡 WARNING   Pit A: Unusual activity pattern detected          │
│              → Monitor next 30 min                             │
└────────────────────────────────────────────────────────────────┘

Props:
- alerts: CashObsSpikeAlertDTO[]
- maxDisplay?: number (default 2)
- onViewAll: () => void
- onAlertClick: (alert) => void
```

---

## 8. Design Tokens

### 8.1 Color Semantics

```css
/* Status Colors */
--color-positive: #10B981;      /* Emerald - win, good */
--color-negative: #F43F5E;      /* Rose - loss, critical */
--color-warning: #F59E0B;       /* Amber - attention */
--color-info: #3B82F6;          /* Blue - informational */

/* Surface Colors (Dark Theme) */
--surface-base: #0A0A0F;        /* Page background */
--surface-raised: #12121A;      /* Card background */
--surface-elevated: #1A1A24;    /* Hover, active states */
--surface-overlay: #22222E;     /* Modals, drawers */

/* Text Colors */
--text-primary: #F8FAFC;        /* Headings, primary */
--text-secondary: #94A3B8;      /* Labels, secondary */
--text-muted: #64748B;          /* Hints, disabled */

/* Accent */
--accent-primary: #10B981;      /* Interactive elements */
--accent-secondary: #F59E0B;    /* Telemetry distinction */
```

### 8.2 Typography Scale

```css
/* Monospace for numbers (financial data) */
--font-mono: 'JetBrains Mono', 'SF Mono', monospace;

/* Sans for labels/UI */
--font-sans: 'Inter', 'SF Pro', system-ui, sans-serif;

/* Scale */
--text-hero: 3rem;      /* 48px - Win/Loss headline */
--text-2xl: 1.5rem;     /* 24px - Card values */
--text-xl: 1.25rem;     /* 20px - Section headers */
--text-base: 1rem;      /* 16px - Body text */
--text-sm: 0.875rem;    /* 14px - Labels */
--text-xs: 0.75rem;     /* 12px - Captions, badges */
```

---

## 9. File Structure

```
app/review/shift-dashboard-v2/
├── page.tsx                       # Route entry
├── shift-dashboard-v2.tsx         # Main orchestration
├── IMPLEMENTATION_STRATEGY.md     # This document
│
├── components/
│   ├── hero-win-loss-card.tsx     # Primary KPI with sparkline
│   ├── floor-activity-donut.tsx   # Rated vs Unrated visitors donut
│   ├── secondary-kpi-card.tsx     # Reusable KPI card component
│   ├── secondary-kpis-row.tsx     # Fills, Credits, Est. Drop
│   ├── alerts-strip.tsx           # Condensed actionable alerts
│   ├── metrics-table.tsx          # Pit/Table metrics with tabs
│   └── telemetry-drawer.tsx       # Collapsible cash observations
│
└── lib/
    ├── format.ts                  # Currency, number, percentage formatting
    └── colors.ts                  # Semantic color helpers
```

---

## 10. Migration Path

### From V1 to V2

1. **Parallel Development**: V2 lives in `/review/shift-dashboard-v2/` during development
2. **Feature Flag**: When ready, add flag to switch between layouts
3. **A/B Testing**: Optional - compare user behavior metrics
4. **Gradual Rollout**: Replace V1 route with V2 after validation
5. **Cleanup**: Remove V1 components after successful migration

### Data Hook Reuse

All existing hooks remain unchanged:
- `useShiftDashboardSummary()` - Primary data source
- `useCashObsSummary()` - Telemetry and alerts

New hooks needed:
- `useActivePlayersSummary()` - Player counts (Phase 4)

---

## 11. Success Metrics

### Quantitative
- **Time to first insight**: User can identify win/loss status within 2 seconds
- **Alert response time**: Reduced from current baseline (measure)
- **Cognitive load**: Fewer eye fixations to understand status (usability test)

### Qualitative
- Pit bosses report dashboard is "at a glance" understandable
- Alerts lead to clear actions
- Advanced users can still access detailed data

---

## 12. References

- [Nielsen's 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
- `docs/00-vision/shift-dashboards/SHIFT_DASHBOARD_DATA_PIPELINE_STATUS.md`
- `docs/00-vision/shift-dashboards/dash-1.png` (baseline inspiration)
- `services/table-context/shift-metrics/dtos.ts` (data contracts)
- `hooks/shift-dashboard/index.ts` (existing hooks)

---

## Appendix A: Heuristic Checklist for Review

| # | Heuristic | V2 Implementation | Status |
|---|-----------|-------------------|--------|
| 1 | Visibility of System Status | Last updated indicator, loading states | ☐ |
| 2 | Match System & Real World | Casino terminology, no jargon | ☐ |
| 3 | User Control & Freedom | Collapsible sections, quick filters | ☐ |
| 4 | Consistency & Standards | Semantic colors, formatting | ☐ |
| 5 | Error Prevention | Actionable alerts, confirmations | ☐ |
| 6 | Recognition > Recall | Inline thresholds, progress bars | ☐ |
| 7 | Flexibility & Efficiency | Keyboard nav, expert mode | ☐ |
| 8 | Aesthetic & Minimalist | Information hierarchy, progressive disclosure | ☐ |
| 9 | Help Recognize Errors | Alert format with actions | ☐ |
| 10 | Help & Documentation | Tooltips, metric glossary | ☐ |

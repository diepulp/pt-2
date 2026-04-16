# Exceptions & Approvals Panel Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded mock data in the Exceptions & Approvals panel with live data from existing services — zero new migrations, RPCs, or RLS policies.

**Architecture:** Single orchestrating hook (`useExceptionsData`) composes 3 existing hooks (`useCashObsSummary`, `useShiftTableMetrics`) plus 1 new direct Supabase query (pending fills/credits). The panel receives `casinoId` threaded from the layout. Each tab maps to a derived slice of the hook's return value.

**Tech Stack:** React 19, TanStack Query v5, Supabase client, existing shift-dashboard + shift-metrics hooks.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `hooks/dashboard/use-exceptions-data.ts` | **Create** | Orchestrating hook — composes alerts, approvals, flags from existing data sources |
| `hooks/dashboard/keys.ts` | **Modify** | Add `pendingFillsCredits` query key |
| `components/pit-panels/exceptions-approvals-panel.tsx` | **Rewrite** | Replace all mock data with hook consumption, add `casinoId` prop |
| `components/pit-panels/pit-panels-dashboard-layout.tsx` | **Modify** | Pass `casinoId` to `ExceptionsApprovalsPanel` |

---

### Task 1: Add query key for pending fills/credits

**Files:**
- Modify: `hooks/dashboard/keys.ts`

- [ ] **Step 1: Add the query key**

In `hooks/dashboard/keys.ts`, add a new key before the `// === Invalidation Helpers ===` comment:

```typescript
  // === Pending Fills/Credits (Exceptions & Approvals Panel) ===

  /**
   * Pending (unconfirmed) fills and credits for the casino.
   * Used by the Approvals tab in the Exceptions panel.
   */
  pendingFillsCredits: (casinoId: string) =>
    [...ROOT, 'pending-fills-credits', casinoId] as const,
```

- [ ] **Step 2: Lint**

Run: `npx eslint hooks/dashboard/keys.ts --quiet`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/dashboard/keys.ts
git commit -m "feat: add pendingFillsCredits query key for approvals tab"
```

---

### Task 2: Create the orchestrating hook

**Files:**
- Create: `hooks/dashboard/use-exceptions-data.ts`

This hook composes 3 data sources into a unified return shape for the panel.

- [ ] **Step 1: Create the hook file**

Create `hooks/dashboard/use-exceptions-data.ts`:

```typescript
/**
 * Exceptions & Approvals Data Hook
 *
 * Orchestrates data for the three tabs:
 * - Alerts: cash obs spike alerts + shift metrics exception flags
 * - Approvals: pending (unconfirmed) fills and credits
 * - Flags: tables with missing snapshots, no telemetry, open-slips issues
 *
 * Composes existing hooks (useCashObsSummary, useShiftTableMetrics)
 * plus one direct Supabase query for pending fills/credits.
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import type { CashObsSpikeAlertDTO } from '@/services/table-context/dtos';
import type { ShiftTableMetricsDTO } from '@/services/table-context/shift-metrics/dtos';
import { useCashObsSummary } from '@/hooks/shift-dashboard/use-cash-obs-summary';
import { useShiftTableMetrics } from '@/hooks/shift-dashboard/use-shift-table-metrics';

import { dashboardKeys } from './keys';

// === Types ===

export interface AlertItem {
  id: string;
  type: 'spike' | 'snapshot' | 'telemetry';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  time: string | null;
}

export interface ApprovalItem {
  id: string;
  type: 'fill' | 'credit';
  tableName: string;
  amountCents: number;
  requestedBy: string | null;
  createdAt: string;
}

export interface FlagItem {
  id: string;
  type: 'missing_snapshot' | 'no_telemetry';
  title: string;
  description: string;
  tableLabel: string;
}

export interface ExceptionsData {
  alerts: AlertItem[];
  approvals: ApprovalItem[];
  flags: FlagItem[];
  isLoading: boolean;
}

// === Time Window ===

function getDefaultShiftWindow(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getTime() - 8 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: now.toISOString() };
}

// === Derivation ===

function deriveAlerts(
  spikeAlerts: CashObsSpikeAlertDTO[],
  shiftTables: ShiftTableMetricsDTO[],
): AlertItem[] {
  const items: AlertItem[] = [];

  // Cash obs spike alerts → high-value transaction alerts
  for (const alert of spikeAlerts) {
    items.push({
      id: `spike-${alert.entity_id}`,
      type: 'spike',
      severity: alert.severity === 'critical' ? 'high' : alert.severity === 'warn' ? 'medium' : 'low',
      title: `Cash Spike — ${alert.entity_label}`,
      description: alert.message,
      time: null,
    });
  }

  // Shift metrics exception flags → missing snapshot alerts
  for (const table of shiftTables) {
    if (table.missing_opening_snapshot) {
      items.push({
        id: `snap-open-${table.table_id}`,
        type: 'snapshot',
        severity: 'medium',
        title: `Missing Opening Snapshot`,
        description: `${table.table_label} has no opening inventory count`,
        time: table.window_start,
      });
    }
    if (table.missing_closing_snapshot) {
      items.push({
        id: `snap-close-${table.table_id}`,
        type: 'snapshot',
        severity: 'low',
        title: `Missing Closing Snapshot`,
        description: `${table.table_label} has no closing inventory count`,
        time: table.window_end,
      });
    }
  }

  // Sort: high → medium → low
  const order = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => order[a.severity] - order[b.severity]);

  return items;
}

function deriveFlags(shiftTables: ShiftTableMetricsDTO[]): FlagItem[] {
  const items: FlagItem[] = [];

  for (const table of shiftTables) {
    if (table.telemetry_quality === 'NONE') {
      items.push({
        id: `telem-${table.table_id}`,
        type: 'no_telemetry',
        title: 'No Telemetry Coverage',
        description: `${table.table_label} has zero cash observations this shift`,
        tableLabel: table.table_label,
      });
    }
  }

  return items;
}

// === Hook ===

/**
 * Orchestrates all data for the Exceptions & Approvals panel.
 *
 * @param casinoId - Casino UUID (undefined disables all queries)
 */
export function useExceptionsData(casinoId: string | undefined): ExceptionsData {
  const shiftWindow = getDefaultShiftWindow();

  // Source 1: Cash obs summary (includes spike alerts)
  const { data: cashObs, isLoading: cashObsLoading } = useCashObsSummary({
    window: shiftWindow,
    enabled: !!casinoId,
  });

  // Source 2: Shift table metrics (exception flags)
  const { data: shiftTables, isLoading: shiftLoading } = useShiftTableMetrics({
    window: shiftWindow,
    enabled: !!casinoId,
  });

  // Source 3: Pending fills and credits (direct Supabase query)
  const { data: approvals, isLoading: approvalsLoading } = useQuery({
    queryKey: dashboardKeys.pendingFillsCredits(casinoId!),
    queryFn: async (): Promise<ApprovalItem[]> => {
      const supabase = createBrowserComponentClient();

      // Fetch pending fills
      const { data: fills, error: fillsErr } = await supabase
        .from('table_fill')
        .select('id, amount_cents, created_at, table_id, gaming_table!inner(name)')
        .eq('status', 'requested')
        .order('created_at', { ascending: false })
        .limit(20);

      if (fillsErr) throw fillsErr;

      // Fetch pending credits
      const { data: credits, error: creditsErr } = await supabase
        .from('table_credit')
        .select('id, amount_cents, created_at, table_id, gaming_table!inner(name)')
        .eq('status', 'requested')
        .order('created_at', { ascending: false })
        .limit(20);

      if (creditsErr) throw creditsErr;

      const items: ApprovalItem[] = [];

      for (const f of fills ?? []) {
        const tableName = (f.gaming_table as unknown as { name: string })?.name ?? 'Unknown';
        items.push({
          id: f.id,
          type: 'fill',
          tableName,
          amountCents: f.amount_cents,
          requestedBy: null,
          createdAt: f.created_at,
        });
      }

      for (const c of credits ?? []) {
        const tableName = (c.gaming_table as unknown as { name: string })?.name ?? 'Unknown';
        items.push({
          id: c.id,
          type: 'credit',
          tableName,
          amountCents: c.amount_cents,
          requestedBy: null,
          createdAt: c.created_at,
        });
      }

      // Sort by created_at descending
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return items;
    },
    enabled: !!casinoId,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const isLoading = cashObsLoading || shiftLoading || approvalsLoading;

  return {
    alerts: deriveAlerts(cashObs?.alerts ?? [], shiftTables ?? []),
    approvals: approvals ?? [],
    flags: deriveFlags(shiftTables ?? []),
    isLoading,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Lint**

Run: `npx eslint hooks/dashboard/use-exceptions-data.ts --fix --quiet`
Expected: No errors (or auto-fixed formatting only).

- [ ] **Step 4: Commit**

```bash
git add hooks/dashboard/use-exceptions-data.ts
git commit -m "feat: add useExceptionsData hook for Exceptions & Approvals panel"
```

---

### Task 3: Thread casinoId to ExceptionsApprovalsPanel

**Files:**
- Modify: `components/pit-panels/pit-panels-dashboard-layout.tsx`

- [ ] **Step 1: Pass casinoId prop**

In `pit-panels-dashboard-layout.tsx`, change both render sites of `<ExceptionsApprovalsPanel />` to pass `casinoId`:

Line ~32 (mobile):
```tsx
<ExceptionsApprovalsPanel casinoId={casinoId} />
```

Line ~58 (desktop):
```tsx
<ExceptionsApprovalsPanel casinoId={casinoId} />
```

- [ ] **Step 2: Commit**

```bash
git add components/pit-panels/pit-panels-dashboard-layout.tsx
git commit -m "feat: thread casinoId to ExceptionsApprovalsPanel"
```

---

### Task 4: Rewrite the panel with live data

**Files:**
- Rewrite: `components/pit-panels/exceptions-approvals-panel.tsx`

This is the main task — replace all mock data with the hook, keep the existing visual structure, remove hardcoded items.

- [ ] **Step 1: Rewrite the panel**

Replace the entire file content of `components/pit-panels/exceptions-approvals-panel.tsx`. The component must:

1. Accept `casinoId: string` prop
2. Call `useExceptionsData(casinoId)`
3. Render the Alerts tab from `data.alerts` (severity-colored AlertCard per item)
4. Render the Approvals tab from `data.approvals` (fill/credit cards with amount + table name)
5. Render the Flags tab from `data.flags` (flag cards for telemetry/snapshot issues)
6. Show loading skeletons when `data.isLoading`
7. Show empty states when arrays are empty
8. Tab badge counts come from live array lengths, not hardcoded numbers
9. Keep the existing PT-2 brutalist visual patterns: severity-colored borders, status indicators, monospace timestamps

Key visual patterns to preserve from the existing file:
- `AlertCard` — severity-mapped border/bg/text colors (rose for high, amber for medium, muted for low)
- `ApprovalCard` — accent border, "Review" badge, table/amount display
- `FlagCard` — rose border, count badge
- `StatusPulse` — show when alerts.length > 0, hide when no alerts
- `SectionLabel` — tiny uppercase tracking-widest section headers

Formatting for amounts: `amountCents / 100` → `$X,XXX` with `toLocaleString`.
Formatting for times: `new Date(createdAt)` → `HH:MM` using `toLocaleTimeString` with `hour: '2-digit', minute: '2-digit'`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No type errors.

- [ ] **Step 3: Lint and format**

Run: `npx eslint components/pit-panels/exceptions-approvals-panel.tsx --fix --quiet`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/pit-panels/exceptions-approvals-panel.tsx
git commit -m "feat: wire Exceptions & Approvals panel to live data

Replace all hardcoded mock items with live data:
- Alerts tab: cash obs spike alerts + missing snapshot flags
- Approvals tab: pending fills/credits awaiting cashier confirmation
- Flags tab: tables with no telemetry coverage

No new migrations, RPCs, or RLS policies."
```

---

### Task 5: Final validation

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Zero errors.

- [ ] **Step 2: Full lint on changed files**

Run: `npx eslint components/pit-panels/exceptions-approvals-panel.tsx components/pit-panels/pit-panels-dashboard-layout.tsx hooks/dashboard/use-exceptions-data.ts hooks/dashboard/keys.ts --quiet`
Expected: Zero errors.

- [ ] **Step 3: Verify no regressions in shift dashboard hooks**

The hook reuses `useCashObsSummary` and `useShiftTableMetrics` — verify these still type-check cleanly:

Run: `npx tsc --noEmit --pretty 2>&1 | grep -c "error TS" || echo "0 errors"`
Expected: `0 errors`

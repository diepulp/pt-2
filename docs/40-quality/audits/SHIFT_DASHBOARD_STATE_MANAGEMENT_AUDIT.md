# Shift Dashboard State Management Audit

**Date**: 2026-01-14
**Auditor**: frontend-design skill
**Scope**: PRD-Shift-Dashboards-v0.2 implementation
**Standard**: ADR-003 State Management Strategy

---

## Executive Summary

The shift dashboard implementation (6 workstreams complete) lacks Zustand integration for client-side UI state. Currently, all state is managed via local `useState` hooks, creating:
- Prop drilling between components
- No persistence of user preferences (time window preset)
- Potential state reset on component remounts

**Recommendation**: Create `store/shift-dashboard-store.ts` following existing pit-dashboard and player-dashboard patterns.

---

## Current State Inventory

### `shift-dashboard-page.tsx` (Lines 62-77)

| State | Type | Current | Should Be |
|-------|------|---------|-----------|
| `window` | `ShiftTimeWindow \| null` | `useState` | **Zustand** (or URL params for shareability) |
| `selectedPitId` | `string \| undefined` | `useState` | **Zustand** |
| `lens` | `"casino" \| "pit" \| "table"` | `useState` | **Zustand** |

### `time-window-selector.tsx` (Lines 89, 92)

| State | Type | Current | Should Be |
|-------|------|---------|-----------|
| `preset` | `TimeWindowPreset` | `useState` | **Zustand** (sync with parent) |
| `formattedWindow` | `string` | `useState` | Local (derived, hydration-safe) |

---

## Identified Issues

### 1. State Isolation (Severity: MEDIUM)

Time window state is managed in `ShiftDashboardPage` and passed down via props. If additional components need access (e.g., export button, external refresh trigger), prop drilling increases.

**Current Flow**:
```
ShiftDashboardPage (window state)
  └── TimeWindowSelector (receives value, onChange)
  └── CasinoSummaryCard (receives data from hooks)
  └── PitMetricsTable (receives data, onPitSelect callback)
  └── TableMetricsTable (receives data, pitFilter)
  └── AlertsPanel (receives data)
  └── CashObservationsPanel (receives data, view)
```

### 2. Selection State Not Lifted (Severity: LOW)

`selectedPitId` and `lens` are local to `ShiftDashboardPage`. If a child component needs to trigger lens changes programmatically, callbacks must be drilled.

### 3. No Preference Persistence (Severity: LOW)

User's preferred time window preset (8h/12h/24h) resets on page reload. This is inconsistent with `pit-dashboard-store.ts` which tracks active panel.

---

## Existing Patterns Analysis

### Store Pattern (from `pit-dashboard-store.ts`)

```typescript
export const usePitDashboardStore = create<PitDashboardStore>()(
  devtools(
    (set) => ({
      // State
      selectedTableId: null,
      activePanel: "tables",

      // Actions with devtools naming
      setSelectedTable: (id) =>
        set({ selectedTableId: id }, undefined, "pit-dashboard/setSelectedTable"),
      setActivePanel: (panel) =>
        set({ activePanel: panel }, undefined, "pit-dashboard/setActivePanel"),
    }),
    { name: "pit-dashboard-store" },
  ),
);
```

### UI Hook Pattern (from `use-pit-dashboard-ui.ts`)

```typescript
export function usePitDashboardUI() {
  return usePitDashboardStore(
    useShallow((s) => ({
      selectedTableId: s.selectedTableId,
      setSelectedTable: s.setSelectedTable,
      // ... all needed state + actions
    })),
  );
}
```

---

## Proposed Store Design

### Interface

```typescript
// store/shift-dashboard-store.ts
"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type ShiftLens = "casino" | "pit" | "table";
export type TimeWindowPreset = "8h" | "12h" | "24h" | "current" | "custom";

export interface ShiftTimeWindow {
  start: string; // ISO timestamp
  end: string;   // ISO timestamp
}

interface ShiftDashboardStore {
  // === Time Window State ===
  timeWindow: ShiftTimeWindow | null;
  timeWindowPreset: TimeWindowPreset;

  // === Navigation State ===
  lens: ShiftLens;
  selectedPitId: string | null;
  selectedTableId: string | null;

  // === Actions ===
  setTimeWindow: (window: ShiftTimeWindow) => void;
  setTimeWindowPreset: (preset: TimeWindowPreset) => void;
  setLens: (lens: ShiftLens) => void;
  setSelectedPitId: (pitId: string | null) => void;
  setSelectedTableId: (tableId: string | null) => void;

  // === Compound Actions ===
  drillDownToPit: (pitId: string) => void;
  drillDownToTable: (tableId: string, pitId?: string) => void;
  resetNavigation: () => void;
}

export const useShiftDashboardStore = create<ShiftDashboardStore>()(
  devtools(
    (set) => ({
      // Initial state
      timeWindow: null,
      timeWindowPreset: "8h",
      lens: "casino",
      selectedPitId: null,
      selectedTableId: null,

      // Time window actions
      setTimeWindow: (window) =>
        set({ timeWindow: window }, undefined, "shift-dashboard/setTimeWindow"),

      setTimeWindowPreset: (preset) =>
        set({ timeWindowPreset: preset }, undefined, "shift-dashboard/setTimeWindowPreset"),

      // Navigation actions
      setLens: (lens) =>
        set({ lens }, undefined, "shift-dashboard/setLens"),

      setSelectedPitId: (pitId) =>
        set({ selectedPitId: pitId }, undefined, "shift-dashboard/setSelectedPitId"),

      setSelectedTableId: (tableId) =>
        set({ selectedTableId: tableId }, undefined, "shift-dashboard/setSelectedTableId"),

      // Compound actions for common workflows
      drillDownToPit: (pitId) =>
        set(
          { lens: "table", selectedPitId: pitId },
          undefined,
          "shift-dashboard/drillDownToPit"
        ),

      drillDownToTable: (tableId, pitId) =>
        set(
          { lens: "table", selectedTableId: tableId, selectedPitId: pitId ?? null },
          undefined,
          "shift-dashboard/drillDownToTable"
        ),

      resetNavigation: () =>
        set(
          { lens: "casino", selectedPitId: null, selectedTableId: null },
          undefined,
          "shift-dashboard/resetNavigation"
        ),
    }),
    { name: "shift-dashboard-store" },
  ),
);
```

### UI Hook

```typescript
// hooks/ui/use-shift-dashboard-ui.ts
"use client";

import { useShallow } from "zustand/react/shallow";
import { useShiftDashboardStore } from "@/store/shift-dashboard-store";

/**
 * Selector hook for shift dashboard UI state.
 * Uses useShallow to prevent unnecessary re-renders.
 */
export function useShiftDashboardUI() {
  return useShiftDashboardStore(
    useShallow((s) => ({
      // State
      timeWindow: s.timeWindow,
      timeWindowPreset: s.timeWindowPreset,
      lens: s.lens,
      selectedPitId: s.selectedPitId,
      selectedTableId: s.selectedTableId,

      // Actions
      setTimeWindow: s.setTimeWindow,
      setTimeWindowPreset: s.setTimeWindowPreset,
      setLens: s.setLens,
      setSelectedPitId: s.setSelectedPitId,
      setSelectedTableId: s.setSelectedTableId,
      drillDownToPit: s.drillDownToPit,
      drillDownToTable: s.drillDownToTable,
      resetNavigation: s.resetNavigation,
    })),
  );
}
```

---

## Integration Plan

### Files to Modify

| File | Changes |
|------|---------|
| `store/shift-dashboard-store.ts` | **CREATE** - New store |
| `store/index.ts` | Add export |
| `hooks/ui/use-shift-dashboard-ui.ts` | **CREATE** - Selector hook |
| `hooks/ui/index.ts` | Add export |
| `components/shift-dashboard/shift-dashboard-page.tsx` | Replace useState with store |
| `components/shift-dashboard/time-window-selector.tsx` | Consume store for preset |

### Migration Steps

1. **Create store** (`store/shift-dashboard-store.ts`)
2. **Create UI hook** (`hooks/ui/use-shift-dashboard-ui.ts`)
3. **Update barrel exports** (`store/index.ts`, `hooks/ui/index.ts`)
4. **Refactor ShiftDashboardPage**:
   - Replace `useState` calls with `useShiftDashboardUI()`
   - Initialize time window in `useEffect` via store action
   - Remove prop drilling for lens/selectedPitId
5. **Refactor TimeWindowSelector**:
   - Read `timeWindowPreset` from store
   - Call `setTimeWindowPreset` on change
6. **Type check**: `npm run type-check`
7. **Build**: `npm run build`

### Estimated Changes

- **Store**: ~80 lines (new file)
- **Hook**: ~35 lines (new file)
- **ShiftDashboardPage**: ~30 line modifications
- **TimeWindowSelector**: ~15 line modifications
- **Barrel exports**: ~4 lines total

---

## ADR-003 Compliance Checklist

| Requirement | Status |
|-------------|--------|
| Zustand for ephemeral UI state only | ✅ (no server data) |
| No server data in store | ✅ (metrics from React Query) |
| devtools middleware | ✅ (included) |
| useShallow in hooks | ✅ (planned) |
| Action naming convention | ✅ (`shift-dashboard/actionName`) |
| No derived state stored | ✅ (formattedWindow stays local) |

---

## Future Considerations

### URL State Promotion

Per ADR-003 §8: "When filters must be shareable/bookmarkable, move them into URL params."

If shift dashboard links need to be shareable (e.g., "show me pit A for last 12 hours"), consider:
- Moving `timeWindowPreset` + `selectedPitId` to URL search params
- Hydrating store from `useSearchParams()` on mount
- Syncing store changes back to URL

This is **not required** for MVP but noted for future enhancement.

### Auto-Refresh

Current implementation has manual refresh. Consider adding:
- `refreshInterval` state in store
- Polling via React Query `refetchInterval`
- Toggle UI in TimeWindowSelector

---

## Appendix: Component Prop Flow After Migration

```
ShiftDashboardPage
  ├── useShiftDashboardUI() ──┐
  │                           │
  ├── TimeWindowSelector      │
  │     └── useShiftDashboardUI() (reads preset, calls setTimeWindowPreset)
  │                           │
  ├── CasinoSummaryCard       │
  │     └── data from useShiftCasinoMetrics(window) ◄── from store
  │                           │
  ├── Tabs (lens from store)  │
  │     └── onValueChange → setLens()
  │                           │
  ├── PitMetricsTable         │
  │     └── onPitSelect → drillDownToPit()
  │                           │
  └── TableMetricsTable
        └── pitFilter from store.selectedPitId
```

---

**Status**: Audit complete. Zustand store design ready for implementation.

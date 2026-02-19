'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type { DataOnly } from './types';

export type ShiftLens = 'casino' | 'pit' | 'table';
export type TimeWindowPreset = '8h' | '12h' | '24h' | 'current' | 'custom';

export interface ShiftTimeWindow {
  start: string; // ISO timestamp
  end: string; // ISO timestamp
}

export interface ShiftDashboardStore {
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

  // ADR-035: Full session reset
  resetSession: () => void;
}

/** ADR-035 INV-035-1: Typed initial state for session reset. */
export const SHIFT_DASHBOARD_INITIAL_STATE = {
  timeWindow: null,
  timeWindowPreset: '8h' as const,
  lens: 'casino' as const,
  selectedPitId: null,
  selectedTableId: null,
} satisfies DataOnly<ShiftDashboardStore>;

export const useShiftDashboardStore = create<ShiftDashboardStore>()(
  devtools(
    (set) => ({
      // Initial state
      timeWindow: null,
      timeWindowPreset: '8h',
      lens: 'casino',
      selectedPitId: null,
      selectedTableId: null,

      // Time window actions
      setTimeWindow: (window) =>
        set({ timeWindow: window }, undefined, 'shift-dashboard/setTimeWindow'),

      setTimeWindowPreset: (preset) =>
        set(
          { timeWindowPreset: preset },
          undefined,
          'shift-dashboard/setTimeWindowPreset',
        ),

      // Navigation actions
      setLens: (lens) => set({ lens }, undefined, 'shift-dashboard/setLens'),

      setSelectedPitId: (pitId) =>
        set(
          { selectedPitId: pitId },
          undefined,
          'shift-dashboard/setSelectedPitId',
        ),

      setSelectedTableId: (tableId) =>
        set(
          { selectedTableId: tableId },
          undefined,
          'shift-dashboard/setSelectedTableId',
        ),

      // Compound actions for common workflows
      drillDownToPit: (pitId) =>
        set(
          { lens: 'table', selectedPitId: pitId },
          undefined,
          'shift-dashboard/drillDownToPit',
        ),

      drillDownToTable: (tableId, pitId) =>
        set(
          {
            lens: 'table',
            selectedTableId: tableId,
            selectedPitId: pitId ?? null,
          },
          undefined,
          'shift-dashboard/drillDownToTable',
        ),

      resetNavigation: () =>
        set(
          { lens: 'casino', selectedPitId: null, selectedTableId: null },
          undefined,
          'shift-dashboard/resetNavigation',
        ),

      // ADR-035: Full session reset (resets ALL fields including time window)
      resetSession: () =>
        set(
          { ...SHIFT_DASHBOARD_INITIAL_STATE },
          undefined,
          'shift-dashboard/resetSession',
        ),
    }),
    { name: 'shift-dashboard-store' },
  ),
);

'use client';

import { useShallow } from 'zustand/react/shallow';

import { useShiftDashboardStore } from '@/store/shift-dashboard-store';

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

"use client";

import { useShallow } from "zustand/react/shallow";

import { usePitDashboardStore } from "@/store/pit-dashboard-store";

/**
 * Selector hook for pit dashboard UI state.
 * Uses useShallow to prevent unnecessary re-renders.
 */
export function usePitDashboardUI() {
  return usePitDashboardStore(
    useShallow((s) => ({
      selectedTableId: s.selectedTableId,
      selectedSlipId: s.selectedSlipId,
      activePanel: s.activePanel,
      newSlipSeatNumber: s.newSlipSeatNumber,
      setSelectedTable: s.setSelectedTable,
      setSelectedSlip: s.setSelectedSlip,
      setActivePanel: s.setActivePanel,
      setNewSlipSeatNumber: s.setNewSlipSeatNumber,
      clearSelection: s.clearSelection,
    })),
  );
}

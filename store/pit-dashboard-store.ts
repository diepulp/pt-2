"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type PanelType = "tables" | "activity" | "inventory" | "analytics";

interface PitDashboardStore {
  selectedTableId: string | null;
  selectedSlipId: string | null;
  activePanel: PanelType;
  newSlipSeatNumber: string | undefined;
  setSelectedTable: (id: string | null) => void;
  setSelectedSlip: (id: string | null) => void;
  setActivePanel: (panel: PanelType) => void;
  setNewSlipSeatNumber: (seat: string | undefined) => void;
  clearSelection: () => void;
}

export const usePitDashboardStore = create<PitDashboardStore>()(
  devtools(
    (set) => ({
      selectedTableId: null,
      selectedSlipId: null,
      activePanel: "tables",
      newSlipSeatNumber: undefined,
      setSelectedTable: (id) =>
        set(
          { selectedTableId: id },
          undefined,
          "pit-dashboard/setSelectedTable",
        ),
      setSelectedSlip: (id) =>
        set({ selectedSlipId: id }, undefined, "pit-dashboard/setSelectedSlip"),
      setActivePanel: (panel) =>
        set({ activePanel: panel }, undefined, "pit-dashboard/setActivePanel"),
      setNewSlipSeatNumber: (seat) =>
        set(
          { newSlipSeatNumber: seat },
          undefined,
          "pit-dashboard/setNewSlipSeatNumber",
        ),
      clearSelection: () =>
        set(
          {
            selectedTableId: null,
            selectedSlipId: null,
            newSlipSeatNumber: undefined,
          },
          undefined,
          "pit-dashboard/clearSelection",
        ),
    }),
    { name: "pit-dashboard-store" },
  ),
);

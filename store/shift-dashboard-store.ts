"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type ShiftLens = "casino" | "pit" | "table";
export type TimeWindowPreset = "8h" | "12h" | "24h" | "current" | "custom";

export interface ShiftTimeWindow {
  start: string; // ISO timestamp
  end: string; // ISO timestamp
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
        set(
          { timeWindowPreset: preset },
          undefined,
          "shift-dashboard/setTimeWindowPreset",
        ),

      // Navigation actions
      setLens: (lens) => set({ lens }, undefined, "shift-dashboard/setLens"),

      setSelectedPitId: (pitId) =>
        set(
          { selectedPitId: pitId },
          undefined,
          "shift-dashboard/setSelectedPitId",
        ),

      setSelectedTableId: (tableId) =>
        set(
          { selectedTableId: tableId },
          undefined,
          "shift-dashboard/setSelectedTableId",
        ),

      // Compound actions for common workflows
      drillDownToPit: (pitId) =>
        set(
          { lens: "table", selectedPitId: pitId },
          undefined,
          "shift-dashboard/drillDownToPit",
        ),

      drillDownToTable: (tableId, pitId) =>
        set(
          {
            lens: "table",
            selectedTableId: tableId,
            selectedPitId: pitId ?? null,
          },
          undefined,
          "shift-dashboard/drillDownToTable",
        ),

      resetNavigation: () =>
        set(
          { lens: "casino", selectedPitId: null, selectedTableId: null },
          undefined,
          "shift-dashboard/resetNavigation",
        ),
    }),
    { name: "shift-dashboard-store" },
  ),
);

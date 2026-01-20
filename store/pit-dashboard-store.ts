'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type PanelType =
  | 'tables'
  | 'activity'
  | 'inventory'
  | 'analytics'
  | 'closed-sessions';

/**
 * Activity panel sort modes for casino-wide player lookup.
 * @see GAP-ACTIVITY-PANEL-CASINO-WIDE
 */
export type ActivitySortMode = 'recent' | 'alpha-asc' | 'alpha-desc';

interface PitDashboardStore {
  selectedTableId: string | null;
  selectedSlipId: string | null;
  selectedPitLabel: string | null;
  activePanel: PanelType;
  newSlipSeatNumber: string | undefined;

  // Activity panel state (GAP-ACTIVITY-PANEL-CASINO-WIDE)
  activitySearchQuery: string;
  activitySortMode: ActivitySortMode;

  setSelectedTable: (id: string | null) => void;
  setSelectedSlip: (id: string | null) => void;
  setSelectedPitLabel: (label: string | null) => void;
  setActivePanel: (panel: PanelType) => void;
  setNewSlipSeatNumber: (seat: string | undefined) => void;
  clearSelection: () => void;

  // Activity panel actions (GAP-ACTIVITY-PANEL-CASINO-WIDE)
  setActivitySearchQuery: (query: string) => void;
  setActivitySortMode: (mode: ActivitySortMode) => void;
}

export const usePitDashboardStore = create<PitDashboardStore>()(
  devtools(
    (set) => ({
      selectedTableId: null,
      selectedSlipId: null,
      selectedPitLabel: null,
      activePanel: 'tables',
      newSlipSeatNumber: undefined,

      // Activity panel state (GAP-ACTIVITY-PANEL-CASINO-WIDE)
      activitySearchQuery: '',
      activitySortMode: 'recent',

      setSelectedTable: (id) =>
        set(
          { selectedTableId: id },
          undefined,
          'pit-dashboard/setSelectedTable',
        ),
      setSelectedSlip: (id) =>
        set({ selectedSlipId: id }, undefined, 'pit-dashboard/setSelectedSlip'),
      setSelectedPitLabel: (label) =>
        set(
          { selectedPitLabel: label },
          undefined,
          'pit-dashboard/setSelectedPitLabel',
        ),
      setActivePanel: (panel) =>
        set({ activePanel: panel }, undefined, 'pit-dashboard/setActivePanel'),
      setNewSlipSeatNumber: (seat) =>
        set(
          { newSlipSeatNumber: seat },
          undefined,
          'pit-dashboard/setNewSlipSeatNumber',
        ),
      clearSelection: () =>
        set(
          {
            selectedTableId: null,
            selectedSlipId: null,
            selectedPitLabel: null,
            newSlipSeatNumber: undefined,
          },
          undefined,
          'pit-dashboard/clearSelection',
        ),

      // Activity panel actions (GAP-ACTIVITY-PANEL-CASINO-WIDE)
      setActivitySearchQuery: (query) =>
        set(
          { activitySearchQuery: query },
          undefined,
          'pit-dashboard/setActivitySearchQuery',
        ),
      setActivitySortMode: (mode) =>
        set(
          { activitySortMode: mode },
          undefined,
          'pit-dashboard/setActivitySortMode',
        ),
    }),
    { name: 'pit-dashboard-store' },
  ),
);

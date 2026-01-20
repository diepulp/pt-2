'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface PlayerDashboardStore {
  selectedPlayerId: string | null;
  setSelectedPlayer: (id: string | null) => void;
  clearSelection: () => void;
}

export const usePlayerDashboardStore = create<PlayerDashboardStore>()(
  devtools(
    (set) => ({
      selectedPlayerId: null,
      setSelectedPlayer: (id) =>
        set(
          { selectedPlayerId: id },
          undefined,
          'playerDashboard/setSelectedPlayer',
        ),
      clearSelection: () =>
        set(
          { selectedPlayerId: null },
          undefined,
          'playerDashboard/clearSelection',
        ),
    }),
    { name: 'PlayerDashboardStore' },
  ),
);

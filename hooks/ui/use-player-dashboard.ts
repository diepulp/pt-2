'use client';

import { useShallow } from 'zustand/react/shallow';

import {
  usePlayerDashboardStore,
  PlayerDashboardStore,
} from '@/store/player-dashboard-store';

/**
 * Selector hook for PlayerDashboardStore using useShallow
 * Prevents unnecessary re-renders when only accessing selectedPlayerId
 *
 * @returns PlayerDashboardStore actions and state
 *
 * @example
 * // Select a player
 * const { setSelectedPlayer } = usePlayerDashboard();
 * setSelectedPlayer('player-123');
 *
 * @example
 * // Read selected player
 * const { selectedPlayerId } = usePlayerDashboard();
 * if (selectedPlayerId) { ... }
 */
export function usePlayerDashboard(): PlayerDashboardStore {
  return usePlayerDashboardStore(
    useShallow((state) => ({
      selectedPlayerId: state.selectedPlayerId,
      setSelectedPlayer: state.setSelectedPlayer,
      clearSelection: state.clearSelection,
    })),
  );
}

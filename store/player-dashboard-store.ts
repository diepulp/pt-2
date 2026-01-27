/**
 * Player Dashboard Store
 *
 * IMPORTANT: selectedPlayerId is for ROW HIGHLIGHT only in the lookup surface.
 * Detail panel rendering is handled by route-based navigation to Player 360.
 * Selecting a player in the dashboard navigates to /players/[playerId].
 *
 * @see PRD-022 Player 360 Navigation Consolidation
 * @see WS5 Zustand Store Modification
 */

"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface PlayerDashboardStore {
  /**
   * Selected player ID for row highlight in list view only.
   * Does NOT drive detail panel rendering - that's handled by Player 360 route.
   */
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
          "playerDashboard/setSelectedPlayer",
        ),
      clearSelection: () =>
        set(
          { selectedPlayerId: null },
          undefined,
          "playerDashboard/clearSelection",
        ),
    }),
    { name: "PlayerDashboardStore" },
  ),
);

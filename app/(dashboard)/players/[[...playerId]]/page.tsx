/**
 * Player 360 Catch-All Route (WS1 - PRD-022-PATCH-OPTION-B)
 *
 * Single entry point for Player 360 view.
 * Handles both /players (no selection) and /players/[playerId] (detail view).
 *
 * Search is embedded in:
 * - Empty state when no player selected
 * - Header when player is selected
 *
 * Route: /players/[[...playerId]]
 *
 * @see PRD-022-PATCH-OPTION-B-PLAYER-360-EMBEDDED-SEARCH.md
 */

import { Suspense } from "react";

import {
  DashboardSkeleton,
  Player360LayoutProvider,
} from "@/components/player-360";

import { Player360ContentWrapper } from "./_components/player-360-content-wrapper";
import { Player360EmptyStateWrapper } from "./_components/player-360-empty-state-wrapper";
import { Player360Shell } from "./_components/player-360-shell";

interface PageProps {
  params: Promise<{ playerId?: string[] }>;
}

export default async function Player360Page({ params }: PageProps) {
  const { playerId: playerIdSegments } = await params;
  // Catch-all returns array - first segment is the playerId
  const playerId = playerIdSegments?.[0] ?? null;

  return (
    <Player360LayoutProvider playerId={playerId}>
      <Player360Shell playerId={playerId}>
        {playerId ? (
          <Suspense fallback={<DashboardSkeleton />}>
            <Player360ContentWrapper playerId={playerId} />
          </Suspense>
        ) : (
          <Player360EmptyStateWrapper />
        )}
      </Player360Shell>
    </Player360LayoutProvider>
  );
}

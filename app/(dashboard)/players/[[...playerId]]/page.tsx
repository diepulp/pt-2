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

import { AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import {
  DashboardSkeleton,
  Player360LayoutProvider,
} from '@/components/player-360';
import { getServerGamingDay } from '@/lib/gaming-day/server';
import { createClient } from '@/lib/supabase/server';
import { isValidUUID } from '@/lib/validation/uuid';

import { Player360ContentWrapper } from './_components/player-360-content-wrapper';
import { Player360EmptyStateWrapper } from './_components/player-360-empty-state-wrapper';
import { Player360Shell } from './_components/player-360-shell';

interface PageProps {
  params: Promise<{ playerId?: string[] }>;
}

export default async function Player360Page({ params }: PageProps) {
  const { playerId: playerIdSegments } = await params;
  // Catch-all returns array - first segment is the playerId
  const playerId = playerIdSegments?.[0] ?? null;

  // Compute gaming day server-side via DB RPC (PRD-027: eliminates JS temporal bypass)
  const supabase = await createClient();
  const gamingDay = await getServerGamingDay(supabase);

  // Validate UUID format — reject malformed URLs before enabling queries (P1-5)
  if (playerId && !isValidUUID(playerId)) {
    return (
      <Player360LayoutProvider playerId={null}>
        <Player360Shell playerId={null}>
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-6">
              <AlertCircle className="h-8 w-8 text-red-400/70" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Invalid Player ID
            </h2>
            <p className="text-sm text-muted-foreground max-w-md text-center mb-6">
              The player ID in the URL is not a valid format. Please check the
              link and try again.
            </p>
            <Link
              href="/players"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to players
            </Link>
          </div>
        </Player360Shell>
      </Player360LayoutProvider>
    );
  }

  return (
    <Player360LayoutProvider playerId={playerId}>
      <Player360Shell playerId={playerId}>
        {playerId ? (
          <Suspense fallback={<DashboardSkeleton />}>
            <Player360ContentWrapper
              playerId={playerId}
              gamingDay={gamingDay}
            />
          </Suspense>
        ) : (
          <Player360EmptyStateWrapper />
        )}
      </Player360Shell>
    </Player360LayoutProvider>
  );
}

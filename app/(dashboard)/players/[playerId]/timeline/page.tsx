/**
 * Player 360 Timeline Page (WS3-C)
 *
 * Baseline page rendering the Player 360 interaction timeline
 * with the 3-panel layout per UX baseline.
 *
 * Route: /players/[playerId]/timeline
 *
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see player-360-crm-dashboard-ux-ui-baselines.md
 * @see EXEC-SPEC-029.md WS3-C
 */

import { Suspense } from "react";

import {
  DashboardSkeleton,
  Player360Layout,
  Player360LayoutProvider,
} from "@/components/player-360";

import { TimelinePageContent } from "./_components/timeline-content";

interface TimelinePageProps {
  params: Promise<{ playerId: string }>;
}

export default async function TimelinePage({ params }: TimelinePageProps) {
  const { playerId } = await params;

  return (
    <Player360LayoutProvider playerId={playerId}>
      <Player360Layout className="h-[calc(100vh-4rem-3rem)]">
        <Suspense fallback={<DashboardSkeleton />}>
          <TimelinePageContent playerId={playerId} />
        </Suspense>
      </Player360Layout>
    </Player360LayoutProvider>
  );
}

/**
 * Player 360 Content Wrapper (WS1 - PRD-022-PATCH-OPTION-B)
 *
 * Client component that wraps the timeline content.
 * Handles anchor scroll behavior and navigation coordination.
 *
 * @see PRD-022-PATCH-OPTION-B-PLAYER-360-EMBEDDED-SEARCH.md
 */

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useCallback } from 'react';

import {
  Player360Body,
  Player360Header,
  Player360HeaderContent,
  useRecentPlayers,
} from '@/components/player-360';
import { usePlayer } from '@/hooks/player/use-player';

// Import the timeline content from the existing location
import { TimelinePageContent } from '../../[playerId]/timeline/_components/timeline-content';

interface Player360ContentWrapperProps {
  playerId: string;
}

/**
 * Wraps the Player 360 content with header and anchor scroll handling.
 */
export function Player360ContentWrapper({
  playerId,
}: Player360ContentWrapperProps) {
  const router = useRouter();
  const { data: player } = usePlayer(playerId);
  const { addRecent } = useRecentPlayers();

  // Add to recent players when viewing
  useEffect(() => {
    if (player) {
      const fullName = `${player.first_name} ${player.last_name}`.trim();
      addRecent(playerId, fullName);
    }
  }, [player, playerId, addRecent]);

  // Anchor scroll on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#timeline') {
      requestAnimationFrame(() => {
        const el = document.getElementById('timeline');
        el?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, []);

  // Handle player selection from header search
  const handleSelectPlayer = useCallback(
    (selectedPlayerId: string) => {
      router.replace(`/players/${selectedPlayerId}`, { scroll: false });
    },
    [router],
  );

  return (
    <div data-testid="player-360-page" className="flex flex-col h-full">
      {/* Header with identity, search, and edit button */}
      <Player360Header>
        <Player360HeaderContent
          playerId={playerId}
          onSelectPlayer={handleSelectPlayer}
        />
      </Player360Header>

      {/* Body with timeline */}
      <Player360Body>
        <TimelinePageContent playerId={playerId} />
      </Player360Body>
    </div>
  );
}

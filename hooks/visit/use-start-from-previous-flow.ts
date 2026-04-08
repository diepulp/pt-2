/**
 * Start From Previous Flow Hook
 *
 * Multi-step orchestration for the "Start From Previous" continuation flow:
 * 1. Closed slip click → resolve player context from slip
 * 2. Fetch recent visits for the player
 * 3. Open StartFromPreviousModal with eligible visits
 * 4. Operator selects visit → store pending continuation context
 * 5. Toast: "Select an empty seat to place [Player Name]"
 * 6. Empty seat click → call start-from-previous API
 * 7. New visit + slip created → open fresh slip modal
 *
 * Pending continuation context stored in React state (transient UI state).
 * Context cleared on: successful placement, dismiss, or navigation-away.
 *
 * @see PRD-063 Visit Lifecycle Operator Workflow
 * @see EXEC-063 WS3
 */

'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type {
  PlayerInfo,
  SessionData,
} from '@/components/player-sessions/start-from-previous';
import { fetchJSON } from '@/lib/http/fetch-json';
import { IDEMPOTENCY_HEADER } from '@/lib/http/headers';
import type { ClosedSlipForGamingDayDTO } from '@/services/rating-slip/dtos';
import type {
  RecentSessionDTO,
  StartFromPreviousResponse,
} from '@/services/visit/dtos';

/** Pending continuation context — persists between modal close and seat click */
export interface PendingContinuation {
  playerId: string;
  playerName: string;
  sourceVisitId: string;
}

/** Maps a RecentSessionDTO to the StartFromPreviousPanel's SessionData shape */
function toSessionData(session: RecentSessionDTO): SessionData {
  return {
    visit_id: session.visit_id,
    visit_group_id: session.visit_group_id,
    started_at: session.started_at,
    ended_at: session.ended_at ?? '',
    last_table_id: session.last_table_id ?? '',
    last_table_name: session.last_table_name ?? '',
    last_seat_number: session.last_seat_number ?? 0,
    total_duration_seconds: session.total_duration_seconds,
    total_buy_in: session.total_buy_in,
    total_cash_out: session.total_cash_out,
    net: session.net,
    points_earned: session.points_earned,
    segment_count: session.segment_count,
  };
}

export function useStartFromPreviousFlow(casinoId: string) {
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]);

  // Pending continuation — persists after modal close until seat click or clear
  const [pendingContinuation, setPendingContinuation] =
    useState<PendingContinuation | null>(null);

  /**
   * Step 1: Closed slip click → resolve player, fetch recent visits, open modal.
   * RULE-3: Slip is entry point only — player context resolves from slip.
   */
  const handleClosedSlipClick = useCallback(
    async (slip: ClosedSlipForGamingDayDTO) => {
      if (!slip.player) {
        toast.error('Cannot continue — unrated slip has no player');
        return;
      }

      const playerInfo: PlayerInfo = {
        player_id: slip.player.id,
        name: `${slip.player.first_name} ${slip.player.last_name}`,
        tier: slip.player.tier ?? undefined,
      };

      setPlayer(playerInfo);
      setIsModalOpen(true);
      setIsLoading(true);

      try {
        const data = await fetchJSON<{
          sessions: RecentSessionDTO[];
          next_cursor: string | null;
          open_visit: RecentSessionDTO | null;
        }>(`/api/v1/players/${slip.player.id}/recent-sessions`);

        // Filter for eligible visits: ended_at set, has segments (DEC-003)
        const eligible = data.sessions
          .filter((s) => s.ended_at && s.segment_count > 0)
          .map(toSessionData);

        setSessions(eligible);
      } catch {
        toast.error('Failed to load recent sessions');
        setSessions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /**
   * Step 4: Operator selects a visit → store pending continuation, close modal.
   */
  const handleSelectVisit = useCallback(
    (sourceVisitId: string) => {
      if (!player) return;

      setPendingContinuation({
        playerId: player.player_id,
        playerName: player.name,
        sourceVisitId,
      });

      setIsModalOpen(false);

      toast.info(`Select an empty seat to place ${player.name}`, {
        duration: 10000,
      });
    },
    [player],
  );

  /**
   * Step 6: Empty seat click with pending continuation → call start-from-previous.
   * Returns the new slip ID on success (caller opens the slip modal).
   */
  const completeContinuation = useCallback(
    async (
      tableId: string,
      seatNumber: number,
    ): Promise<StartFromPreviousResponse | null> => {
      if (!pendingContinuation) return null;

      try {
        const response = await fetchJSON<StartFromPreviousResponse>(
          '/api/v1/visits/start-from-previous',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              [IDEMPOTENCY_HEADER]: crypto.randomUUID(),
            },
            body: JSON.stringify({
              player_id: pendingContinuation.playerId,
              source_visit_id: pendingContinuation.sourceVisitId,
              destination_table_id: tableId,
              destination_seat_number: seatNumber,
            }),
          },
        );

        toast.success(
          `${pendingContinuation.playerName} placed — new visit started`,
        );
        setPendingContinuation(null);
        return response;
      } catch (err) {
        toast.error('Failed to start from previous', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
        return null;
      }
    },
    [pendingContinuation],
  );

  /** Clear pending continuation (dismiss, navigation, etc.) */
  const clearPending = useCallback(() => {
    setPendingContinuation(null);
  }, []);

  /** Close the modal without selecting a visit */
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  return {
    // Modal state
    isModalOpen,
    isLoading,
    player,
    sessions,
    closeModal,

    // Flow actions
    handleClosedSlipClick,
    handleSelectVisit,

    // Pending continuation
    pendingContinuation,
    completeContinuation,
    clearPending,
  };
}

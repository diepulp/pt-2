/**
 * Player Identity Hooks
 *
 * Hooks for fetching and upserting player identity data.
 * Invalidates player detail cache on success.
 *
 * @see services/player/http.ts - identity HTTP fetchers
 * @see PRD-003 Player & Visit Management
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  PlayerIdentityDTO,
  PlayerIdentityInput,
} from '@/services/player/dtos';
import { getIdentity, upsertIdentity } from '@/services/player/http';
import { playerKeys } from '@/services/player/keys';

/**
 * Fetches player identity information.
 * Returns null if identity not found.
 */
export function usePlayerIdentity(playerId: string) {
  return useQuery({
    queryKey: [...playerKeys.detail(playerId), 'identity'] as const,
    queryFn: () => getIdentity(playerId),
    enabled: !!playerId,
    staleTime: 60_000,
  });
}

/**
 * Updates or creates player identity information.
 * Invalidates both player detail and identity queries on success.
 */
export function useUpdatePlayerIdentity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      playerId,
      input,
    }: {
      playerId: string;
      input: PlayerIdentityInput;
    }) => upsertIdentity(playerId, input),
    onSuccess: (data: PlayerIdentityDTO) => {
      // Invalidate player detail to refresh any identity-related data
      queryClient.invalidateQueries({
        queryKey: playerKeys.detail(data.player_id),
      });
      // Invalidate list in case display name or other derived fields changed
      queryClient.invalidateQueries({ queryKey: playerKeys.list.scope });
    },
  });
}

// Re-export types for convenience
export type { PlayerIdentityDTO, PlayerIdentityInput };

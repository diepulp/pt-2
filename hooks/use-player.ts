import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query';

import {
  enrollPlayer,
  getPlayer,
  getPlayersByCasino,
  isPlayerEnrolled,
  updatePlayer,
  deletePlayer,
  searchPlayers,
  type PlayerDTO,
  type EnrollPlayerDTO,
  type PlayerUpdateDTO,
} from '@/app/actions/player';
import { playerKeys } from '@/services/player/keys';

export function usePlayer(playerId: string) {
  return useQuery({
    queryKey: playerKeys.detail(playerId),
    queryFn: () => getPlayer(playerId),
    enabled: !!playerId,
  });
}

export function usePlayerList(casinoId: string, options?: { limit?: number }) {
  return useInfiniteQuery({
    queryKey: playerKeys.list({ casinoId, limit: options?.limit }),
    queryFn: ({ pageParam }) =>
      getPlayersByCasino(casinoId, {
        limit: options?.limit,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!casinoId,
  });
}

export function usePlayerEnrollment(casinoId: string, playerId: string) {
  return useQuery({
    queryKey: [...playerKeys.detail(playerId), 'enrolled', casinoId],
    queryFn: () => isPlayerEnrolled(casinoId, playerId),
    enabled: !!casinoId && !!playerId,
  });
}

export function useEnrollPlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: enrollPlayer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playerKeys.list.scope });
    },
  });
}

export function useUpdatePlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PlayerUpdateDTO }) =>
      updatePlayer(id, data),
    onSuccess: (updatedPlayer) => {
      // Invalidate the specific player detail query
      queryClient.invalidateQueries({
        queryKey: playerKeys.detail(updatedPlayer.id),
      });
      // Invalidate all player lists
      queryClient.invalidateQueries({ queryKey: playerKeys.list.scope });
    },
  });
}

export function useDeletePlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePlayer,
    onSuccess: () => {
      // Invalidate all player lists
      queryClient.invalidateQueries({ queryKey: playerKeys.list.scope });
      // Invalidate all player details
      queryClient.invalidateQueries({ queryKey: playerKeys.root });
    },
  });
}

export function useSearchPlayers(query: string, casinoId?: string) {
  return useQuery({
    queryKey: playerKeys.search(query),
    queryFn: () => searchPlayers(query, casinoId),
    enabled: query.length > 0,
  });
}

export type { PlayerDTO, EnrollPlayerDTO, PlayerUpdateDTO };

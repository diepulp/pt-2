import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { playerKeys } from '@/services/player/keys';
import { enrollPlayer, getPlayer, getPlayersByCasino, isPlayerEnrolled, type PlayerDTO, type EnrollPlayerDTO } from '@/app/actions/player';

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
    queryFn: ({ pageParam }) => getPlayersByCasino(casinoId, { limit: options?.limit, cursor: pageParam }),
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

export type { PlayerDTO, EnrollPlayerDTO };

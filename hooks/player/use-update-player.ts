/**
 * Mutation hook for updating an existing player
 * Following PT-2 canonical architecture with React Query integration
 *
 * @pattern Cache Invalidation: Strategy 2 - Granular invalidation
 * @invalidates Specific player detail + all player lists
 * @see hooks/shared/use-service-mutation.ts for base template
 * @see docs/adr/ADR-003-state-management-strategy.md for invalidation strategies
 */

import { useQueryClient } from "@tanstack/react-query";

import { updatePlayer } from "@/app/actions/player-actions";
import { useServiceMutation } from "@/hooks/shared/use-service-mutation";
import type { PlayerUpdateDTO, PlayerDTO } from "@/services/player";

/**
 * Updates an existing player and invalidates relevant queries
 *
 * Uses granular invalidation strategy (Strategy 2 from ADR-003):
 * - Invalidates specific player detail (to show updated data)
 * - Invalidates all player lists (to show updated data in lists)
 * - Does NOT invalidate unrelated player details (preserves cache)
 *
 * @param playerId - UUID of player to update
 * @returns React Query mutation result
 *
 * @example
 * ```typescript
 * function EditPlayerForm({ playerId }: { playerId: string }) {
 *   const updatePlayerMutation = useUpdatePlayer(playerId);
 *
 *   const handleSubmit = (data: PlayerUpdateDTO) => {
 *     updatePlayerMutation.mutate(data, {
 *       onSuccess: (player) => {
 *         toast.success(`Player ${player.firstName} updated!`);
 *       },
 *       onError: (error) => {
 *         toast.error(error.message);
 *       }
 *     });
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input name="firstName" />
 *       <input name="lastName" />
 *       <button disabled={updatePlayerMutation.isPending}>
 *         {updatePlayerMutation.isPending ? 'Updating...' : 'Update Player'}
 *       </button>
 *     </form>
 *   );
 * }
 * ```
 */
export function useUpdatePlayer(playerId: string) {
  const queryClient = useQueryClient();

  return useServiceMutation<PlayerDTO, PlayerUpdateDTO>(
    (data) => updatePlayer(playerId, data),
    {
      onSuccess: () => {
        // Strategy 2: Granular invalidation (ADR-003)
        // Invalidate specific player detail
        queryClient.invalidateQueries({
          queryKey: ["player", "detail", playerId],
        });
        // Also invalidate lists to show updated data
        queryClient.invalidateQueries({
          queryKey: ["player", "list"],
        });
      },
    },
  );
}

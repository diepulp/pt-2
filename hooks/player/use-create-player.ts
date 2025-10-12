/**
 * Mutation hook for creating a new player
 * Following PT-2 canonical architecture with React Query integration
 *
 * @pattern Cache Invalidation: Strategy 1 - Domain-level invalidation
 * @invalidates All player queries (['player'])
 * @see hooks/shared/use-service-mutation.ts for base template
 * @see docs/adr/ADR-003-state-management-strategy.md for invalidation strategies
 */

import { useQueryClient } from "@tanstack/react-query";

import { createPlayer } from "@/app/actions/player-actions";
import { useServiceMutation } from "@/hooks/shared/use-service-mutation";
import type { PlayerCreateDTO, PlayerDTO } from "@/services/player";

/**
 * Creates a new player and invalidates all player queries
 *
 * Uses domain-level invalidation strategy (Strategy 1 from ADR-003):
 * - Invalidates all player lists (so new player appears)
 * - Invalidates all player details (in case of cache pollution)
 * - Invalidates all player searches (for consistency)
 *
 * @returns React Query mutation result
 *
 * @example
 * ```typescript
 * function CreatePlayerForm() {
 *   const createPlayerMutation = useCreatePlayer();
 *
 *   const handleSubmit = (data: PlayerCreateDTO) => {
 *     createPlayerMutation.mutate(data, {
 *       onSuccess: (player) => {
 *         toast.success(`Player ${player.firstName} created!`);
 *       },
 *       onError: (error) => {
 *         toast.error(error.message);
 *       }
 *     });
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input name="email" required />
 *       <input name="firstName" required />
 *       <input name="lastName" required />
 *       <button disabled={createPlayerMutation.isPending}>
 *         {createPlayerMutation.isPending ? 'Creating...' : 'Create Player'}
 *       </button>
 *     </form>
 *   );
 * }
 * ```
 */
export function useCreatePlayer() {
  const queryClient = useQueryClient();

  return useServiceMutation<PlayerDTO, PlayerCreateDTO>(
    (data) => createPlayer(data),
    {
      onSuccess: () => {
        // Strategy 1: Domain-level invalidation (ADR-003)
        // Invalidates all queries starting with ['player']
        queryClient.invalidateQueries({ queryKey: ["player"] });
      },
    },
  );
}

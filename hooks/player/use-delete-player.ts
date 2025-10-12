/**
 * Mutation hook for deleting a player
 * Following PT-2 canonical architecture with React Query integration
 *
 * @pattern Cache Invalidation: Strategy 3 - Query removal
 * @removes Specific player detail from cache
 * @invalidates All player lists
 * @see hooks/shared/use-service-mutation.ts for base template
 * @see docs/adr/ADR-003-state-management-strategy.md for invalidation strategies
 */

import { useQueryClient } from "@tanstack/react-query";

import { deletePlayer } from "@/app/actions/player-actions";
import { useServiceMutation } from "@/hooks/shared/use-service-mutation";

/**
 * Deletes a player and removes it from cache
 *
 * Uses query removal strategy (Strategy 3 from ADR-003):
 * - Removes specific player detail from cache (no longer exists)
 * - Invalidates all player lists (to reflect deletion)
 * - Does NOT invalidate unrelated player details (preserves cache)
 *
 * Error handling:
 * - FOREIGN_KEY_VIOLATION: Player has related records (cannot delete)
 * - NOT_FOUND: Player doesn't exist
 *
 * @param playerId - UUID of player to delete
 * @returns React Query mutation result
 *
 * @example
 * ```typescript
 * function DeletePlayerButton({ playerId }: { playerId: string }) {
 *   const deletePlayerMutation = useDeletePlayer(playerId);
 *
 *   const handleDelete = () => {
 *     if (confirm('Are you sure you want to delete this player?')) {
 *       deletePlayerMutation.mutate(undefined, {
 *         onSuccess: () => {
 *           toast.success('Player deleted successfully');
 *         },
 *         onError: (error) => {
 *           // Handle FK violation specially
 *           if (error.message.includes('related records')) {
 *             toast.error('Cannot delete player with related records');
 *           } else {
 *             toast.error(error.message);
 *           }
 *         }
 *       });
 *     }
 *   };
 *
 *   return (
 *     <button
 *       onClick={handleDelete}
 *       disabled={deletePlayerMutation.isPending}
 *     >
 *       {deletePlayerMutation.isPending ? 'Deleting...' : 'Delete Player'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useDeletePlayer(playerId: string) {
  const queryClient = useQueryClient();

  return useServiceMutation<void, void>(() => deletePlayer(playerId), {
    onSuccess: () => {
      // Strategy 3: Query removal (ADR-003)
      // Remove the specific player from cache
      queryClient.removeQueries({
        queryKey: ["player", "detail", playerId],
      });
      // Invalidate lists to reflect deletion
      queryClient.invalidateQueries({
        queryKey: ["player", "list"],
      });
    },
  });
}

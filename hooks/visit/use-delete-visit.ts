/**
 * Mutation hook for deleting a visit
 * Following PT-2 canonical architecture with React Query integration
 *
 * @pattern Cache Invalidation: Strategy 3 - Query removal
 * @invalidates Removes specific visit query, invalidates lists
 * @see hooks/shared/use-service-mutation.ts for base template
 * @see docs/adr/ADR-003-state-management-strategy.md for invalidation strategies
 */

import { useQueryClient } from "@tanstack/react-query";

import { deleteVisit } from "@/app/actions/visit-actions";
import { useServiceMutation } from "@/hooks/shared/use-service-mutation";

/**
 * Deletes a visit and removes it from cache
 *
 * Uses query removal strategy (Strategy 3 from ADR-003):
 * - Removes the specific visit detail query from cache
 * - Invalidates visit list queries (so deleted visit disappears)
 * - Prevents 404 errors when navigating to deleted visit
 *
 * @returns React Query mutation result
 *
 * @example
 * ```typescript
 * function DeleteVisitButton({ visitId }: { visitId: string }) {
 *   const deleteVisitMutation = useDeleteVisit();
 *   const router = useRouter();
 *
 *   const handleDelete = () => {
 *     if (!confirm('Are you sure you want to delete this visit?')) {
 *       return;
 *     }
 *
 *     deleteVisitMutation.mutate(visitId, {
 *       onSuccess: () => {
 *         toast.success('Visit deleted successfully');
 *         router.push('/visits');
 *       },
 *       onError: (error) => {
 *         if (error.message.includes('related records')) {
 *           toast.error('Cannot delete visit with related records');
 *         } else {
 *           toast.error(error.message);
 *         }
 *       }
 *     });
 *   };
 *
 *   return (
 *     <button
 *       onClick={handleDelete}
 *       disabled={deleteVisitMutation.isPending}
 *       className="btn-danger"
 *     >
 *       {deleteVisitMutation.isPending ? 'Deleting...' : 'Delete Visit'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useDeleteVisit() {
  const queryClient = useQueryClient();

  return useServiceMutation<void, string>((visitId) => deleteVisit(visitId), {
    onSuccess: (_, visitId) => {
      // Strategy 3: Query removal (ADR-003)
      // Remove the specific visit detail query from cache
      // This prevents 404 errors if user navigates back to deleted visit
      queryClient.removeQueries({
        queryKey: ["visit", "detail", visitId],
      });

      // Invalidate all visit lists to remove deleted visit
      // This includes:
      // - All visits list
      // - Visits by player
      // - Visits by casino
      // - Active visits
      // - Filtered visits
      queryClient.invalidateQueries({
        queryKey: ["visit", "list"],
      });

      // Invalidate active visits queries
      queryClient.invalidateQueries({
        queryKey: ["visit", "active"],
      });

      // Invalidate search results (if any)
      queryClient.invalidateQueries({
        queryKey: ["visit", "search"],
      });
    },
  });
}

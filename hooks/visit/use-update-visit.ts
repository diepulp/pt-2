/**
 * Mutation hook for updating an existing visit
 * Following PT-2 canonical architecture with React Query integration
 *
 * @pattern Cache Invalidation: Strategy 2 - Granular invalidation
 * @invalidates Specific visit detail and related list queries
 * @see hooks/shared/use-service-mutation.ts for base template
 * @see docs/adr/ADR-003-state-management-strategy.md for invalidation strategies
 */

import { useQueryClient } from "@tanstack/react-query";

import { updateVisit } from "@/app/actions/visit-actions";
import { useServiceMutation } from "@/hooks/shared/use-service-mutation";
import type { VisitUpdateDTO, VisitDTO } from "@/services/visit";

/**
 * Update Visit Mutation Variables
 * Combines visit ID with update data for type-safe mutations
 */
export interface UpdateVisitVariables {
  id: string;
  data: VisitUpdateDTO;
}

/**
 * Updates an existing visit with granular cache invalidation
 *
 * Uses granular invalidation strategy (Strategy 2 from ADR-003):
 * - Invalidates specific visit detail query
 * - Invalidates visit list queries (where updated visit may appear)
 * - More efficient than domain-level invalidation for updates
 *
 * @returns React Query mutation result
 *
 * @example
 * ```typescript
 * function VisitDetailsPage({ visitId }: { visitId: string }) {
 *   const updateVisitMutation = useUpdateVisit();
 *
 *   const handleCheckOut = () => {
 *     updateVisitMutation.mutate(
 *       {
 *         id: visitId,
 *         data: {
 *           checkOutDate: new Date().toISOString(),
 *           status: 'COMPLETED'
 *         }
 *       },
 *       {
 *         onSuccess: (visit) => {
 *           toast.success('Visit checked out successfully');
 *         },
 *         onError: (error) => {
 *           toast.error(error.message);
 *         }
 *       }
 *     );
 *   };
 *
 *   return (
 *     <div>
 *       <h1>Visit Details</h1>
 *       <button
 *         onClick={handleCheckOut}
 *         disabled={updateVisitMutation.isPending}
 *       >
 *         {updateVisitMutation.isPending ? 'Checking out...' : 'Check Out'}
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useUpdateVisit() {
  const queryClient = useQueryClient();

  return useServiceMutation<VisitDTO, UpdateVisitVariables>(
    ({ id, data }) => updateVisit(id, data),
    {
      onSuccess: (updatedVisit, variables) => {
        // Strategy 2: Granular invalidation (ADR-003)
        // Invalidate specific visit detail query
        queryClient.invalidateQueries({
          queryKey: ["visit", "detail", variables.id],
        });

        // Invalidate visit lists where this visit may appear
        // This includes:
        // - All visits list
        // - Visits by player
        // - Visits by casino
        // - Filtered visits (by status, mode)
        queryClient.invalidateQueries({
          queryKey: ["visit", "list"],
        });

        // Also invalidate active visits if status was updated
        if (variables.data.status) {
          queryClient.invalidateQueries({
            queryKey: ["visit", "active"],
          });
        }
      },
    },
  );
}

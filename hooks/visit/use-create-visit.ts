/**
 * Mutation hook for creating a new visit
 * Following PT-2 canonical architecture with React Query integration
 *
 * @pattern Cache Invalidation: Strategy 1 - Domain-level invalidation
 * @invalidates All visit queries (['visit'])
 * @see hooks/shared/use-service-mutation.ts for base template
 * @see docs/adr/ADR-003-state-management-strategy.md for invalidation strategies
 */

import { useQueryClient } from "@tanstack/react-query";

import { createVisit } from "@/app/actions/visit-actions";
import { useServiceMutation } from "@/hooks/shared/use-service-mutation";
import type { VisitCreateDTO, VisitDTO } from "@/services/visit";

/**
 * Creates a new visit and invalidates all visit queries
 *
 * Uses domain-level invalidation strategy (Strategy 1 from ADR-003):
 * - Invalidates all visit lists (so new visit appears)
 * - Invalidates all visit details (in case of cache pollution)
 * - Invalidates all visit searches (for consistency)
 *
 * @returns React Query mutation result
 *
 * @example
 * ```typescript
 * function CreateVisitForm() {
 *   const createVisitMutation = useCreateVisit();
 *
 *   const handleSubmit = (data: VisitCreateDTO) => {
 *     createVisitMutation.mutate(data, {
 *       onSuccess: (visit) => {
 *         toast.success('Visit created successfully');
 *         router.push(`/visits/${visit.id}`);
 *       },
 *       onError: (error) => {
 *         toast.error(error.message);
 *       }
 *     });
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <select name="playerId" required />
 *       <select name="casinoId" required />
 *       <input name="checkInDate" type="datetime-local" required />
 *       <select name="mode">
 *         <option value="WALK_IN">Walk In</option>
 *         <option value="RESERVATION">Reservation</option>
 *       </select>
 *       <button disabled={createVisitMutation.isPending}>
 *         {createVisitMutation.isPending ? 'Creating...' : 'Create Visit'}
 *       </button>
 *     </form>
 *   );
 * }
 * ```
 */
export function useCreateVisit() {
  const queryClient = useQueryClient();

  return useServiceMutation<VisitDTO, VisitCreateDTO>(
    (data) => createVisit(data),
    {
      onSuccess: () => {
        // Strategy 1: Domain-level invalidation (ADR-003)
        // Invalidates all queries starting with ['visit']
        // This ensures new visit appears in:
        // - All visit lists (by player, by casino, all visits)
        // - Visit statistics/aggregations
        // - Visit search results
        queryClient.invalidateQueries({ queryKey: ["visit"] });
      },
    },
  );
}

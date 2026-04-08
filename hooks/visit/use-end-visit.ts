/**
 * End Visit Mutation Hook
 *
 * TanStack Query mutation that calls the endVisitAction server action.
 * Invalidates visit + rating slip queries on success.
 *
 * @see PRD-063 Visit Lifecycle Operator Workflow
 * @see EXEC-063 WS1
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { endVisitAction } from '@/app/actions/visit/end-visit-action';
import { ratingSlipKeys } from '@/services/rating-slip/keys';
import type { EndVisitResult } from '@/services/visit/dtos';
import { visitKeys } from '@/services/visit/keys';

/**
 * Ends a visit by closing all open/paused slips then closing the visit.
 *
 * On success (result.data.ok === true):
 * - Invalidates visit list, detail, and active-by-player queries
 * - Invalidates rating slip list and forTable queries
 *
 * @returns TanStack mutation with EndVisitResult data
 */
export function useEndVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (visitId: string): Promise<EndVisitResult> => {
      const serviceResult = await endVisitAction(visitId);

      if (!serviceResult.ok || !serviceResult.data) {
        throw new Error(serviceResult.error ?? 'End visit failed');
      }

      return serviceResult.data;
    },
    onSuccess: (data: EndVisitResult) => {
      // Invalidate visit queries regardless of orchestration outcome
      queryClient.invalidateQueries({ queryKey: visitKeys.list.scope });

      if (data.ok) {
        // Visit was closed — invalidate detail and active-by-player
        queryClient.invalidateQueries({
          queryKey: visitKeys.detail(data.visit.id),
        });
        if (data.visit.player_id) {
          queryClient.invalidateQueries({
            queryKey: visitKeys.activeByPlayer(data.visit.player_id),
          });
        }
      }

      // Invalidate rating slip queries (slips were closed)
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.list.scope,
      });
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.forTable.scope,
      });
    },
  });
}

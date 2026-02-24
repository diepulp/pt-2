/**
 * Create Shift Checkpoint Mutation Hook (PRD-038)
 *
 * Creates a shift checkpoint with metric snapshot.
 * Used by the shift dashboard checkpoint button.
 *
 * @see services/table-context/shift-checkpoint/http.ts
 * @see EXEC-038 WS4
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ShiftCheckpointDTO } from '@/services/table-context/shift-checkpoint/dtos';
import { createShiftCheckpoint } from '@/services/table-context/shift-checkpoint/http';
import { shiftCheckpointKeys } from '@/services/table-context/shift-checkpoint/keys';

/**
 * Mutation hook to create a shift checkpoint.
 *
 * Invalidates:
 * - shiftCheckpoint.latest()
 * - shiftCheckpoint.delta()
 * - shiftCheckpoint.scope (all list queries)
 */
export function useCreateCheckpoint() {
  const queryClient = useQueryClient();

  return useMutation<
    ShiftCheckpointDTO,
    Error,
    { checkpointType: string; notes?: string }
  >({
    mutationKey: ['create-shift-checkpoint'],
    mutationFn: async ({ checkpointType, notes }) => {
      return createShiftCheckpoint({
        checkpoint_type: checkpointType,
        notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: shiftCheckpointKeys.latest(),
      });
      queryClient.invalidateQueries({
        queryKey: shiftCheckpointKeys.delta(),
      });
      queryClient.invalidateQueries({
        queryKey: shiftCheckpointKeys.scope,
      });
    },
  });
}

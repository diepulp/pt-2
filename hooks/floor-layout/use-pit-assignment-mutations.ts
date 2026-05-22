/**
 * Pit Assignment Mutation Hooks
 *
 * Two mutations: assign-or-move and clear. Both require an Idempotency-Key
 * and both invalidate the pit-assignment state cache on success.
 *
 * @see PRD-067 Admin Operations Pit Configuration
 * @see services/floor-layout/http.ts — assignOrMoveTableToSlotHttp, clearSlotAssignmentHttp
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  AssignOrMoveResultDTO,
  ClearResultDTO,
} from '@/services/floor-layout/dtos';
import {
  assignOrMoveTableToSlotHttp,
  clearSlotAssignmentHttp,
} from '@/services/floor-layout/http';
import { floorLayoutKeys } from '@/services/floor-layout/keys';

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export interface AssignOrMoveVariables {
  slotId: string;
  tableId: string;
  idempotencyKey?: string;
}

export interface ClearSlotVariables {
  slotId: string;
  idempotencyKey?: string;
}

export function useAssignOrMoveTableToSlot(
  casinoId: string | null | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation<AssignOrMoveResultDTO, Error, AssignOrMoveVariables>({
    mutationFn: ({ slotId, tableId, idempotencyKey }) =>
      assignOrMoveTableToSlotHttp(
        slotId,
        { table_id: tableId },
        idempotencyKey ?? newIdempotencyKey(),
      ),
    onSuccess: () => {
      if (casinoId) {
        queryClient.invalidateQueries({
          queryKey: floorLayoutKeys.pitAssignmentState(casinoId),
        });
      }
    },
  });
}

export function useClearSlotAssignment(casinoId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation<ClearResultDTO, Error, ClearSlotVariables>({
    mutationFn: ({ slotId, idempotencyKey }) =>
      clearSlotAssignmentHttp(slotId, idempotencyKey ?? newIdempotencyKey()),
    onSuccess: () => {
      if (casinoId) {
        queryClient.invalidateQueries({
          queryKey: floorLayoutKeys.pitAssignmentState(casinoId),
        });
      }
    },
  });
}

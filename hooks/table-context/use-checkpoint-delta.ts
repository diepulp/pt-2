/**
 * Shift Checkpoint Delta Query Hook (PRD-038)
 *
 * Fetches the delta between latest checkpoint and current metrics.
 * Used by the shift dashboard delta badge.
 *
 * @see services/table-context/shift-checkpoint/http.ts
 * @see EXEC-038 WS4
 */

import { useQuery } from '@tanstack/react-query';

import type { ShiftCheckpointDeltaDTO } from '@/services/table-context/shift-checkpoint/dtos';
import { fetchCheckpointDelta } from '@/services/table-context/shift-checkpoint/http';
import { shiftCheckpointKeys } from '@/services/table-context/shift-checkpoint/keys';

/**
 * Query hook to fetch the checkpoint delta.
 * Returns null if no checkpoint exists (delta values are NULL, not zero).
 */
export function useCheckpointDelta() {
  return useQuery<ShiftCheckpointDeltaDTO | null>({
    queryKey: shiftCheckpointKeys.delta(),
    queryFn: fetchCheckpointDelta,
    staleTime: 30_000,
    refetchInterval: 60_000, // Auto-refresh every minute for live delta display
  });
}

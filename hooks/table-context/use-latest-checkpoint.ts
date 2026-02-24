/**
 * Latest Shift Checkpoint Query Hook (PRD-038)
 *
 * Fetches the most recent checkpoint for the casino.
 *
 * @see services/table-context/shift-checkpoint/http.ts
 * @see EXEC-038 WS4
 */

import { useQuery } from '@tanstack/react-query';

import type { ShiftCheckpointDTO } from '@/services/table-context/shift-checkpoint/dtos';
import { fetchLatestCheckpoint } from '@/services/table-context/shift-checkpoint/http';
import { shiftCheckpointKeys } from '@/services/table-context/shift-checkpoint/keys';

/**
 * Query hook to fetch the latest checkpoint.
 * Returns null if no checkpoints exist.
 */
export function useLatestCheckpoint() {
  return useQuery<ShiftCheckpointDTO | null>({
    queryKey: shiftCheckpointKeys.latest(),
    queryFn: fetchLatestCheckpoint,
    staleTime: 60_000,
  });
}

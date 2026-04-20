/**
 * Pit Assignment State Query Hook
 *
 * Fetches the aggregate pit-assignment state (pits + slots + unassigned tables)
 * for the authenticated user's active floor layout version.
 *
 * Casino is derived server-side from RLS context; casinoId is only used to
 * scope the client query key.
 *
 * @see PRD-067 Admin Operations Pit Configuration
 * @see services/floor-layout/http.ts — getPitAssignmentStateHttp
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import type { PitAssignmentStateDTO } from '@/services/floor-layout/dtos';
import { getPitAssignmentStateHttp } from '@/services/floor-layout/http';
import { floorLayoutKeys } from '@/services/floor-layout/keys';

export function usePitAssignmentState(casinoId: string | null | undefined) {
  return useQuery<PitAssignmentStateDTO | null>({
    queryKey: floorLayoutKeys.pitAssignmentState(casinoId ?? ''),
    queryFn: getPitAssignmentStateHttp,
    enabled: Boolean(casinoId),
  });
}

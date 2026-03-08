/**
 * useMeasurementSummary Hook
 *
 * React Query hook for fetching measurement dashboard summary.
 * Uses key factory and HTTP fetcher from WS3 infrastructure.
 *
 * @see PRD-046 ADR-039 Measurement UI
 * @see EXEC-046 WS3 — React Query Integration
 */

import { useQuery } from '@tanstack/react-query';

import type { MeasurementSummaryResponse } from '@/services/measurement';

import { fetchMeasurementSummary } from './http';
import { measurementKeys, type MeasurementScope } from './keys';

/**
 * Fetch measurement summary with optional pit/table filters.
 *
 * - staleTime: 30s (admin dashboard, not real-time critical)
 * - refetchOnWindowFocus: true (refresh when tab regains focus)
 */
export function useMeasurementSummary(filters?: MeasurementScope) {
  return useQuery<MeasurementSummaryResponse>({
    queryKey: measurementKeys.summary(filters),
    queryFn: () => fetchMeasurementSummary(filters?.pitId, filters?.tableId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

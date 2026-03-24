'use client';

/**
 * Anomaly Alerts Hook (PRD-055 WS6)
 *
 * React Query wrapper around GET /api/shift-intelligence/anomaly-alerts.
 * Polls every 30 seconds to match existing shift dashboard cadence.
 */

import { useQuery } from '@tanstack/react-query';

import type { AnomalyAlertsResponseDTO } from '@/services/shift-intelligence/dtos';
import { fetchAnomalyAlerts } from '@/services/shift-intelligence/http';
import { shiftIntelligenceKeys } from '@/services/shift-intelligence/keys';

export interface UseAnomalyAlertsOptions {
  windowStart: string;
  windowEnd: string;
  enabled?: boolean;
}

export function useAnomalyAlerts(options: UseAnomalyAlertsOptions) {
  const { windowStart, windowEnd, enabled = true } = options;

  return useQuery<AnomalyAlertsResponseDTO>({
    queryKey: shiftIntelligenceKeys.anomalyAlerts(windowStart, windowEnd),
    queryFn: () => fetchAnomalyAlerts(windowStart, windowEnd),
    enabled: enabled && !!windowStart && !!windowEnd,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}

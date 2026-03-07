'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchCashObsAlerts } from '@/hooks/shift-dashboard/http';
import { shiftDashboardKeys } from '@/hooks/shift-dashboard/keys';
import type { CashObsSpikeAlertDTO } from '@/services/table-context/dtos';

import { useAlertTimeWindow } from './use-alert-time-window';

/**
 * Fetches cash observation spike alerts for the admin alerts page.
 * Reuses the same React Query key as shift dashboard alerts for dedup.
 */
export function useAdminAlerts() {
  const timeWindow = useAlertTimeWindow();

  const query = useQuery<CashObsSpikeAlertDTO[]>({
    queryKey: shiftDashboardKeys.alerts({
      start: timeWindow.start,
      end: timeWindow.end,
    }),
    queryFn: () => fetchCashObsAlerts(timeWindow.start, timeWindow.end),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    timeWindow,
  };
}

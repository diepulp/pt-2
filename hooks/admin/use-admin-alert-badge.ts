'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useDismissedAlerts } from '@/hooks/admin/dismissed-alerts-context';
import { useAlertTimeWindow } from '@/hooks/admin/use-alert-time-window';
import { fetchCashObsAlerts } from '@/hooks/shift-dashboard/http';
import { shiftDashboardKeys } from '@/hooks/shift-dashboard/keys';
import { useAuth } from '@/hooks/use-auth';
import { computeAlertKey } from '@/lib/admin/alert-key';
import type { CashObsSpikeAlertDTO } from '@/services/table-context/dtos';

const BADGE_ROLES = new Set(['admin', 'pit_boss']);

/**
 * Badge count for sidebar: undismissed warn + critical alerts.
 * Role-gated: only fires query for admin/pit_boss.
 * Shares React Query key with useAdminAlerts for dedup.
 */
export function useAdminAlertBadge() {
  const { staffRole, isLoading: authLoading } = useAuth();
  const { isDismissed } = useDismissedAlerts();
  const timeWindow = useAlertTimeWindow();

  const isAuthorized =
    !authLoading && staffRole !== null && BADGE_ROLES.has(staffRole);

  const { data: alerts, isLoading: alertsLoading } = useQuery<
    CashObsSpikeAlertDTO[]
  >({
    queryKey: shiftDashboardKeys.alerts({
      start: timeWindow.start,
      end: timeWindow.end,
    }),
    queryFn: () => fetchCashObsAlerts(timeWindow.start, timeWindow.end),
    enabled: isAuthorized,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const count = useMemo(() => {
    if (!alerts) return 0;
    const undismissed = alerts.filter((a) => {
      if (a.severity !== 'warn' && a.severity !== 'critical') return false;
      return !isDismissed(computeAlertKey(a));
    });
    return Math.max(0, undismissed.length);
  }, [alerts, isDismissed]);

  return {
    count,
    isLoading: authLoading || (isAuthorized && alertsLoading),
    isAuthorized,
  };
}

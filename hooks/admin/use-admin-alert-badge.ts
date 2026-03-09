'use client';

import { useMemo } from 'react';

import { useDismissedAlertsSafe } from '@/hooks/admin/dismissed-alerts-context';
import { useAlertTimeWindow } from '@/hooks/admin/use-alert-time-window';
import { useCashObsSummary } from '@/hooks/shift-dashboard/use-cash-obs-summary';
import { useAuth } from '@/hooks/use-auth';
import { computeAlertKey } from '@/lib/admin/alert-key';

// Cash observations summary is the canonical client read contract.
// Do not call /alerts endpoint directly — use useCashObsSummary.

const BADGE_ROLES = new Set(['admin', 'pit_boss']);

/**
 * Badge count for sidebar: undismissed warn + critical alerts.
 * Role-gated: only fires query for admin/pit_boss.
 * Shares cashObsSummary query key with useCashObsSummary for dedup.
 */
export function useAdminAlertBadge() {
  const { staffRole, isLoading: authLoading } = useAuth();
  const { isDismissed } = useDismissedAlertsSafe();
  const timeWindow = useAlertTimeWindow();

  const isAuthorized =
    !authLoading && staffRole !== null && BADGE_ROLES.has(staffRole);

  const { data: summary, isLoading: summaryLoading } = useCashObsSummary({
    window: { start: timeWindow.start, end: timeWindow.end },
    enabled: isAuthorized,
  });

  const alerts = summary?.alerts;

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
    isLoading: authLoading || (isAuthorized && summaryLoading),
    isAuthorized,
  };
}

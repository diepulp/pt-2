'use client';

import { useCashObsSummary } from '@/hooks/shift-dashboard/use-cash-obs-summary';

import { useAlertTimeWindow } from './use-alert-time-window';

// Cash observations summary is the canonical client read contract.
// Do not call /alerts endpoint directly — use useCashObsSummary.

/**
 * Fetches cash observation spike alerts for the admin alerts page.
 * Uses cashObsSummary (BFF endpoint) for dedup with shift dashboard.
 */
export function useAdminAlerts() {
  const timeWindow = useAlertTimeWindow();

  const query = useCashObsSummary({
    window: { start: timeWindow.start, end: timeWindow.end },
  });

  return {
    ...query,
    /** Alerts extracted from the consolidated cash-obs summary. */
    data: query.data?.alerts,
    timeWindow,
  };
}

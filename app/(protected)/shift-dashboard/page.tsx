/**
 * Shift Dashboard Route
 *
 * Server component with RSC data prefetching via TanStack Query dehydrate.
 * Prefetches all 3 dashboard queries server-side to eliminate client loading waterfall.
 *
 * @see PRD-026-shift-dashboard-three-panel-layout-v0
 * @see PERF-007 WS4 — RSC Data Prefetching
 */

import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import type { Metadata } from 'next';

import { ShiftDashboardV3 } from '@/components/shift-dashboard-v3';
import {
  fetchActiveVisitorsSummary,
  fetchCashObsSummary,
  fetchShiftDashboardSummary,
} from '@/hooks/shift-dashboard/http';
import { shiftDashboardKeys } from '@/hooks/shift-dashboard/keys';
import type { ShiftTimeWindow } from '@/hooks/shift-dashboard/keys';

export const metadata: Metadata = {
  title: 'Shift Dashboard | PT-2',
  description: 'Operational metrics and telemetry for the current shift',
};

function getDefaultWindow(): ShiftTimeWindow {
  const now = new Date();
  const start = new Date(now.getTime() - 8 * 60 * 60 * 1000);
  return {
    start: start.toISOString(),
    end: now.toISOString(),
  };
}

export default async function ShiftDashboardRoute() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
    },
  });

  const window = getDefaultWindow();

  // Prefetch all 3 dashboard queries in parallel.
  // Use allSettled so a single failure doesn't block the page —
  // client hooks will hydrate from scratch for any failed query.
  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: shiftDashboardKeys.summary(window),
      queryFn: () => fetchShiftDashboardSummary(window.start, window.end),
    }),
    queryClient.prefetchQuery({
      queryKey: shiftDashboardKeys.cashObsSummary(window),
      queryFn: () => fetchCashObsSummary(window.start, window.end),
    }),
    queryClient.prefetchQuery({
      queryKey: [...shiftDashboardKeys.root, 'visitors-summary'],
      queryFn: fetchActiveVisitorsSummary,
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ShiftDashboardV3 />
    </HydrationBoundary>
  );
}

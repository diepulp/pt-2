/**
 * Measurement Reports — Statistical Anomaly Detection group
 *
 * Server component with RSC data prefetching via TanStack Query dehydrate.
 * Prefetches unfiltered measurement summary server-side to eliminate
 * client loading waterfall.
 *
 * @see PRD-046 ADR-039 Measurement UI
 * @see EXEC-046 WS4 — RSC Page + Governance Declarations
 */

import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import type { Metadata } from 'next';

import { MeasurementReportsDashboard } from '@/components/measurement/measurement-reports-dashboard';
import { fetchMeasurementSummary } from '@/hooks/measurement/http';
import { measurementKeys } from '@/hooks/measurement/keys';

export const metadata: Metadata = {
  title: 'Measurement Reports | PT-2',
};

export default async function AnomalyDetectionReportsPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
    },
  });

  await queryClient.prefetchQuery({
    queryKey: measurementKeys.summary(),
    queryFn: () => fetchMeasurementSummary(),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MeasurementReportsDashboard />
    </HydrationBoundary>
  );
}

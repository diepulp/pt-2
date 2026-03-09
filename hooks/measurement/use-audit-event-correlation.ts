/**
 * useAuditEventCorrelation Hook
 *
 * React Query hook for fetching audit event correlation data
 * for a single rating slip from measurement_audit_event_correlation_v (MEAS-002).
 *
 * Lazy fetch: only queries when `enabled` is true (typically on collapsible expand).
 *
 * @see PRD-049 WS2 — Slip Detail Audit Trace Panel
 * @see EXEC-049 WS2 — Audit Trace Panel
 */

import { useQuery } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import type { AuditCorrelationQueryResult } from '@/services/measurement/queries';
import { queryAuditCorrelationForSlip } from '@/services/measurement/queries';

import { measurementKeys } from './keys';

/**
 * Fetch audit event correlation for a single rating slip.
 *
 * - staleTime: 60s (MEAS-002: Compliance-Interpreted, Request-time freshness;
 *   data is immutable after slip closure so 60s is conservative)
 * - gcTime: 300s (keep cached for 5 min to avoid refetch on collapsible toggle)
 * - refetchOnWindowFocus: false (immutable data, no need to refetch)
 * - Lazy: only fetches when `enabled` is true
 */
export function useAuditEventCorrelation(
  slipId: string | null,
  casinoId: string,
  enabled: boolean,
) {
  return useQuery<AuditCorrelationQueryResult>({
    queryKey: measurementKeys.auditTrace(slipId),
    queryFn: () => {
      const supabase = createBrowserComponentClient();
      return queryAuditCorrelationForSlip(supabase, casinoId, slipId!);
    },
    staleTime: 60_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
    enabled: Boolean(slipId) && enabled,
  });
}

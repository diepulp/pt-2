/**
 * Measurement HTTP Fetchers
 *
 * Client-side fetch functions for Measurement Summary BFF endpoint.
 * Uses fetchJSON from @/lib/http/fetch-json for typed responses.
 *
 * @see PRD-046 ADR-039 Measurement UI
 * @see EXEC-046 WS3 — React Query Integration
 */

import { fetchJSON } from '@/lib/http/fetch-json';
import type { MeasurementSummaryResponse } from '@/services/measurement';

const BASE = '/api/v1/measurement';

/**
 * Fetches measurement summary (all 4 metrics) from BFF endpoint.
 * Builds URLSearchParams from optional filter params.
 *
 * @param pitId - Optional pit filter (UUID)
 * @param tableId - Optional table filter (UUID)
 * @returns Promise resolving to MeasurementSummaryResponse
 */
export async function fetchMeasurementSummary(
  pitId?: string,
  tableId?: string,
): Promise<MeasurementSummaryResponse> {
  const params = new URLSearchParams();
  if (pitId) params.set('pit_id', pitId);
  if (tableId) params.set('table_id', tableId);

  const query = params.toString();
  const url = `${BASE}/summary${query ? `?${query}` : ''}`;

  return fetchJSON<MeasurementSummaryResponse>(url);
}

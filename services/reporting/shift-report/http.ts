/**
 * ShiftReportService HTTP Fetchers
 *
 * Client-side fetchers for shift report route handlers.
 *
 * @see EXEC-065 WS1
 */

import { fetchJSON } from '@/lib/http/fetch-json';

import type { ShiftReportDTO } from './dtos';

const BASE = '/api/v1/reports/shift-summary';

export async function fetchShiftReport(
  gamingDay: string,
  shiftBoundary: 'swing' | 'day' | 'grave',
): Promise<ShiftReportDTO> {
  const params = new URLSearchParams({
    gaming_day: gamingDay,
    shift_boundary: shiftBoundary,
  });
  return fetchJSON<ShiftReportDTO>(`${BASE}?${params.toString()}`);
}

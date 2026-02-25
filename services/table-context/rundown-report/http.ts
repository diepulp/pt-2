/**
 * Rundown Report HTTP Fetchers (PRD-038)
 *
 * Client-side fetchers for Route Handlers.
 * Used by React Query hooks and UI components.
 *
 * @see SLAD section 340-341 (http.ts requirement)
 * @see EXEC-038 WS2 Service Layer
 */

import { fetchJSON } from '@/lib/http/fetch-json';
import { IDEMPOTENCY_HEADER } from '@/lib/http/headers';

import type {
  TableRundownReportDTO,
  TableRundownReportSummaryDTO,
} from './dtos';
import type { PersistRundownRequestBody } from './schemas';

const BASE_URL = '/api/v1';

/**
 * Generates a unique idempotency key for mutations.
 */
function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

// === Mutation Fetchers ===

/**
 * Persist (UPSERT) a rundown report for a session.
 * POST /api/v1/table-rundown-reports
 */
export async function persistRundownReport(
  input: PersistRundownRequestBody,
  idempotencyKey?: string,
): Promise<TableRundownReportDTO> {
  return fetchJSON<TableRundownReportDTO>(`${BASE_URL}/table-rundown-reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

/**
 * Finalize a rundown report.
 * PATCH /api/v1/table-rundown-reports/[id]/finalize
 */
export async function finalizeRundownReport(
  reportId: string,
  idempotencyKey?: string,
): Promise<TableRundownReportDTO> {
  return fetchJSON<TableRundownReportDTO>(
    `${BASE_URL}/table-rundown-reports/${reportId}/finalize`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
      },
    },
  );
}

// === Query Fetchers ===

/**
 * Get rundown report by session ID.
 * GET /api/v1/table-rundown-reports?table_session_id=[sessionId]
 */
export async function fetchRundownBySession(
  sessionId: string,
): Promise<TableRundownReportDTO | null> {
  try {
    return await fetchJSON<TableRundownReportDTO>(
      `${BASE_URL}/table-rundown-reports?table_session_id=${sessionId}`,
    );
  } catch {
    // 404 means no report exists for this session
    return null;
  }
}

/**
 * Get rundown report by ID.
 * GET /api/v1/table-rundown-reports/[id]
 */
export async function fetchRundownById(
  reportId: string,
): Promise<TableRundownReportDTO> {
  return fetchJSON<TableRundownReportDTO>(
    `${BASE_URL}/table-rundown-reports/${reportId}`,
  );
}

/**
 * List rundown reports by gaming day.
 * GET /api/v1/table-rundown-reports?gaming_day=YYYY-MM-DD
 */
export async function fetchRundownsByDay(
  gamingDay: string,
): Promise<TableRundownReportSummaryDTO[]> {
  return fetchJSON<TableRundownReportSummaryDTO[]>(
    `${BASE_URL}/table-rundown-reports?gaming_day=${gamingDay}`,
  );
}

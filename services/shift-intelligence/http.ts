/**
 * ShiftIntelligenceService HTTP Fetchers (PRD-055)
 * Client-side fetchers for route handlers.
 */
import { fetchJSON } from '@/lib/http/fetch-json';
import { IDEMPOTENCY_HEADER } from '@/lib/http/headers';

import type {
  AnomalyAlertsResponseDTO,
  BaselineComputeResultDTO,
  ComputeBaselineInput,
} from './dtos';

const BASE = '/api/shift-intelligence';

function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export async function fetchComputeBaselines(
  input?: ComputeBaselineInput,
): Promise<BaselineComputeResultDTO> {
  return fetchJSON<BaselineComputeResultDTO>(`${BASE}/compute-baselines`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
    },
    body: input ? JSON.stringify(input) : undefined,
  });
}

export async function fetchAnomalyAlerts(
  windowStart: string,
  windowEnd: string,
): Promise<AnomalyAlertsResponseDTO> {
  const params = new URLSearchParams({
    window_start: windowStart,
    window_end: windowEnd,
  });
  return fetchJSON<AnomalyAlertsResponseDTO>(
    `${BASE}/anomaly-alerts?${params.toString()}`,
  );
}

/**
 * ShiftIntelligenceService HTTP Fetchers (PRD-055)
 * Client-side fetchers for route handlers.
 */
import { fetchJSON } from '@/lib/http/fetch-json';
import { IDEMPOTENCY_HEADER } from '@/lib/http/headers';

import type {
  AcknowledgeAlertInput,
  AcknowledgeAlertResultDTO,
  AlertQualityDTO,
  AnomalyAlertsResponseDTO,
  BaselineComputeResultDTO,
  ComputeBaselineInput,
  PersistAlertsInput,
  PersistAlertsResultDTO,
  ShiftAlertDTO,
} from './dtos';

// [DA P1-3] Corrected to /api/v1/ per codebase convention
const BASE = '/api/v1/shift-intelligence';

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

// ── PRD-056 Alert Maturity Fetchers ─────────────────────────────────────────

export async function fetchPersistAlerts(
  input?: PersistAlertsInput,
): Promise<PersistAlertsResultDTO> {
  return fetchJSON<PersistAlertsResultDTO>(`${BASE}/persist-alerts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
    },
    body: input ? JSON.stringify(input) : undefined,
  });
}

export async function fetchAcknowledgeAlert(
  input: AcknowledgeAlertInput,
): Promise<AcknowledgeAlertResultDTO> {
  return fetchJSON<AcknowledgeAlertResultDTO>(`${BASE}/acknowledge-alert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

export async function fetchAlerts(
  gamingDay: string,
  status?: string,
): Promise<{ alerts: ShiftAlertDTO[] }> {
  const params = new URLSearchParams({ gaming_day: gamingDay });
  if (status) params.set('status', status);
  return fetchJSON<{ alerts: ShiftAlertDTO[] }>(
    `${BASE}/alerts?${params.toString()}`,
  );
}

export async function fetchAlertQuality(
  startDate: string,
  endDate: string,
): Promise<AlertQualityDTO> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });
  return fetchJSON<AlertQualityDTO>(
    `${BASE}/alert-quality?${params.toString()}`,
  );
}

/**
 * Shift Checkpoint HTTP Fetchers (PRD-038)
 *
 * Client-side fetchers for Route Handlers.
 * Used by React Query hooks and UI components.
 *
 * @see SLAD section 340-341 (http.ts requirement)
 * @see EXEC-038 WS2 Service Layer
 */

import { fetchJSON } from '@/lib/http/fetch-json';
import { IDEMPOTENCY_HEADER } from '@/lib/http/headers';

import type { ShiftCheckpointDTO, ShiftCheckpointDeltaDTO } from './dtos';
import type { CreateCheckpointRequestBody } from './schemas';

const BASE_URL = '/api/v1';

/**
 * Generates a unique idempotency key for mutations.
 */
function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

// === Mutation Fetchers ===

/**
 * Create a shift checkpoint.
 * POST /api/v1/shift-checkpoints
 */
export async function createShiftCheckpoint(
  input: CreateCheckpointRequestBody,
  idempotencyKey?: string,
): Promise<ShiftCheckpointDTO> {
  return fetchJSON<ShiftCheckpointDTO>(`${BASE_URL}/shift-checkpoints`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

// === Query Fetchers ===

/**
 * Get the latest checkpoint.
 * GET /api/v1/shift-checkpoints/latest
 */
export async function fetchLatestCheckpoint(): Promise<ShiftCheckpointDTO | null> {
  try {
    return await fetchJSON<ShiftCheckpointDTO>(
      `${BASE_URL}/shift-checkpoints/latest`,
    );
  } catch {
    // 404 means no checkpoint exists
    return null;
  }
}

/**
 * Get delta comparison (current vs latest checkpoint).
 * GET /api/v1/shift-checkpoints/delta
 */
export async function fetchCheckpointDelta(): Promise<ShiftCheckpointDeltaDTO | null> {
  try {
    return await fetchJSON<ShiftCheckpointDeltaDTO>(
      `${BASE_URL}/shift-checkpoints/delta`,
    );
  } catch {
    // 404 means no checkpoint to compare against
    return null;
  }
}

/**
 * List checkpoints by gaming day.
 * GET /api/v1/shift-checkpoints?gaming_day=YYYY-MM-DD
 */
export async function fetchCheckpointsByDay(
  gamingDay: string,
): Promise<ShiftCheckpointDTO[]> {
  return fetchJSON<ShiftCheckpointDTO[]>(
    `${BASE_URL}/shift-checkpoints?gaming_day=${gamingDay}`,
  );
}

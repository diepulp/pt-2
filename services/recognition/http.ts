/**
 * RecognitionService HTTP Fetchers
 *
 * Client-side fetch functions for recognition API endpoints.
 * Mutations include Idempotency-Key header (ADR-021).
 *
 * @see PRD-051 / EXEC-051 WS3
 */

import { fetchJSON } from '@/lib/http/fetch-json';
import { IDEMPOTENCY_HEADER } from '@/lib/http/headers';

import type {
  ActivationResultDTO,
  RecognitionResultDTO,
  RedemptionResultDTO,
} from './dtos';

const BASE = '/api/v1/players';

function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

// === Lookup ===

export async function lookupPlayerCompany(
  searchTerm: string,
): Promise<RecognitionResultDTO[]> {
  const response = await fetchJSON<{ data: RecognitionResultDTO[] }>(
    `${BASE}/lookup-company`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ search_term: searchTerm }),
    },
  );
  return response.data;
}

// === Activate ===

export async function activatePlayerLocally(
  playerId: string,
): Promise<ActivationResultDTO> {
  const response = await fetchJSON<{ data: ActivationResultDTO }>(
    `${BASE}/activate-locally`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
      },
      body: JSON.stringify({ player_id: playerId }),
    },
  );
  return response.data;
}

// === Redeem ===

export async function redeemLoyaltyLocally(
  playerId: string,
  amount: number,
  reason: string,
): Promise<RedemptionResultDTO> {
  const response = await fetchJSON<{ data: RedemptionResultDTO }>(
    `${BASE}/redeem-loyalty`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
      },
      body: JSON.stringify({ player_id: playerId, amount, reason }),
    },
  );
  return response.data;
}

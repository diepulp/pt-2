/**
 * Player Exclusion HTTP Fetchers
 *
 * Client-side fetch functions for exclusion API endpoints.
 * All mutations include Idempotency-Key header (ADR-021).
 *
 * @see ADR-042 Player Exclusion Architecture
 * @see EXEC-050 WS4
 */

import { fetchJSON } from '@/lib/http/fetch-json';
import { IDEMPOTENCY_HEADER } from '@/lib/http/headers';

import type {
  CreateExclusionInput,
  ExclusionStatusDTO,
  LiftExclusionInput,
  PlayerExclusionDTO,
} from './exclusion-dtos';

const BASE = '/api/v1/players';

/** List all exclusions for a player. */
export async function listExclusions(
  playerId: string,
): Promise<PlayerExclusionDTO[]> {
  const response = await fetchJSON<{ data: PlayerExclusionDTO[] }>(
    `${BASE}/${playerId}/exclusions`,
  );
  return response.data;
}

/** List active exclusions for a player. */
export async function getActiveExclusions(
  playerId: string,
): Promise<PlayerExclusionDTO[]> {
  const response = await fetchJSON<{ data: PlayerExclusionDTO[] }>(
    `${BASE}/${playerId}/exclusions/active`,
  );
  return response.data;
}

/** Create a new exclusion. */
export async function createExclusion(
  playerId: string,
  input: Omit<CreateExclusionInput, 'player_id'>,
): Promise<PlayerExclusionDTO> {
  const response = await fetchJSON<{ data: PlayerExclusionDTO }>(
    `${BASE}/${playerId}/exclusions`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [IDEMPOTENCY_HEADER]: crypto.randomUUID(),
      },
      body: JSON.stringify({ ...input, player_id: playerId }),
    },
  );
  return response.data;
}

/** Lift (soft-delete) an exclusion. */
export async function liftExclusion(
  playerId: string,
  exclusionId: string,
  input: LiftExclusionInput,
): Promise<PlayerExclusionDTO> {
  const response = await fetchJSON<{ data: PlayerExclusionDTO }>(
    `${BASE}/${playerId}/exclusions/${exclusionId}/lift`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [IDEMPOTENCY_HEADER]: crypto.randomUUID(),
      },
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

/** Get collapsed exclusion status. */
export async function getExclusionStatus(
  playerId: string,
): Promise<ExclusionStatusDTO> {
  return fetchJSON<ExclusionStatusDTO>(
    `${BASE}/${playerId}/exclusions/status`,
  );
}

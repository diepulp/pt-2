/**
 * PlayerService HTTP Fetchers
 *
 * Client-side fetch functions for PlayerService API endpoints.
 * Uses fetchJSON from @/lib/http/fetch-json for typed responses.
 * All mutations include idempotency-key header.
 *
 * @see PRD-003 Player & Visit Management
 */

import { fetchJSON } from '@/lib/http/fetch-json';

import type {
  CreatePlayerDTO,
  PlayerDTO,
  PlayerEnrollmentDTO,
  PlayerListFilters,
  PlayerSearchResultDTO,
  UpdatePlayerDTO,
} from './dtos';

const BASE = '/api/v1/players';

// === Helper Functions ===

/**
 * Builds URLSearchParams from filter object, excluding undefined/null values.
 */
function buildParams(
  filters: Record<string, string | number | boolean | undefined | null>,
): URLSearchParams {
  const entries = Object.entries(filters).filter(
    ([, value]) => value != null,
  ) as [string, string | number | boolean][];

  return new URLSearchParams(
    entries.map(([key, value]) => [key, String(value)]),
  );
}

/**
 * Generates a unique idempotency key for mutations.
 */
function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

// === Player Search ===

/**
 * Search players by name.
 * Returns results with enrollment status.
 */
export async function searchPlayers(
  query: string,
  limit = 20,
): Promise<PlayerSearchResultDTO[]> {
  const params = buildParams({ q: query, limit });
  const url = `${BASE}?${params}`;
  const response = await fetchJSON<{ items: PlayerSearchResultDTO[] }>(url);
  return response.items;
}

// === Player CRUD ===

/**
 * Fetches a paginated list of players.
 */
export async function getPlayers(
  filters: PlayerListFilters = {},
): Promise<{ items: PlayerDTO[]; cursor: string | null }> {
  const params = buildParams(filters);
  const url = params.toString() ? `${BASE}?${params}` : BASE;
  return fetchJSON<{ items: PlayerDTO[]; cursor: string | null }>(url);
}

/**
 * Fetches a single player by ID.
 */
export async function getPlayer(playerId: string): Promise<PlayerDTO> {
  return fetchJSON<PlayerDTO>(`${BASE}/${playerId}`);
}

/**
 * Creates a new player.
 * Includes idempotency-key header to prevent duplicate creation.
 */
export async function createPlayer(input: CreatePlayerDTO): Promise<PlayerDTO> {
  return fetchJSON<PlayerDTO>(BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

/**
 * Updates an existing player.
 * Includes idempotency-key header for safe retries.
 */
export async function updatePlayer(
  playerId: string,
  input: UpdatePlayerDTO,
): Promise<PlayerDTO> {
  return fetchJSON<PlayerDTO>(`${BASE}/${playerId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

// === Player Enrollment ===

/**
 * Enrolls a player in the current casino.
 * Idempotent - returns existing enrollment if already enrolled.
 */
export async function enrollPlayer(
  playerId: string,
): Promise<PlayerEnrollmentDTO> {
  return fetchJSON<PlayerEnrollmentDTO>(`${BASE}/${playerId}/enroll`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': generateIdempotencyKey(),
    },
    body: JSON.stringify({}),
  });
}

/**
 * Gets enrollment status for a player in the current casino.
 */
export async function getPlayerEnrollment(
  playerId: string,
): Promise<PlayerEnrollmentDTO | null> {
  try {
    return await fetchJSON<PlayerEnrollmentDTO>(
      `${BASE}/${playerId}/enrollment`,
    );
  } catch (error) {
    // 404 means not enrolled
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

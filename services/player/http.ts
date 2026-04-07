/**
 * PlayerService HTTP Fetchers
 *
 * Client-side fetch functions for PlayerService API endpoints.
 * Uses fetchJSON from @/lib/http/fetch-json for typed responses.
 * All mutations include Idempotency-Key header (ADR-021).
 *
 * @see PRD-003 Player & Visit Management
 * @see ADR-021 Idempotency Header Standardization
 */

import { fetchJSON } from '@/lib/http/fetch-json';
import { IDEMPOTENCY_HEADER } from '@/lib/http/headers';
import { createBrowserComponentClient } from '@/lib/supabase/client';

import type {
  CreatePlayerDTO,
  PlayerDTO,
  PlayerEnrollmentDTO,
  PlayerIdentityDTO,
  PlayerIdentityInput,
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
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
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
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

// === Player Identity ===

// Note: enrollPlayer() moved to services/casino/http.ts per ADR-022 D5
// (CasinoService owns player_casino table)

/**
 * Upserts player identity information.
 * Idempotent - creates or updates identity record.
 *
 * POST /api/v1/players/{playerId}/identity
 */
export async function upsertIdentity(
  playerId: string,
  input: PlayerIdentityInput,
): Promise<PlayerIdentityDTO> {
  return fetchJSON<PlayerIdentityDTO>(`${BASE}/${playerId}/identity`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

/**
 * Gets player identity information.
 * Returns null if identity not found.
 *
 * GET /api/v1/players/{playerId}/identity
 */
export async function getIdentity(
  playerId: string,
): Promise<PlayerIdentityDTO | null> {
  try {
    return await fetchJSON<PlayerIdentityDTO>(`${BASE}/${playerId}/identity`);
  } catch (error) {
    // 404 means identity not found
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

// === Batch Lookups ===

/**
 * Batch-fetches player display names by IDs.
 * Returns a Map<player_id, full_name> for the given IDs.
 *
 * Uses direct Supabase query as a contained adapter — no batch
 * endpoint exists yet. Replace with API call when one is added.
 */
export async function getPlayerNamesByIds(
  playerIds: string[],
): Promise<Map<string, string>> {
  if (playerIds.length === 0) return new Map();

  const supabase = createBrowserComponentClient();
  const { data, error } = await supabase
    .from('player')
    .select('id, first_name, last_name')
    .in('id', playerIds);

  if (error) throw error;

  const map = new Map<string, string>();
  for (const p of data ?? []) {
    map.set(p.id, `${p.first_name} ${p.last_name}`);
  }
  return map;
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

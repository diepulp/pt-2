/**
 * FloorLayoutService HTTP Fetchers
 *
 * Client-side fetch functions for FloorLayoutService API endpoints.
 * Uses fetchJSON from @/lib/http/fetch-json for typed responses.
 * All mutations include idempotency-key header.
 *
 * Pattern B (Canonical CRUD): Thin HTTP wrappers over API routes.
 *
 * @see SERVICE_RESPONSIBILITY_MATRIX.md section 1580-1719
 */

import { fetchJSON } from '@/lib/http/fetch-json';

import type {
  FloorLayoutActivationDTO,
  FloorLayoutDTO,
  FloorLayoutListFilters,
  FloorLayoutVersionDTO,
  FloorLayoutVersionFilters,
  FloorLayoutVersionWithSlotsDTO,
} from './dtos';

const BASE = '/api/v1/floor-layouts';

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

// === Layout CRUD ===

/**
 * Fetches a paginated list of floor layouts.
 *
 * GET /api/v1/floor-layouts?casino_id=X&status=Y&cursor=C&limit=N
 */
export async function listFloorLayouts(
  filters: FloorLayoutListFilters,
): Promise<{ items: FloorLayoutDTO[]; cursor: string | null }> {
  const params = buildParams(filters);
  const url = params.toString() ? `${BASE}?${params}` : BASE;
  return fetchJSON<{ items: FloorLayoutDTO[]; cursor: string | null }>(url);
}

/**
 * Fetches a single floor layout by ID.
 *
 * GET /api/v1/floor-layouts/{layoutId}
 */
export async function getFloorLayout(
  layoutId: string,
): Promise<FloorLayoutDTO> {
  return fetchJSON<FloorLayoutDTO>(`${BASE}/${layoutId}`);
}

// === Version CRUD ===

/**
 * Fetches a paginated list of versions for a layout.
 *
 * GET /api/v1/floor-layouts/{layoutId}/versions?status=X&include_slots=Y
 */
export async function listFloorLayoutVersions(
  layoutId: string,
  filters: Omit<FloorLayoutVersionFilters, 'layout_id'> = {},
): Promise<{
  items: FloorLayoutVersionDTO[] | FloorLayoutVersionWithSlotsDTO[];
}> {
  const params = buildParams(filters);
  const url = params.toString()
    ? `${BASE}/${layoutId}/versions?${params}`
    : `${BASE}/${layoutId}/versions`;
  return fetchJSON<{
    items: FloorLayoutVersionDTO[] | FloorLayoutVersionWithSlotsDTO[];
  }>(url);
}

/**
 * Fetches a single floor layout version by ID.
 *
 * GET /api/v1/floor-layouts/{layoutId}/versions/{versionId}
 */
export async function getFloorLayoutVersion(
  layoutId: string,
  versionId: string,
): Promise<FloorLayoutVersionDTO> {
  return fetchJSON<FloorLayoutVersionDTO>(
    `${BASE}/${layoutId}/versions/${versionId}`,
  );
}

// === Activation CRUD ===

/**
 * Fetches the currently active floor layout for a casino.
 * Returns the active layout activation record with embedded layout data.
 *
 * GET /api/v1/floor-layouts/active?casino_id=X
 */
export async function getActiveFloorLayout(
  casinoId: string,
): Promise<FloorLayoutActivationDTO | null> {
  const params = buildParams({ casino_id: casinoId });
  const url = `${BASE}/active?${params}`;
  return fetchJSON<FloorLayoutActivationDTO | null>(url);
}

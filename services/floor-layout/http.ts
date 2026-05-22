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

import { fetchJSON, mutateJSON } from '@/lib/http/fetch-json';

import type {
  AssignOrMoveResultDTO,
  ClearResultDTO,
  FloorLayoutActivationDTO,
  FloorLayoutDTO,
  FloorLayoutListFilters,
  FloorLayoutVersionDTO,
  FloorLayoutVersionFilters,
  FloorLayoutVersionWithSlotsDTO,
  PitAssignmentStateDTO,
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

// === Pit Assignment HTTP (PRD-067) ===

/**
 * Fetches the aggregate pit-assignment state for the active layout version.
 * Casino is derived server-side from RLS context — not a query parameter.
 *
 * GET /api/v1/floor-layouts/pit-assignment-state
 */
export async function getPitAssignmentStateHttp(): Promise<PitAssignmentStateDTO | null> {
  return fetchJSON<PitAssignmentStateDTO | null>(
    `${BASE}/pit-assignment-state`,
  );
}

/**
 * Assigns a table to a slot, or moves it from its current slot.
 * Requires idempotency key.
 *
 * POST /api/v1/floor-layouts/slots/{slotId}/assign
 */
export async function assignOrMoveTableToSlotHttp(
  slotId: string,
  body: { table_id: string },
  idempotencyKey: string,
): Promise<AssignOrMoveResultDTO> {
  return mutateJSON<AssignOrMoveResultDTO, { table_id: string }>(
    `${BASE}/slots/${slotId}/assign`,
    body,
    idempotencyKey,
  );
}

/**
 * Clears a slot's table assignment. Idempotent at the RPC layer.
 * Requires idempotency key.
 *
 * DELETE /api/v1/floor-layouts/slots/{slotId}/assign
 */
export async function clearSlotAssignmentHttp(
  slotId: string,
  idempotencyKey: string,
): Promise<ClearResultDTO> {
  return fetchJSON<ClearResultDTO>(`${BASE}/slots/${slotId}/assign`, {
    method: 'DELETE',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  });
}

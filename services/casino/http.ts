/**
 * CasinoService HTTP Fetchers
 *
 * Client-side fetch functions for CasinoService API endpoints.
 * Uses fetchJSON from @/lib/http/fetch-json for typed responses.
 * All mutations include idempotency-key header.
 *
 * @see SPEC-PRD-000-casino-foundation.md section 6.2
 */

import { fetchJSON } from "@/lib/http/fetch-json";

import type {
  CasinoDTO,
  CasinoListFilters,
  CasinoSettingsDTO,
  CasinoStaffFilters,
  CreateCasinoDTO,
  CreateStaffDTO,
  GamingDayDTO,
  StaffDTO,
  UpdateCasinoDTO,
  UpdateCasinoSettingsDTO,
} from "./dtos";

const BASE = "/api/v1/casino";

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

// === Casino CRUD ===

/**
 * Fetches a paginated list of casinos.
 */
export async function getCasinos(
  filters: CasinoListFilters = {},
): Promise<{ items: CasinoDTO[]; cursor?: string }> {
  const params = buildParams(filters);
  const url = params.toString() ? `${BASE}?${params}` : BASE;
  return fetchJSON<{ items: CasinoDTO[]; cursor?: string }>(url);
}

/**
 * Fetches a single casino by ID.
 */
export async function getCasino(id: string): Promise<CasinoDTO> {
  return fetchJSON<CasinoDTO>(`${BASE}/${id}`);
}

/**
 * Creates a new casino.
 * Includes idempotency-key header to prevent duplicate creation.
 */
export async function createCasino(input: CreateCasinoDTO): Promise<CasinoDTO> {
  return fetchJSON<CasinoDTO>(BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

/**
 * Updates an existing casino.
 * Includes idempotency-key header for safe retries.
 */
export async function updateCasino(
  id: string,
  input: UpdateCasinoDTO,
): Promise<CasinoDTO> {
  return fetchJSON<CasinoDTO>(`${BASE}/${id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "idempotency-key": generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

/**
 * Deletes a casino (soft delete recommended).
 * Includes idempotency-key header for safe retries.
 */
export async function deleteCasino(id: string): Promise<void> {
  return fetchJSON<void>(`${BASE}/${id}`, {
    method: "DELETE",
    headers: {
      "idempotency-key": generateIdempotencyKey(),
    },
  });
}

// === Casino Settings ===

/**
 * Fetches settings for the authenticated user's casino.
 * RLS automatically scopes to the user's casino.
 */
export async function getCasinoSettings(): Promise<CasinoSettingsDTO> {
  return fetchJSON<CasinoSettingsDTO>(`${BASE}/settings`);
}

/**
 * Updates settings for the authenticated user's casino.
 * Includes idempotency-key header for safe retries.
 *
 * Warning: Changing timezone or gaming_day_start_time affects all
 * downstream services. UI should warn operators before changes.
 */
export async function updateCasinoSettings(
  input: UpdateCasinoSettingsDTO,
): Promise<CasinoSettingsDTO> {
  return fetchJSON<CasinoSettingsDTO>(`${BASE}/settings`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "idempotency-key": generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

// === Staff ===

/**
 * Fetches a paginated list of staff for the authenticated user's casino.
 * RLS automatically scopes to the user's casino.
 */
export async function getCasinoStaff(
  filters: CasinoStaffFilters = {},
): Promise<{ items: StaffDTO[]; cursor?: string }> {
  const params = buildParams(filters);
  const url = params.toString() ? `${BASE}/staff?${params}` : `${BASE}/staff`;
  return fetchJSON<{ items: StaffDTO[]; cursor?: string }>(url);
}

/**
 * Creates a new staff member.
 * Includes idempotency-key header to prevent duplicate creation.
 *
 * Role constraint enforced:
 * - Dealer: Cannot have user_id (non-authenticated)
 * - Pit Boss/Admin: Must have user_id (authenticated)
 */
export async function createStaff(input: CreateStaffDTO): Promise<StaffDTO> {
  return fetchJSON<StaffDTO>(`${BASE}/staff`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

// === Gaming Day ===

/**
 * Computes the gaming day for a given timestamp.
 * Uses the compute_gaming_day RPC on the server.
 *
 * @param timestamp - Optional ISO 8601 timestamp (defaults to now)
 */
export async function getGamingDay(timestamp?: string): Promise<GamingDayDTO> {
  const params = timestamp ? `?timestamp=${encodeURIComponent(timestamp)}` : "";
  return fetchJSON<GamingDayDTO>(`${BASE}/gaming-day${params}`);
}

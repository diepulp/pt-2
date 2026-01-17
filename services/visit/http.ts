/**
 * VisitService HTTP Fetchers
 *
 * Client-side fetch functions for VisitService API endpoints.
 * Uses fetchJSON from @/lib/http/fetch-json for typed responses.
 * All mutations include idempotency-key header.
 *
 * @see PRD-003 Player & Visit Management
 */

import { fetchJSON } from "@/lib/http/fetch-json";
import { IDEMPOTENCY_HEADER } from "@/lib/http/headers";

import type {
  ActiveVisitDTO,
  CloseVisitDTO,
  StartVisitResultDTO,
  VisitDTO,
  VisitListFilters,
  VisitWithPlayerDTO,
} from "./dtos";

const BASE = "/api/v1/visits";

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

// === Visit CRUD ===

/**
 * Fetches a paginated list of visits.
 */
export async function getVisits(
  filters: VisitListFilters = {},
): Promise<{ items: VisitWithPlayerDTO[]; cursor: string | null }> {
  const params = buildParams(filters);
  const url = params.toString() ? `${BASE}?${params}` : BASE;
  return fetchJSON<{ items: VisitWithPlayerDTO[]; cursor: string | null }>(url);
}

/**
 * Fetches a single visit by ID.
 */
export async function getVisit(visitId: string): Promise<VisitDTO> {
  return fetchJSON<VisitDTO>(`${BASE}/${visitId}`);
}

// === Active Visit ===

/**
 * Gets the active visit for a player (if any).
 */
export async function getActiveVisit(
  playerId: string,
): Promise<ActiveVisitDTO> {
  const params = buildParams({ player_id: playerId });
  return fetchJSON<ActiveVisitDTO>(`${BASE}/active?${params}`);
}

// === Visit Lifecycle ===

/**
 * Starts a visit (check-in) for a player.
 * Idempotent - returns existing active visit if one exists for the current gaming day.
 *
 * ADR-026: Gaming-day-scoped visits.
 * - `resumed`: true if resuming same-day visit
 * - `gamingDay`: ISO date (YYYY-MM-DD) for the visit's gaming day
 *
 * @returns StartVisitResultDTO with visit, isNew, resumed, and gamingDay
 */
export async function startVisit(
  playerId: string,
): Promise<StartVisitResultDTO> {
  return fetchJSON<StartVisitResultDTO>(BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
    },
    body: JSON.stringify({ player_id: playerId }),
  });
}

/**
 * Closes a visit (check-out).
 * Idempotent - succeeds if already closed.
 */
export async function closeVisit(
  visitId: string,
  input?: CloseVisitDTO,
): Promise<VisitDTO> {
  return fetchJSON<VisitDTO>(`${BASE}/${visitId}/close`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
    },
    body: JSON.stringify(input ?? {}),
  });
}

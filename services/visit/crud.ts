/**
 * VisitService CRUD Operations
 *
 * Database operations using type-safe mappers.
 * No `as` assertions; all transformations via mappers.ts.
 *
 * Pattern B (Canonical CRUD) per SLAD section 341-342.
 *
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md section 341-342
 * @see PRD-003B-visit-service-refactor.md section 4.3
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/errors/domain-errors";
import type { Database } from "@/types/database.types";

import type {
  ActiveVisitDTO,
  CloseVisitDTO,
  VisitDTO,
  VisitListFilters,
  VisitWithPlayerDTO,
} from "./dtos";
import {
  toActiveVisitDTO,
  toVisitDTO,
  toVisitDTOOrNull,
  toVisitWithPlayerDTOList,
} from "./mappers";
import {
  ACTIVE_VISIT_SELECT,
  VISIT_SELECT,
  VISIT_WITH_PLAYER_SELECT,
} from "./selects";

// === Error Mapping ===

/**
 * Maps Postgres error codes to domain errors.
 * Prevents raw database errors from leaking to callers.
 */
function mapDatabaseError(error: {
  code?: string;
  message: string;
}): DomainError {
  // 23505 = Unique constraint violation (active visit exists)
  if (error.code === "23505") {
    return new DomainError(
      "UNIQUE_VIOLATION",
      "Player already has an active visit at this casino",
    );
  }

  // 23503 = Foreign key violation (player not found)
  if (error.code === "23503") {
    return new DomainError("PLAYER_NOT_FOUND", "Referenced player not found");
  }

  // PGRST116 = No rows returned (used in update/delete operations)
  if (error.code === "PGRST116") {
    return new DomainError("VISIT_NOT_FOUND", "Visit not found");
  }

  return new DomainError("INTERNAL_ERROR", error.message, { details: error });
}

// === Read Operations ===

/**
 * Get visit by ID.
 * Returns null if not found (maybeSingle pattern).
 */
export async function getVisitById(
  supabase: SupabaseClient<Database>,
  visitId: string,
): Promise<VisitDTO | null> {
  const { data, error } = await supabase
    .from("visit")
    .select(VISIT_SELECT)
    .eq("id", visitId)
    .maybeSingle();

  if (error) throw mapDatabaseError(error);
  return toVisitDTOOrNull(data);
}

/**
 * Get active visit for a player at a specific casino.
 * Returns ActiveVisitDTO with has_active_visit flag.
 */
export async function getActiveVisitForPlayer(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<ActiveVisitDTO> {
  const { data, error } = await supabase
    .from("visit")
    .select(ACTIVE_VISIT_SELECT)
    .eq("player_id", playerId)
    .is("ended_at", null)
    .maybeSingle();

  if (error) throw mapDatabaseError(error);
  return toActiveVisitDTO(data);
}

/**
 * List visits with pagination and filters.
 * RLS scopes results to the casino automatically.
 */
export async function listVisits(
  supabase: SupabaseClient<Database>,
  filters: VisitListFilters = {},
): Promise<{ items: VisitWithPlayerDTO[]; cursor: string | null }> {
  const limit = filters.limit ?? 20;

  let query = supabase
    .from("visit")
    .select(VISIT_WITH_PLAYER_SELECT)
    .order("started_at", { ascending: false })
    .limit(limit + 1);

  // Apply status filter
  if (filters.status === "active") {
    query = query.is("ended_at", null);
  } else if (filters.status === "closed") {
    query = query.not("ended_at", "is", null);
  }

  // Apply player filter
  if (filters.player_id) {
    query = query.eq("player_id", filters.player_id);
  }

  // Apply date range filters
  if (filters.from_date) {
    query = query.gte("started_at", `${filters.from_date}T00:00:00Z`);
  }
  if (filters.to_date) {
    query = query.lte("started_at", `${filters.to_date}T23:59:59Z`);
  }

  // Apply cursor for pagination
  if (filters.cursor) {
    query = query.lt("started_at", filters.cursor);
  }

  const { data, error } = await query;

  if (error) throw mapDatabaseError(error);

  // Handle pagination
  const hasMore = (data?.length ?? 0) > limit;
  const rawItems = hasMore ? data!.slice(0, limit) : (data ?? []);
  const cursor = hasMore
    ? (rawItems[rawItems.length - 1]?.started_at ?? null)
    : null;

  return {
    items: toVisitWithPlayerDTOList(rawItems),
    cursor,
  };
}

// === Write Operations ===

/**
 * Start a visit (check-in) for a player.
 * Idempotent: returns existing active visit if one exists.
 *
 * @param supabase - Supabase client with RLS context
 * @param playerId - Player UUID
 * @param casinoId - Casino UUID (from middleware context)
 */
export async function startVisit(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string,
): Promise<VisitDTO> {
  // Check for existing active visit (idempotency)
  const existing = await getActiveVisitForPlayer(supabase, playerId);
  if (existing.visit) {
    return existing.visit;
  }

  // Create new visit
  // Note: The unique partial index uq_visit_single_active_per_player_casino
  // will prevent race conditions at the database level
  const { data, error } = await supabase
    .from("visit")
    .insert({
      player_id: playerId,
      casino_id: casinoId,
    })
    .select(VISIT_SELECT)
    .single();

  if (error) {
    // Handle unique constraint violation (race condition)
    if (error.code === "23505") {
      // Another visit was created concurrently, fetch it
      const { visit: existingVisit } = await getActiveVisitForPlayer(
        supabase,
        playerId,
      );
      if (existingVisit) {
        return existingVisit;
      }
    }
    throw mapDatabaseError(error);
  }

  return toVisitDTO(data);
}

/**
 * Close a visit (check-out).
 * Idempotent: returns existing visit if already closed.
 *
 * @param supabase - Supabase client with RLS context
 * @param visitId - Visit UUID
 * @param input - Optional end time (defaults to now)
 */
export async function closeVisit(
  supabase: SupabaseClient<Database>,
  visitId: string,
  input: CloseVisitDTO = {},
): Promise<VisitDTO> {
  const endedAt = input.ended_at ?? new Date().toISOString();

  // Attempt to close visit (only if not already closed)
  const { data, error } = await supabase
    .from("visit")
    .update({ ended_at: endedAt })
    .eq("id", visitId)
    .is("ended_at", null) // Only close if not already closed
    .select(VISIT_SELECT)
    .single();

  if (error) {
    // PGRST116 = No rows returned (already closed or not found)
    if (error.code === "PGRST116") {
      // Check if visit exists but is already closed (idempotent success)
      const existing = await getVisitById(supabase, visitId);
      if (existing && existing.ended_at) {
        // Already closed - idempotent success
        return existing;
      }
      // Visit not found
      throw new DomainError("VISIT_NOT_FOUND", `Visit not found: ${visitId}`);
    }
    throw mapDatabaseError(error);
  }

  return toVisitDTO(data);
}

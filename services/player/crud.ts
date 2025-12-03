/**
 * PlayerService CRUD Operations
 *
 * Database operations using type-safe mappers.
 * No `as` assertions; all transformations via mappers.ts.
 *
 * Pattern B (Canonical CRUD) per SLAD §341-342.
 *
 * @see PRD-003A §4.3 - crud.ts specification
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md §341-342
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/errors/domain-errors";
import type { Database } from "@/types/database.types";

import type {
  CreatePlayerDTO,
  PlayerDTO,
  PlayerEnrollmentDTO,
  PlayerListFilters,
  PlayerSearchResultDTO,
  UpdatePlayerDTO,
} from "./dtos";
import {
  toEnrollmentDTO,
  toEnrollmentDTOOrNull,
  toPlayerDTO,
  toPlayerDTOList,
  toPlayerDTOOrNull,
  toPlayerSearchResultDTOList,
} from "./mappers";
import {
  ENROLLMENT_SELECT,
  PLAYER_SEARCH_SELECT,
  PLAYER_SELECT,
} from "./selects";

// === Error Mapping ===

/**
 * Maps Postgres error codes to DomainError.
 * Prevents raw Postgres errors from leaking to callers.
 */
function mapDatabaseError(error: {
  code?: string;
  message: string;
}): DomainError {
  if (error.code === "23505") {
    return new DomainError("PLAYER_ALREADY_EXISTS", "Player already exists");
  }
  if (error.code === "23503") {
    return new DomainError("PLAYER_NOT_FOUND", "Referenced player not found");
  }
  return new DomainError("INTERNAL_ERROR", error.message, { details: error });
}

// === Player CRUD ===

/**
 * Get player by ID.
 * Returns null if not found or not accessible via RLS.
 */
export async function getPlayerById(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<PlayerDTO | null> {
  const { data, error } = await supabase
    .from("player")
    .select(PLAYER_SELECT)
    .eq("id", playerId)
    .maybeSingle();

  if (error) throw mapDatabaseError(error);
  return toPlayerDTOOrNull(data);
}

/**
 * List players with pagination and filters.
 * Uses cursor-based pagination with created_at.
 */
export async function listPlayers(
  supabase: SupabaseClient<Database>,
  filters: PlayerListFilters = {},
): Promise<{ items: PlayerDTO[]; cursor: string | null }> {
  const limit = filters.limit ?? 20;

  let query = supabase
    .from("player")
    .select(PLAYER_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  // Apply search filter if provided
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    query = query.or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`);
  }

  // Apply cursor-based pagination
  if (filters.cursor) {
    query = query.lt("created_at", filters.cursor);
  }

  const { data, error } = await query;

  if (error) throw mapDatabaseError(error);

  // Determine pagination
  const hasMore = (data?.length ?? 0) > limit;
  const items = hasMore ? data!.slice(0, limit) : (data ?? []);
  const cursor = hasMore ? (items[items.length - 1]?.created_at ?? null) : null;

  return {
    items: toPlayerDTOList(items),
    cursor,
  };
}

/**
 * Create a new player profile.
 */
export async function createPlayer(
  supabase: SupabaseClient<Database>,
  input: CreatePlayerDTO,
): Promise<PlayerDTO> {
  const { data, error } = await supabase
    .from("player")
    .insert({
      first_name: input.first_name,
      last_name: input.last_name,
      birth_date: input.birth_date ?? null,
    })
    .select(PLAYER_SELECT)
    .single();

  if (error) throw mapDatabaseError(error);
  return toPlayerDTO(data);
}

/**
 * Update player profile.
 * Only updates fields that are provided (partial update).
 */
export async function updatePlayer(
  supabase: SupabaseClient<Database>,
  playerId: string,
  input: UpdatePlayerDTO,
): Promise<PlayerDTO> {
  const updateData: Record<string, unknown> = {};
  if (input.first_name !== undefined) updateData.first_name = input.first_name;
  if (input.last_name !== undefined) updateData.last_name = input.last_name;
  if (input.birth_date !== undefined) updateData.birth_date = input.birth_date;

  const { data, error } = await supabase
    .from("player")
    .update(updateData)
    .eq("id", playerId)
    .select(PLAYER_SELECT)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new DomainError("PLAYER_NOT_FOUND");
    }
    throw mapDatabaseError(error);
  }

  return toPlayerDTO(data);
}

// === Search ===

/**
 * Search players by name with enrollment status.
 * Uses ILIKE with trigram index for fuzzy matching.
 * RLS automatically scopes to enrolled players via player_casino join.
 */
export async function searchPlayers(
  supabase: SupabaseClient<Database>,
  query: string,
  limit: number = 20,
): Promise<PlayerSearchResultDTO[]> {
  const searchPattern = `%${query}%`;

  const { data, error } = await supabase
    .from("player_casino")
    .select(PLAYER_SEARCH_SELECT)
    .or(
      `player.first_name.ilike.${searchPattern},player.last_name.ilike.${searchPattern}`,
    )
    .limit(limit);

  if (error) throw mapDatabaseError(error);
  return toPlayerSearchResultDTOList(data ?? []);
}

// === Enrollment ===

/**
 * Enroll player in the specified casino.
 * Idempotent - returns existing enrollment if already enrolled.
 */
export async function enrollPlayer(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string,
): Promise<PlayerEnrollmentDTO> {
  // Check if already enrolled (idempotency)
  const existing = await getPlayerEnrollment(supabase, playerId, casinoId);
  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("player_casino")
    .insert({
      player_id: playerId,
      casino_id: casinoId,
      status: "active",
    })
    .select(ENROLLMENT_SELECT)
    .single();

  if (error) {
    // Handle duplicate enrollment (race condition or re-enrollment)
    if (error.code === "23505") {
      const existingEnrollment = await getPlayerEnrollment(
        supabase,
        playerId,
        casinoId,
      );
      if (existingEnrollment) {
        return existingEnrollment;
      }
      throw new DomainError("PLAYER_ENROLLMENT_DUPLICATE");
    }
    throw mapDatabaseError(error);
  }

  return toEnrollmentDTO(data);
}

/**
 * Get player enrollment status in a casino.
 * Returns null if not enrolled.
 */
export async function getPlayerEnrollment(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string,
): Promise<PlayerEnrollmentDTO | null> {
  const { data, error } = await supabase
    .from("player_casino")
    .select(ENROLLMENT_SELECT)
    .eq("player_id", playerId)
    .eq("casino_id", casinoId)
    .maybeSingle();

  if (error) throw mapDatabaseError(error);
  return toEnrollmentDTOOrNull(data);
}

/**
 * Get player enrollment by player ID only (for single-casino context).
 * Returns null if not enrolled. For use when casinoId is in RLS context.
 */
export async function getPlayerEnrollmentByPlayerId(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<PlayerEnrollmentDTO | null> {
  const { data, error } = await supabase
    .from("player_casino")
    .select(ENROLLMENT_SELECT)
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) throw mapDatabaseError(error);
  return toEnrollmentDTOOrNull(data);
}

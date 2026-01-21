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
  CreatePlayerWithContextDTO,
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
 *
 * Uses rpc_create_player SECURITY DEFINER function to bypass transaction
 * isolation issues with connection pooling (ADR-015 Pattern A).
 *
 * @param supabase - Supabase client
 * @param input - Player data with RLS context (casino_id required)
 * @returns Created player DTO
 * @throws DomainError on validation or authorization failure
 *
 * @see ISSUE-EC10252F - RLS Policy Violation Fix
 * @see ADR-015 Pattern A (SECURITY DEFINER RPCs)
 */
export async function createPlayer(
  supabase: SupabaseClient<Database>,
  input: CreatePlayerWithContextDTO,
): Promise<PlayerDTO> {
  // Use RPC for transaction-safe creation with RLS context
  const { data, error } = await supabase.rpc("rpc_create_player", {
    p_casino_id: input.casino_id,
    p_first_name: input.first_name,
    p_last_name: input.last_name,
    p_birth_date: input.birth_date ?? undefined,
  });

  if (error) {
    // Map RPC-specific error codes
    if (error.message?.includes("Unauthorized")) {
      throw new DomainError("FORBIDDEN", error.message);
    }
    if (error.message?.includes("Actor not found")) {
      throw new DomainError("FORBIDDEN", "Invalid staff context");
    }
    throw mapDatabaseError(error);
  }

  // RPC returns JSONB with camelCase keys, map to PlayerDTO
  // Note: player table has created_at but not updated_at
  // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC JSONB response needs type mapping
  const rpcResult = data as {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: string | null;
    createdAt: string;
  };

  return {
    id: rpcResult.id,
    first_name: rpcResult.firstName,
    last_name: rpcResult.lastName,
    birth_date: rpcResult.birthDate,
    created_at: rpcResult.createdAt,
    middle_name: null,
    email: null,
    phone_number: null,
  };
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
  if (input.middle_name !== undefined)
    updateData.middle_name = input.middle_name;
  if (input.email !== undefined) updateData.email = input.email;
  if (input.phone_number !== undefined)
    updateData.phone_number = input.phone_number;

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
 * Supports multi-word queries (e.g., "John Smith") by matching:
 * - Each word against first_name OR last_name
 * - Prefix matching on first 3 characters for flexibility
 * RLS automatically scopes to enrolled players via !inner join to player_casino.
 */
export async function searchPlayers(
  supabase: SupabaseClient<Database>,
  query: string,
  limit: number = 20,
): Promise<PlayerSearchResultDTO[]> {
  // Split query into words and filter empty strings
  const words = query.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [];
  }

  // Query from player table with !inner join to player_casino for RLS
  let queryBuilder = supabase.from("player").select(PLAYER_SEARCH_SELECT);

  if (words.length === 1) {
    // Single word: match first_name OR last_name with prefix
    const prefix = words[0].length >= 3 ? words[0].substring(0, 3) : words[0];
    const pattern = `${prefix}%`;
    queryBuilder = queryBuilder.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern}`,
    );
  } else {
    // Multiple words: first word matches first_name, second matches last_name (or vice versa)
    const [first, second] = words;
    const firstPrefix = `${first.length >= 3 ? first.substring(0, 3) : first}%`;
    const secondPrefix = `${second.length >= 3 ? second.substring(0, 3) : second}%`;

    // Match: (first_name~first AND last_name~second) OR (first_name~second AND last_name~first)
    queryBuilder = queryBuilder.or(
      `and(first_name.ilike.${firstPrefix},last_name.ilike.${secondPrefix}),` +
        `and(first_name.ilike.${secondPrefix},last_name.ilike.${firstPrefix})`,
    );
  }

  const { data, error } = await queryBuilder.limit(limit);

  if (error) throw mapDatabaseError(error);
  return toPlayerSearchResultDTOList(data ?? []);
}

// === Enrollment ===

/**
 * IMPORTANT (ADR-022 SLAD Fix):
 * Player enrollment is now owned by CasinoService, not PlayerService.
 * Use `enrollPlayer` from `services/casino/crud.ts` instead.
 *
 * Rationale: player_casino table is owned by Casino bounded context.
 * Read operations remain here for convenience.
 *
 * @see services/casino/crud.ts enrollPlayer()
 * @see DOD-022 Section B7 - Bounded Context Ownership
 */

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

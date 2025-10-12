"use server";

/**
 * Player Server Actions
 * Following PT-2 canonical architecture with server action wrapper
 *
 * Provides 6 standardized server actions for player management:
 * - createPlayer: Create new player record
 * - updatePlayer: Update existing player record
 * - deletePlayer: Delete player record
 * - getPlayer: Retrieve single player by ID
 * - getPlayers: List all players
 * - searchPlayers: Search players by query string
 *
 * Each action:
 * - Uses withServerAction() wrapper for error handling and audit logging
 * - Wraps service layer functions that return ServiceResult<T>
 * - Provides standardized error mapping for PostgreSQL errors
 * - Includes audit logging context for production environments
 */

import { withServerAction } from "@/lib/server-actions/with-server-action-wrapper";
import { createClient } from "@/lib/supabase/server";
import { createPlayerService } from "@/services/player";
import type {
  PlayerCreateDTO,
  PlayerUpdateDTO,
  PlayerDTO,
} from "@/services/player";
import type { ServiceResult } from "@/services/shared/types";

/**
 * Create Player Server Action
 *
 * @param data - Player creation data (email, firstName, lastName)
 * @returns ServiceResult<PlayerDTO>
 *
 * Error handling:
 * - UNIQUE_VIOLATION (23505): Duplicate email
 * - VALIDATION_ERROR (23514, 23502): Invalid data or missing required fields
 * - INTERNAL_ERROR (500): Unexpected database errors
 *
 * @example
 * ```typescript
 * const result = await createPlayer({
 *   email: 'player@example.com',
 *   firstName: 'John',
 *   lastName: 'Doe'
 * });
 * ```
 */
export async function createPlayer(
  data: PlayerCreateDTO,
): Promise<ServiceResult<PlayerDTO>> {
  const supabase = await createClient();

  // Get session for audit logging (if available)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return withServerAction(
    async () => {
      const service = createPlayerService(supabase);
      return await service.create(data);
    },
    supabase,
    {
      action: "player.create",
      userId: session?.user?.id,
      entity: "player",
      metadata: { email: data.email },
    },
  );
}

/**
 * Update Player Server Action
 *
 * @param id - Player UUID
 * @param data - Partial player update data (email, firstName, lastName)
 * @returns ServiceResult<PlayerDTO>
 *
 * Error handling:
 * - NOT_FOUND (PGRST116): Player does not exist
 * - UNIQUE_VIOLATION (23505): Email already exists
 * - VALIDATION_ERROR (23514, 23502): Invalid update data
 * - INTERNAL_ERROR (500): Unexpected database errors
 *
 * @example
 * ```typescript
 * const result = await updatePlayer('player-uuid', {
 *   firstName: 'Jane',
 *   lastName: 'Smith'
 * });
 * ```
 */
export async function updatePlayer(
  id: string,
  data: PlayerUpdateDTO,
): Promise<ServiceResult<PlayerDTO>> {
  const supabase = await createClient();

  // Get session for audit logging (if available)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return withServerAction(
    async () => {
      const service = createPlayerService(supabase);
      return await service.update(id, data);
    },
    supabase,
    {
      action: "player.update",
      userId: session?.user?.id,
      entity: "player",
      entityId: id,
      metadata: { updates: Object.keys(data) },
    },
  );
}

/**
 * Delete Player Server Action
 *
 * @param id - Player UUID
 * @returns ServiceResult<void>
 *
 * Error handling:
 * - NOT_FOUND (PGRST116): Player does not exist
 * - FOREIGN_KEY_VIOLATION (23503): Player has related records (cannot delete)
 * - INTERNAL_ERROR (500): Unexpected database errors
 *
 * @example
 * ```typescript
 * const result = await deletePlayer('player-uuid');
 * if (result.success) {
 *   console.log('Player deleted successfully');
 * }
 * ```
 */
export async function deletePlayer(id: string): Promise<ServiceResult<void>> {
  const supabase = await createClient();

  // Get session for audit logging (if available)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return withServerAction(
    async () => {
      const service = createPlayerService(supabase);
      return await service.delete(id);
    },
    supabase,
    {
      action: "player.delete",
      userId: session?.user?.id,
      entity: "player",
      entityId: id,
    },
  );
}

/**
 * Get Player Server Action
 *
 * @param id - Player UUID
 * @returns ServiceResult<PlayerDTO>
 *
 * Error handling:
 * - NOT_FOUND (PGRST116): Player does not exist
 * - INTERNAL_ERROR (500): Unexpected database errors
 *
 * @example
 * ```typescript
 * const result = await getPlayer('player-uuid');
 * if (result.success) {
 *   console.log('Player:', result.data);
 * }
 * ```
 */
export async function getPlayer(id: string): Promise<ServiceResult<PlayerDTO>> {
  const supabase = await createClient();

  // Get session for audit logging (if available)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return withServerAction(
    async () => {
      const service = createPlayerService(supabase);
      return await service.getById(id);
    },
    supabase,
    {
      action: "player.get",
      userId: session?.user?.id,
      entity: "player",
      entityId: id,
    },
  );
}

/**
 * Get Players Server Action
 *
 * @returns ServiceResult<PlayerDTO[]>
 *
 * Retrieves all players ordered by lastName (ascending).
 * Returns empty array if no players exist.
 *
 * Error handling:
 * - INTERNAL_ERROR (500): Unexpected database errors
 *
 * @example
 * ```typescript
 * const result = await getPlayers();
 * if (result.success) {
 *   console.log('Total players:', result.data.length);
 * }
 * ```
 */
export async function getPlayers(): Promise<ServiceResult<PlayerDTO[]>> {
  const supabase = await createClient();

  // Get session for audit logging (if available)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return withServerAction(
    async () => {
      const service = createPlayerService(supabase);
      return await service.list();
    },
    supabase,
    {
      action: "player.list",
      userId: session?.user?.id,
      entity: "player",
    },
  );
}

/**
 * Search Players Server Action
 *
 * @param query - Search query string (matches firstName, lastName, or email)
 * @returns ServiceResult<PlayerDTO[]>
 *
 * Performs case-insensitive ILIKE search across:
 * - firstName
 * - lastName
 * - email
 *
 * Returns empty array if no matches found.
 *
 * Error handling:
 * - INTERNAL_ERROR (500): Unexpected database errors
 *
 * @example
 * ```typescript
 * const result = await searchPlayers('john');
 * if (result.success) {
 *   console.log('Found players:', result.data);
 * }
 * ```
 */
export async function searchPlayers(
  query: string,
): Promise<ServiceResult<PlayerDTO[]>> {
  const supabase = await createClient();

  // Get session for audit logging (if available)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return withServerAction(
    async () => {
      const service = createPlayerService(supabase);
      return await service.search(query);
    },
    supabase,
    {
      action: "player.search",
      userId: session?.user?.id,
      entity: "player",
      metadata: { query },
    },
  );
}

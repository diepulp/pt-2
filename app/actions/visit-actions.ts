"use server";

/**
 * Visit Server Actions
 * Following PT-2 canonical architecture with server action wrapper
 *
 * Provides 6 standardized server actions for visit management:
 * - createVisit: Create new visit record
 * - updateVisit: Update existing visit record
 * - deleteVisit: Delete visit record
 * - getVisit: Retrieve single visit by ID
 * - getVisits: List visits with optional filters
 * - searchVisits: Search visits by query string
 *
 * Each action:
 * - Uses withServerAction() wrapper for error handling and audit logging
 * - Wraps service layer functions that return ServiceResult<T>
 * - Provides standardized error mapping for PostgreSQL errors
 * - Includes audit logging context for production environments
 */

import { withServerAction } from "@/lib/server-actions/with-server-action-wrapper";
import { createClient } from "@/lib/supabase/server";
import type { ServiceResult } from "@/services/shared/types";
import { createVisitService } from "@/services/visit";
import type {
  VisitCreateDTO,
  VisitUpdateDTO,
  VisitDTO,
  VisitFilters,
} from "@/services/visit";

/**
 * Create Visit Server Action
 *
 * @param data - Visit creation data (playerId, casinoId, checkInDate, mode, status)
 * @returns ServiceResult<VisitDTO>
 *
 * Error handling:
 * - FOREIGN_KEY_VIOLATION (23503): Invalid playerId or casinoId reference
 * - VALIDATION_ERROR (23514, 23502): Invalid data or missing required fields
 * - UNIQUE_VIOLATION (23505): Duplicate visit record (if constraints exist)
 * - INTERNAL_ERROR (500): Unexpected database errors
 *
 * @example
 * ```typescript
 * const result = await createVisit({
 *   playerId: 'player-uuid',
 *   casinoId: 'casino-uuid',
 *   checkInDate: '2025-10-12T10:00:00Z',
 *   mode: 'poker',
 *   status: 'active'
 * });
 * ```
 */
export async function createVisit(
  data: VisitCreateDTO,
): Promise<ServiceResult<VisitDTO>> {
  const supabase = await createClient();

  // Get session for audit logging (if available)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return withServerAction(
    async () => {
      const service = createVisitService(supabase);
      return await service.create(data);
    },
    supabase,
    {
      action: "visit.create",
      userId: session?.user?.id,
      entity: "visit",
      metadata: {
        playerId: data.playerId,
        casinoId: data.casinoId,
        checkInDate: data.checkInDate,
      },
    },
  );
}

/**
 * Update Visit Server Action
 *
 * @param id - Visit UUID
 * @param data - Partial visit update data (checkOutDate, mode, status)
 * @returns ServiceResult<VisitDTO>
 *
 * Error handling:
 * - NOT_FOUND (PGRST116): Visit does not exist
 * - VALIDATION_ERROR (23514, 23502): Invalid update data
 * - INTERNAL_ERROR (500): Unexpected database errors
 *
 * @example
 * ```typescript
 * const result = await updateVisit('visit-uuid', {
 *   checkOutDate: '2025-10-12T14:00:00Z',
 *   status: 'completed'
 * });
 * ```
 */
export async function updateVisit(
  id: string,
  data: VisitUpdateDTO,
): Promise<ServiceResult<VisitDTO>> {
  const supabase = await createClient();

  // Get session for audit logging (if available)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return withServerAction(
    async () => {
      const service = createVisitService(supabase);
      return await service.update(id, data);
    },
    supabase,
    {
      action: "visit.update",
      userId: session?.user?.id,
      entity: "visit",
      entityId: id,
      metadata: { updates: Object.keys(data) },
    },
  );
}

/**
 * Delete Visit Server Action
 *
 * @param id - Visit UUID
 * @returns ServiceResult<void>
 *
 * Error handling:
 * - NOT_FOUND (PGRST116): Visit does not exist
 * - FOREIGN_KEY_VIOLATION (23503): Visit has related records (cannot delete)
 * - INTERNAL_ERROR (500): Unexpected database errors
 *
 * @example
 * ```typescript
 * const result = await deleteVisit('visit-uuid');
 * if (result.success) {
 *   console.log('Visit deleted successfully');
 * }
 * ```
 */
export async function deleteVisit(id: string): Promise<ServiceResult<void>> {
  const supabase = await createClient();

  // Get session for audit logging (if available)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return withServerAction(
    async () => {
      const service = createVisitService(supabase);
      return await service.delete(id);
    },
    supabase,
    {
      action: "visit.delete",
      userId: session?.user?.id,
      entity: "visit",
      entityId: id,
    },
  );
}

/**
 * Get Visit Server Action
 *
 * @param id - Visit UUID
 * @returns ServiceResult<VisitDTO>
 *
 * Error handling:
 * - NOT_FOUND (PGRST116): Visit does not exist
 * - INTERNAL_ERROR (500): Unexpected database errors
 *
 * @example
 * ```typescript
 * const result = await getVisit('visit-uuid');
 * if (result.success) {
 *   console.log('Visit:', result.data);
 * }
 * ```
 */
export async function getVisit(id: string): Promise<ServiceResult<VisitDTO>> {
  const supabase = await createClient();

  // Get session for audit logging (if available)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return withServerAction(
    async () => {
      const service = createVisitService(supabase);
      return await service.getById(id);
    },
    supabase,
    {
      action: "visit.get",
      userId: session?.user?.id,
      entity: "visit",
      entityId: id,
    },
  );
}

/**
 * Get Visits Server Action
 *
 * @param filters - Optional filters (playerId, casinoId, status, mode)
 * @returns ServiceResult<VisitDTO[]>
 *
 * Retrieves visits with optional filtering by player, casino, status, or mode.
 * Results are ordered by check-in date (descending).
 * Returns empty array if no visits match the criteria.
 *
 * Error handling:
 * - INTERNAL_ERROR (500): Unexpected database errors
 *
 * @example
 * ```typescript
 * const result = await getVisits({
 *   playerId: 'player-uuid',
 *   status: 'active'
 * });
 * if (result.success) {
 *   console.log('Total visits:', result.data.length);
 * }
 * ```
 */
export async function getVisits(
  filters?: VisitFilters,
): Promise<ServiceResult<VisitDTO[]>> {
  const supabase = await createClient();

  // Get session for audit logging (if available)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return withServerAction(
    async () => {
      const service = createVisitService(supabase);
      return await service.list(filters);
    },
    supabase,
    {
      action: "visit.list",
      userId: session?.user?.id,
      entity: "visit",
      metadata: filters
        ? {
            playerId: filters.playerId,
            casinoId: filters.casinoId,
            status: filters.status,
            mode: filters.mode,
          }
        : undefined,
    },
  );
}

/**
 * Search Visits Server Action
 *
 * @param query - Search query string (matches player name or email)
 * @returns ServiceResult<VisitDTO[]>
 *
 * Performs case-insensitive ILIKE search across:
 * - Player first name (via join)
 * - Player last name (via join)
 * - Player email (via join)
 *
 * Returns empty array if no matches found.
 *
 * Error handling:
 * - INTERNAL_ERROR (500): Unexpected database errors
 *
 * @example
 * ```typescript
 * const result = await searchVisits('john');
 * if (result.success) {
 *   console.log('Found visits:', result.data);
 * }
 * ```
 */
export async function searchVisits(
  query: string,
): Promise<ServiceResult<VisitDTO[]>> {
  const supabase = await createClient();

  // Get session for audit logging (if available)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return withServerAction(
    async () => {
      const service = createVisitService(supabase);
      return await service.search(query);
    },
    supabase,
    {
      action: "visit.search",
      userId: session?.user?.id,
      entity: "visit",
      metadata: { query },
    },
  );
}

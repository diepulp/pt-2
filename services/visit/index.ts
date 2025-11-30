/**
 * VisitService
 *
 * Service factory for visit lifecycle management (check-in/check-out).
 * Follows functional factory pattern (no classes).
 *
 * Key invariants:
 * - A player can only have ONE active visit per casino at a time
 * - startVisit is idempotent (returns existing active visit if present)
 * - closeVisit sets ended_at timestamp
 *
 * @see PRD-003 Player & Visit Management
 * @see SERVICE_RESPONSIBILITY_MATRIX.md §814-888
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import type {
  ActiveVisitDTO,
  CloseVisitDTO,
  VisitDTO,
  VisitListFilters,
  VisitWithPlayerDTO,
} from "./dtos";

// === Select Projections ===

const VISIT_SELECT = "id, player_id, casino_id, started_at, ended_at";
const VISIT_WITH_PLAYER_SELECT = `
  id, player_id, casino_id, started_at, ended_at,
  player:player_id (id, first_name, last_name)
`;

// === Service Interface ===

/**
 * VisitService interface - explicit, no ReturnType inference.
 */
export interface VisitServiceInterface {
  /**
   * List visits with pagination and filters.
   * RLS scopes results to the casino.
   */
  list(filters?: VisitListFilters): Promise<{
    items: VisitWithPlayerDTO[];
    cursor: string | null;
  }>;

  /**
   * Get visit by ID.
   * Returns null if not found.
   */
  getById(visitId: string): Promise<VisitDTO | null>;

  /**
   * Get active visit for a player (if any).
   * Returns null if player has no active visit.
   */
  getActiveForPlayer(playerId: string): Promise<ActiveVisitDTO>;

  /**
   * Start a visit (check-in) for a player.
   * Idempotent - returns existing active visit if one exists.
   */
  startVisit(playerId: string): Promise<VisitDTO>;

  /**
   * Close a visit (check-out).
   * Sets ended_at to current time or provided timestamp.
   */
  closeVisit(visitId: string, input?: CloseVisitDTO): Promise<VisitDTO>;
}

// === Service Factory ===

/**
 * Creates a VisitService instance.
 *
 * @param supabase - Supabase client with RLS context set
 */
export function createVisitService(
  supabase: SupabaseClient<Database>,
): VisitServiceInterface {
  /**
   * Helper to get casino_id from RLS context.
   */
  async function getCasinoIdFromContext(): Promise<string> {
    // Get casino_id from any casino-scoped table
    const { data } = await supabase
      .from("visit")
      .select("casino_id")
      .limit(1)
      .maybeSingle();

    if (data?.casino_id) {
      return data.casino_id;
    }

    // Fallback: try staff table
    const { data: staffData } = await supabase
      .from("staff")
      .select("casino_id")
      .limit(1)
      .maybeSingle();

    if (!staffData?.casino_id) {
      throw new Error("Unable to determine casino context");
    }

    return staffData.casino_id;
  }

  return {
    async list(filters = {}) {
      const limit = filters.limit ?? 20;

      let query = supabase
        .from("visit")
        .select(VISIT_WITH_PLAYER_SELECT)
        .order("started_at", { ascending: false })
        .limit(limit + 1);

      // Filter by player
      if (filters.player_id) {
        query = query.eq("player_id", filters.player_id);
      }

      // Filter by status
      if (filters.status === "active") {
        query = query.is("ended_at", null);
      } else if (filters.status === "closed") {
        query = query.not("ended_at", "is", null);
      }

      // Filter by date range
      if (filters.from_date) {
        query = query.gte("started_at", `${filters.from_date}T00:00:00Z`);
      }
      if (filters.to_date) {
        query = query.lte("started_at", `${filters.to_date}T23:59:59Z`);
      }

      // Cursor-based pagination
      if (filters.cursor) {
        query = query.lt("started_at", filters.cursor);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      // Transform and paginate
      const hasMore = (data?.length ?? 0) > limit;
      const rawItems = hasMore ? data!.slice(0, limit) : (data ?? []);
      const cursor = hasMore ? rawItems[rawItems.length - 1]?.started_at : null;

      // Map to VisitWithPlayerDTO
      const items = rawItems.map((row) => ({
        id: row.id,
        player_id: row.player_id,
        casino_id: row.casino_id,
        started_at: row.started_at,
        ended_at: row.ended_at,
        // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Supabase join returns typed player
        player: row.player as {
          id: string;
          first_name: string;
          last_name: string;
        },
      }));

      return { items, cursor };
    },

    async getById(visitId) {
      const { data, error } = await supabase
        .from("visit")
        .select(VISIT_SELECT)
        .eq("id", visitId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data as VisitDTO | null;
    },

    async getActiveForPlayer(playerId) {
      const { data, error } = await supabase
        .from("visit")
        .select(VISIT_SELECT)
        .eq("player_id", playerId)
        .is("ended_at", null)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return {
        has_active_visit: data !== null,
        visit: data as VisitDTO | null,
      };
    },

    async startVisit(playerId) {
      // Check for existing active visit (idempotency)
      const { has_active_visit, visit } =
        await this.getActiveForPlayer(playerId);

      if (has_active_visit && visit) {
        // Return existing active visit
        return visit;
      }

      // Get casino_id from context
      const casinoId = await getCasinoIdFromContext();

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
          const { visit: existingVisit } =
            await this.getActiveForPlayer(playerId);
          if (existingVisit) {
            return existingVisit;
          }
        }
        throw error;
      }

      // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Supabase .single() returns typed row
      return data as VisitDTO;
    },

    async closeVisit(visitId, input = {}) {
      const endedAt = input.ended_at ?? new Date().toISOString();

      const { data, error } = await supabase
        .from("visit")
        .update({ ended_at: endedAt })
        .eq("id", visitId)
        .is("ended_at", null) // Only close if not already closed
        .select(VISIT_SELECT)
        .single();

      if (error) {
        // PGRST116 = no rows returned (already closed or not found)
        if (error.code === "PGRST116") {
          // Check if visit exists but is already closed
          const existing = await this.getById(visitId);
          if (existing && existing.ended_at) {
            // Already closed - idempotent success
            return existing;
          }
          // Visit not found
          throw new Error(`Visit not found: ${visitId}`);
        }
        throw error;
      }

      // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Supabase .single() returns typed row
      return data as VisitDTO;
    },
  };
}

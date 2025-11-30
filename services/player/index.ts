/**
 * PlayerService
 *
 * Service factory for player profile, search, and enrollment operations.
 * Follows functional factory pattern (no classes).
 *
 * @see PRD-003 Player & Visit Management
 * @see SERVICE_RESPONSIBILITY_MATRIX.md §814-888
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import type {
  CreatePlayerDTO,
  PlayerDTO,
  PlayerEnrollmentDTO,
  PlayerListFilters,
  PlayerSearchResultDTO,
  UpdatePlayerDTO,
} from "./dtos";

// === Select Projections ===

const PLAYER_SELECT = "id, first_name, last_name, birth_date, created_at";
const ENROLLMENT_SELECT = "player_id, casino_id, status, enrolled_at";

// === Service Interface ===

/**
 * PlayerService interface - explicit, no ReturnType inference.
 */
export interface PlayerServiceInterface {
  /**
   * Search players by name with enrollment status.
   * Uses trigram matching for fuzzy search.
   * RLS scopes results to enrolled players in the casino.
   */
  search(query: string, limit?: number): Promise<PlayerSearchResultDTO[]>;

  /**
   * List players with pagination and filters.
   */
  list(filters?: PlayerListFilters): Promise<{
    items: PlayerDTO[];
    cursor: string | null;
  }>;

  /**
   * Get player by ID.
   * Returns null if not found or not enrolled in casino.
   */
  getById(playerId: string): Promise<PlayerDTO | null>;

  /**
   * Create a new player profile.
   */
  create(data: CreatePlayerDTO): Promise<PlayerDTO>;

  /**
   * Update player profile.
   */
  update(playerId: string, data: UpdatePlayerDTO): Promise<PlayerDTO>;

  /**
   * Enroll player in the specified casino.
   * Idempotent - returns existing enrollment if already enrolled.
   */
  enroll(playerId: string, casinoId: string): Promise<PlayerEnrollmentDTO>;

  /**
   * Get player enrollment status in current casino.
   * Returns null if not enrolled.
   */
  getEnrollment(playerId: string): Promise<PlayerEnrollmentDTO | null>;
}

// === Service Factory ===

/**
 * Creates a PlayerService instance.
 *
 * @param supabase - Supabase client with RLS context set
 */
export function createPlayerService(
  supabase: SupabaseClient<Database>,
): PlayerServiceInterface {
  return {
    async search(query, limit = 20) {
      // Search uses ILIKE with trigram index for fuzzy matching
      // RLS automatically scopes to enrolled players via player_casino join
      const searchPattern = `%${query}%`;

      const { data, error } = await supabase
        .from("player_casino")
        .select(
          `
          player:player_id (
            id,
            first_name,
            last_name
          ),
          status
        `,
        )
        .or(
          `player.first_name.ilike.${searchPattern},player.last_name.ilike.${searchPattern}`,
        )
        .limit(limit);

      if (error) {
        throw error;
      }

      // Transform to PlayerSearchResultDTO
      return (data ?? [])
        .filter((row) => row.player !== null)
        .map((row) => {
          // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Supabase join returns typed player
          const player = row.player as {
            id: string;
            first_name: string;
            last_name: string;
          };
          return {
            id: player.id,
            first_name: player.first_name,
            last_name: player.last_name,
            full_name: `${player.first_name} ${player.last_name}`,
            enrollment_status:
              row.status === "active"
                ? ("enrolled" as const)
                : ("not_enrolled" as const),
          };
        });
    },

    async list(filters = {}) {
      const limit = filters.limit ?? 20;

      let query = supabase
        .from("player")
        .select(PLAYER_SELECT)
        .order("created_at", { ascending: false })
        .limit(limit + 1);

      // Apply search filter if provided
      if (filters.q) {
        const pattern = `%${filters.q}%`;
        query = query.or(
          `first_name.ilike.${pattern},last_name.ilike.${pattern}`,
        );
      }

      // Apply cursor-based pagination
      if (filters.cursor) {
        query = query.lt("created_at", filters.cursor);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      // Determine pagination
      const hasMore = (data?.length ?? 0) > limit;
      const items = hasMore ? data!.slice(0, limit) : (data ?? []);
      const cursor = hasMore ? items[items.length - 1]?.created_at : null;

      return {
        items: items as PlayerDTO[],
        cursor,
      };
    },

    async getById(playerId) {
      const { data, error } = await supabase
        .from("player")
        .select(PLAYER_SELECT)
        .eq("id", playerId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data as PlayerDTO | null;
    },

    async create(input) {
      const { data, error } = await supabase
        .from("player")
        .insert({
          first_name: input.first_name,
          last_name: input.last_name,
          birth_date: input.birth_date ?? null,
        })
        .select(PLAYER_SELECT)
        .single();

      if (error) {
        throw error;
      }

      // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Supabase .single() returns typed row
      return data as PlayerDTO;
    },

    async update(playerId, input) {
      // Build update object with only provided fields
      const updateData: Record<string, unknown> = {};
      if (input.first_name !== undefined) {
        updateData.first_name = input.first_name;
      }
      if (input.last_name !== undefined) {
        updateData.last_name = input.last_name;
      }
      if (input.birth_date !== undefined) {
        updateData.birth_date = input.birth_date;
      }

      const { data, error } = await supabase
        .from("player")
        .update(updateData)
        .eq("id", playerId)
        .select(PLAYER_SELECT)
        .single();

      if (error) {
        throw error;
      }

      // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Supabase .single() returns typed row
      return data as PlayerDTO;
    },

    async enroll(playerId, casinoId) {
      // Check if already enrolled (idempotency)
      const existing = await this.getEnrollment(playerId);
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
          const existingEnrollment = await this.getEnrollment(playerId);
          if (existingEnrollment) {
            return existingEnrollment;
          }
        }
        throw error;
      }

      // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Supabase .single() returns typed row
      return data as PlayerEnrollmentDTO;
    },

    async getEnrollment(playerId) {
      const { data, error } = await supabase
        .from("player_casino")
        .select(ENROLLMENT_SELECT)
        .eq("player_id", playerId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data as PlayerEnrollmentDTO | null;
    },
  };
}

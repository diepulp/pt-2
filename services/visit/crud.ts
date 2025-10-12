/**
 * Visit CRUD Module
 * Following PT-2 canonical service architecture
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { executeOperation } from "../shared/operation-wrapper";
import type { ServiceResult } from "../shared/types";

export interface VisitCreateDTO {
  playerId: string;
  casinoId: string;
  checkInDate: string;
  mode?: Database["public"]["Enums"]["VisitMode"];
  status?: Database["public"]["Enums"]["VisitStatus"];
}

export interface VisitUpdateDTO {
  checkOutDate?: string;
  mode?: Database["public"]["Enums"]["VisitMode"];
  status?: Database["public"]["Enums"]["VisitStatus"];
}

export interface VisitFilters {
  playerId?: string;
  casinoId?: string;
  status?: Database["public"]["Enums"]["VisitStatus"];
  mode?: Database["public"]["Enums"]["VisitMode"];
}

export type VisitDTO = Pick<
  Database["public"]["Tables"]["visit"]["Row"],
  | "id"
  | "player_id"
  | "casino_id"
  | "check_in_date"
  | "check_out_date"
  | "mode"
  | "status"
>;

export function createVisitCrudService(supabase: SupabaseClient<Database>) {
  return {
    create: async (data: VisitCreateDTO): Promise<ServiceResult<VisitDTO>> => {
      return executeOperation<VisitDTO>("create_visit", async () => {
        const { data: visit, error } = await supabase
          .from("visit")
          .insert({
            player_id: data.playerId,
            casino_id: data.casinoId,
            check_in_date: data.checkInDate,
            ...(data.mode && { mode: data.mode }),
            ...(data.status && { status: data.status }),
          })
          .select(
            "id, player_id, casino_id, check_in_date, check_out_date, mode, status",
          )
          .single();

        if (error) {
          // Check for foreign key violation (player_id or casino_id not found)
          if (error.code === "23503") {
            throw {
              code: "FOREIGN_KEY_VIOLATION",
              message: "Referenced player or casino does not exist",
              details: error,
            };
          }
          throw error;
        }

        return visit;
      });
    },

    getById: async (id: string): Promise<ServiceResult<VisitDTO>> => {
      return executeOperation<VisitDTO>("get_visit_by_id", async () => {
        const { data: visit, error } = await supabase
          .from("visit")
          .select(
            "id, player_id, casino_id, check_in_date, check_out_date, mode, status",
          )
          .eq("id", id)
          .single();

        if (error) {
          // Check for not found error (PGRST116)
          if (error.code === "PGRST116") {
            throw {
              code: "NOT_FOUND",
              message: "Visit not found",
              details: error,
            };
          }
          throw error;
        }

        return visit;
      });
    },

    update: async (
      id: string,
      data: VisitUpdateDTO,
    ): Promise<ServiceResult<VisitDTO>> => {
      return executeOperation<VisitDTO>("update_visit", async () => {
        const { data: visit, error } = await supabase
          .from("visit")
          .update({
            ...(data.checkOutDate !== undefined && {
              check_out_date: data.checkOutDate,
            }),
            ...(data.mode !== undefined && { mode: data.mode }),
            ...(data.status !== undefined && { status: data.status }),
          })
          .eq("id", id)
          .select(
            "id, player_id, casino_id, check_in_date, check_out_date, mode, status",
          )
          .single();

        if (error) {
          // Check for not found error (PGRST116)
          if (error.code === "PGRST116") {
            throw {
              code: "NOT_FOUND",
              message: "Visit not found",
              details: error,
            };
          }
          throw error;
        }

        return visit;
      });
    },

    /**
     * Delete a visit by ID
     * @param id - Visit UUID
     * @returns ServiceResult<void>
     */
    delete: async (id: string): Promise<ServiceResult<void>> => {
      return executeOperation<void>("delete_visit", async () => {
        const { error } = await supabase.from("visit").delete().eq("id", id);

        if (error) {
          // Check for FK violation (related records exist)
          if (error.code === "23503") {
            throw {
              code: "FOREIGN_KEY_VIOLATION",
              message:
                "Cannot delete visit with related records (rating slips, rewards, etc.)",
              details: error,
            };
          }
          throw error;
        }
      });
    },

    /**
     * List all visits with optional filters
     * @param filters - Optional filter criteria
     * @returns ServiceResult<VisitDTO[]>
     */
    list: async (
      filters?: VisitFilters,
    ): Promise<ServiceResult<VisitDTO[]>> => {
      return executeOperation<VisitDTO[]>("list_visits", async () => {
        let query = supabase
          .from("visit")
          .select(
            "id, player_id, casino_id, check_in_date, check_out_date, mode, status",
          )
          .order("check_in_date", { ascending: false });

        // Apply filters
        if (filters?.playerId) query = query.eq("player_id", filters.playerId);
        if (filters?.casinoId) query = query.eq("casino_id", filters.casinoId);
        if (filters?.status) query = query.eq("status", filters.status);
        if (filters?.mode) query = query.eq("mode", filters.mode);

        const { data, error } = await query;

        if (error) throw error;
        return data || [];
      });
    },

    /**
     * Search visits by player information
     * @param query - Search query string
     * @returns ServiceResult<VisitDTO[]>
     */
    search: async (query: string): Promise<ServiceResult<VisitDTO[]>> => {
      return executeOperation<VisitDTO[]>("search_visits", async () => {
        const { data, error } = await supabase
          .from("visit")
          .select(
            `
            id,
            player_id,
            casino_id,
            check_in_date,
            check_out_date,
            mode,
            status,
            player:player_id (firstName, lastName, email)
          `,
          )
          .or(
            `player.firstName.ilike.%${query}%,player.lastName.ilike.%${query}%,player.email.ilike.%${query}%`,
          )
          .order("check_in_date", { ascending: false });

        if (error) throw error;
        return data || [];
      });
    },
  };
}

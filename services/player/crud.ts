/**
 * Player CRUD Module
 * Following PT-2 canonical service architecture
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { executeOperation } from "../shared/operation-wrapper";
import type { ServiceResult } from "../shared/types";

export interface PlayerCreateDTO {
  email: string;
  firstName: string;
  lastName: string;
}

export interface PlayerUpdateDTO {
  email?: string;
  firstName?: string;
  lastName?: string;
}

export type PlayerDTO = Pick<
  Database["public"]["Tables"]["player"]["Row"],
  "id" | "email" | "firstName" | "lastName"
>;

export function createPlayerCrudService(supabase: SupabaseClient<Database>) {
  return {
    create: async (
      data: PlayerCreateDTO,
    ): Promise<ServiceResult<PlayerDTO>> => {
      return executeOperation<PlayerDTO>("create_player", async () => {
        const { data: player, error } = await supabase
          .from("player")
          .insert({
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
          })
          .select("id, email, firstName, lastName")
          .single();

        if (error) {
          // Check for unique constraint violation (duplicate email)
          if (error.code === "23505") {
            throw {
              code: "DUPLICATE_EMAIL",
              message: "A player with this email already exists",
              details: error,
            };
          }
          throw error;
        }

        return player;
      });
    },

    getById: async (id: string): Promise<ServiceResult<PlayerDTO>> => {
      return executeOperation<PlayerDTO>("get_player_by_id", async () => {
        const { data: player, error } = await supabase
          .from("player")
          .select("id, email, firstName, lastName")
          .eq("id", id)
          .single();

        if (error) {
          // Check for not found error (PGRST116)
          if (error.code === "PGRST116") {
            throw {
              code: "NOT_FOUND",
              message: "Player not found",
              details: error,
            };
          }
          throw error;
        }

        return player;
      });
    },

    update: async (
      id: string,
      data: PlayerUpdateDTO,
    ): Promise<ServiceResult<PlayerDTO>> => {
      return executeOperation<PlayerDTO>("update_player", async () => {
        const { data: player, error } = await supabase
          .from("player")
          .update({
            ...(data.email !== undefined && { email: data.email }),
            ...(data.firstName !== undefined && { firstName: data.firstName }),
            ...(data.lastName !== undefined && { lastName: data.lastName }),
          })
          .eq("id", id)
          .select("id, email, firstName, lastName")
          .single();

        if (error) {
          // Check for not found error (PGRST116)
          if (error.code === "PGRST116") {
            throw {
              code: "NOT_FOUND",
              message: "Player not found",
              details: error,
            };
          }
          // Check for unique constraint violation (duplicate email)
          if (error.code === "23505") {
            throw {
              code: "DUPLICATE_EMAIL",
              message: "A player with this email already exists",
              details: error,
            };
          }
          throw error;
        }

        return player;
      });
    },
  };
}

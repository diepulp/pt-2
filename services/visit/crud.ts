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
  };
}

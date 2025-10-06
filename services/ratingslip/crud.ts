/**
 * RatingSlip CRUD Module
 * Following PT-2 canonical service architecture
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { executeOperation } from "../shared/operation-wrapper";
import type { ServiceResult } from "../shared/types";

export interface RatingSlipCreateDTO {
  playerId: string;
  visitId: string;
  averageBet: number;
  gameSettings: Record<string, unknown>;
  startTime: string;
  gamingTableId?: string;
  gameSettingsId?: string;
  seatNumber?: number;
  cashIn?: number;
  chipsBrought?: number;
}

export interface RatingSlipUpdateDTO {
  averageBet?: number;
  status?: Database["public"]["Enums"]["RatingSlipStatus"];
  endTime?: string;
  chipsTaken?: number;
  seatNumber?: number;
}

export type RatingSlipDTO = Pick<
  Database["public"]["Tables"]["ratingslip"]["Row"],
  | "id"
  | "playerId"
  | "visit_id"
  | "gaming_table_id"
  | "average_bet"
  | "points"
  | "status"
  | "start_time"
  | "end_time"
  | "seat_number"
  | "accumulated_seconds"
  | "cash_in"
  | "chips_brought"
  | "chips_taken"
>;

export function createRatingSlipCrudService(
  supabase: SupabaseClient<Database>,
) {
  return {
    create: async (
      data: RatingSlipCreateDTO,
    ): Promise<ServiceResult<RatingSlipDTO>> => {
      return executeOperation<RatingSlipDTO>("create_ratingslip", async () => {
        // Generate UUID for id field
        const id = crypto.randomUUID();

        const { data: ratingSlip, error } = await supabase
          .from("ratingslip")
          .insert({
            id,
            playerId: data.playerId,
            visit_id: data.visitId,
            average_bet: data.averageBet,
            game_settings: data.gameSettings,
            start_time: data.startTime,
            ...(data.gamingTableId && { gaming_table_id: data.gamingTableId }),
            ...(data.gameSettingsId && {
              game_settings_id: data.gameSettingsId,
            }),
            ...(data.seatNumber && { seat_number: data.seatNumber }),
            ...(data.cashIn !== undefined && { cash_in: data.cashIn }),
            ...(data.chipsBrought !== undefined && {
              chips_brought: data.chipsBrought,
            }),
          })
          .select(
            "id, playerId, visit_id, gaming_table_id, average_bet, points, status, start_time, end_time, seat_number, accumulated_seconds, cash_in, chips_brought, chips_taken",
          )
          .single();

        if (error) {
          // Check for foreign key violation (playerId, visit_id, gaming_table_id)
          if (error.code === "23503") {
            throw {
              code: "FOREIGN_KEY_VIOLATION",
              message:
                "Referenced player, visit, or gaming table does not exist",
              details: error,
            };
          }
          // Check for NOT NULL violation (likely missing required field)
          if (error.code === "23502") {
            throw {
              code: "NOT_NULL_VIOLATION",
              message: "Required field is missing",
              details: error,
            };
          }
          throw error;
        }

        return ratingSlip;
      });
    },

    getById: async (id: string): Promise<ServiceResult<RatingSlipDTO>> => {
      return executeOperation<RatingSlipDTO>(
        "get_ratingslip_by_id",
        async () => {
          const { data: ratingSlip, error } = await supabase
            .from("ratingslip")
            .select(
              "id, playerId, visit_id, gaming_table_id, average_bet, points, status, start_time, end_time, seat_number, accumulated_seconds, cash_in, chips_brought, chips_taken",
            )
            .eq("id", id)
            .single();

          if (error) {
            // Check for not found error (PGRST116)
            if (error.code === "PGRST116") {
              throw {
                code: "NOT_FOUND",
                message: "RatingSlip not found",
                details: error,
              };
            }
            throw error;
          }

          return ratingSlip;
        },
      );
    },

    update: async (
      id: string,
      data: RatingSlipUpdateDTO,
    ): Promise<ServiceResult<RatingSlipDTO>> => {
      return executeOperation<RatingSlipDTO>("update_ratingslip", async () => {
        const { data: ratingSlip, error } = await supabase
          .from("ratingslip")
          .update({
            ...(data.averageBet !== undefined && {
              average_bet: data.averageBet,
            }),
            ...(data.status !== undefined && { status: data.status }),
            ...(data.endTime !== undefined && { end_time: data.endTime }),
            ...(data.chipsTaken !== undefined && {
              chips_taken: data.chipsTaken,
            }),
            ...(data.seatNumber !== undefined && {
              seat_number: data.seatNumber,
            }),
          })
          .eq("id", id)
          .select(
            "id, playerId, visit_id, gaming_table_id, average_bet, points, status, start_time, end_time, seat_number, accumulated_seconds, cash_in, chips_brought, chips_taken",
          )
          .single();

        if (error) {
          // Check for not found error (PGRST116)
          if (error.code === "PGRST116") {
            throw {
              code: "NOT_FOUND",
              message: "RatingSlip not found",
              details: error,
            };
          }
          throw error;
        }

        return ratingSlip;
      });
    },
  };
}

/**
 * RatingSlip CRUD Module - SIMPLIFIED (KISS + YAGNI)
 * Following PT-2 canonical service architecture
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { executeOperation } from "../shared/operation-wrapper";
import type { ServiceResult } from "../shared/types";

// ✅ Simplified: MVP-critical fields only
export interface RatingSlipCreateDTO {
  playerId: string;
  visitId: string;
  averageBet: number;
  gameSettings: Database["public"]["Tables"]["ratingslip"]["Insert"]["game_settings"]; // ✅ Use exact Json type
  startTime: string;
  // Optional: Only fields needed at creation
  gamingTableId?: string;
  seatNumber?: number;
}

// ✅ Simplified: Focus on state transitions, not inventory
export interface RatingSlipUpdateDTO {
  averageBet?: number;
  status?: Database["public"]["Enums"]["RatingSlipStatus"];
  endTime?: string;
  seatNumber?: number;
  // Note: Removed cashIn/chipsBrought/chipsTaken (YAGNI - separate inventory domain)
}

// ✅ Simplified DTO: Only expose what clients need
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
  // Note: Removed cash_in, chips_brought, chips_taken from DTO
  //       (not needed for rating slip business logic)
>;

export function createRatingSlipCrudService(
  supabase: SupabaseClient<Database>,
) {
  return {
    create: async (
      data: RatingSlipCreateDTO,
    ): Promise<ServiceResult<RatingSlipDTO>> => {
      return executeOperation<RatingSlipDTO>("create_ratingslip", async () => {
        // ✅ UUID generation still needed (no DB default)
        const id = crypto.randomUUID();

        // ✅ Simplified: Only 3 optional fields instead of 6
        const insertData: Database["public"]["Tables"]["ratingslip"]["Insert"] =
          {
            id,
            playerId: data.playerId,
            visit_id: data.visitId,
            average_bet: data.averageBet,
            game_settings: data.gameSettings, // ✅ Type-safe now
            start_time: data.startTime,
          };

        // ✅ Clearer: Explicit optional field assignment
        if (data.gamingTableId) {
          insertData.gaming_table_id = data.gamingTableId;
        }
        if (data.seatNumber !== undefined) {
          insertData.seat_number = data.seatNumber;
        }

        const { data: ratingSlip, error } = await supabase
          .from("ratingslip")
          .insert(insertData)
          .select(
            "id, playerId, visit_id, gaming_table_id, average_bet, points, status, start_time, end_time, seat_number, accumulated_seconds",
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
              "id, playerId, visit_id, gaming_table_id, average_bet, points, status, start_time, end_time, seat_number, accumulated_seconds",
            )
            .eq("id", id)
            .single();

          if (error) {
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
        // ✅ Simplified: Build update object explicitly
        const updateData: Partial<
          Database["public"]["Tables"]["ratingslip"]["Update"]
        > = {};

        if (data.averageBet !== undefined) {
          updateData.average_bet = data.averageBet;
        }
        if (data.status !== undefined) {
          updateData.status = data.status;
        }
        if (data.endTime !== undefined) {
          updateData.end_time = data.endTime;
        }
        if (data.seatNumber !== undefined) {
          updateData.seat_number = data.seatNumber;
        }

        const { data: ratingSlip, error } = await supabase
          .from("ratingslip")
          .update(updateData)
          .eq("id", id)
          .select(
            "id, playerId, visit_id, gaming_table_id, average_bet, points, status, start_time, end_time, seat_number, accumulated_seconds",
          )
          .single();

        if (error) {
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

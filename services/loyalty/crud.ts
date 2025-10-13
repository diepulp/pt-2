/**
 * Loyalty CRUD Module
 * Following PT-2 canonical service architecture
 *
 * Bounded Context: "Reward policy and loyalty transaction management"
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { executeOperation } from "../shared/operation-wrapper";
import type { ServiceResult } from "../shared/types";

// ──────────────────────────────────────────────────────────────────
// TYPES & DTOS
// ──────────────────────────────────────────────────────────────────

export type PlayerLoyaltyRow =
  Database["public"]["Tables"]["player_loyalty"]["Row"];
export type LoyaltyLedgerRow =
  Database["public"]["Tables"]["LoyaltyLedger"]["Row"];

export type PlayerLoyaltyDTO = Pick<
  PlayerLoyaltyRow,
  | "id"
  | "player_id"
  | "points_balance"
  | "points_earned_total"
  | "points_redeemed_total"
  | "tier"
  | "tier_expires_at"
  | "tier_progress"
  | "achievements"
  | "benefits"
  | "milestones"
  | "created_at"
  | "updated_at"
>;

export interface PlayerLoyaltyCreateDTO {
  player_id: string;
  tier?: string;
  points_balance?: number;
  points_earned_total?: number;
  points_redeemed_total?: number;
  tier_progress?: number;
}

export interface PlayerLoyaltyUpdateDTO {
  points_balance?: number;
  points_earned_total?: number;
  points_redeemed_total?: number;
  tier?: string;
  tier_expires_at?: string | null;
  tier_progress?: number;
  achievements?: Database["public"]["Tables"]["player_loyalty"]["Update"]["achievements"];
  benefits?: Database["public"]["Tables"]["player_loyalty"]["Update"]["benefits"];
  milestones?: Database["public"]["Tables"]["player_loyalty"]["Update"]["milestones"];
}

export type LoyaltyLedgerDTO = Pick<
  LoyaltyLedgerRow,
  | "id"
  | "player_id"
  | "transaction_date"
  | "points"
  | "direction"
  | "description"
  | "balance_after"
  | "metadata"
  | "visit_id"
>;

export interface LoyaltyLedgerCreateDTO {
  player_id: string;
  points: number;
  direction: "CREDIT" | "DEBIT";
  description: string;
  balance_after: number;
  visit_id?: string | null;
  metadata?: Database["public"]["Tables"]["LoyaltyLedger"]["Insert"]["metadata"];
}

// ──────────────────────────────────────────────────────────────────
// CRUD SERVICE FACTORY
// ──────────────────────────────────────────────────────────────────

export function createLoyaltyCrudService(supabase: SupabaseClient<Database>) {
  return {
    /**
     * Initialize loyalty record for new player
     * Called when player is created
     *
     * @param playerId - Player UUID
     * @returns ServiceResult with initial loyalty record
     */
    initializePlayerLoyalty: async (
      playerId: string,
    ): Promise<ServiceResult<PlayerLoyaltyDTO>> => {
      return executeOperation<PlayerLoyaltyDTO>(
        "loyalty_initialize",
        async () => {
          const { data, error } = await supabase
            .from("player_loyalty")
            .insert({
              player_id: playerId,
              tier: "BRONZE",
              points_balance: 0,
              points_earned_total: 0,
              points_redeemed_total: 0,
              tier_progress: 0,
            })
            .select(
              `
              id,
              player_id,
              points_balance,
              points_earned_total,
              points_redeemed_total,
              tier,
              tier_expires_at,
              tier_progress,
              achievements,
              benefits,
              milestones,
              created_at,
              updated_at
            `,
            )
            .single();

          if (error) {
            if (error.code === "23505") {
              throw {
                code: "LOYALTY_ALREADY_EXISTS",
                message: `Loyalty record already exists for player ${playerId}`,
              };
            }
            throw error;
          }

          return data;
        },
      );
    },

    /**
     * Create ledger entry (transaction record)
     *
     * @param entry - Ledger entry data
     * @returns ServiceResult with created entry
     */
    createLedgerEntry: async (
      entry: LoyaltyLedgerCreateDTO,
    ): Promise<ServiceResult<LoyaltyLedgerDTO>> => {
      return executeOperation<LoyaltyLedgerDTO>(
        "loyalty_create_ledger_entry",
        async () => {
          const { data, error } = await supabase
            .from("LoyaltyLedger")
            .insert({
              player_id: entry.player_id,
              points: entry.points,
              direction: entry.direction,
              description: entry.description,
              balance_after: entry.balance_after,
              visit_id: entry.visit_id || null,
              metadata: entry.metadata || null,
            })
            .select(
              `
              id,
              player_id,
              transaction_date,
              points,
              direction,
              description,
              balance_after,
              metadata,
              visit_id
            `,
            )
            .single();

          if (error) {
            throw error;
          }

          return data;
        },
      );
    },

    /**
     * Update player loyalty record
     *
     * @param playerId - Player UUID
     * @param updates - Fields to update
     * @returns ServiceResult with updated record
     */
    updatePlayerLoyalty: async (
      playerId: string,
      updates: PlayerLoyaltyUpdateDTO,
    ): Promise<ServiceResult<PlayerLoyaltyDTO>> => {
      return executeOperation<PlayerLoyaltyDTO>(
        "loyalty_update_player",
        async () => {
          const { data, error } = await supabase
            .from("player_loyalty")
            .update(updates)
            .eq("player_id", playerId)
            .select(
              `
              id,
              player_id,
              points_balance,
              points_earned_total,
              points_redeemed_total,
              tier,
              tier_expires_at,
              tier_progress,
              achievements,
              benefits,
              milestones,
              created_at,
              updated_at
            `,
            )
            .single();

          if (error) {
            if (error.code === "PGRST116") {
              throw {
                code: "LOYALTY_NOT_FOUND",
                message: `Loyalty record not found for player ${playerId}`,
              };
            }
            throw error;
          }

          return data;
        },
      );
    },

    /**
     * Get player loyalty record by ID
     *
     * @param playerId - Player UUID
     * @returns ServiceResult with loyalty record
     */
    getPlayerLoyalty: async (
      playerId: string,
    ): Promise<ServiceResult<PlayerLoyaltyDTO>> => {
      return executeOperation<PlayerLoyaltyDTO>(
        "loyalty_get_player",
        async () => {
          const { data, error } = await supabase
            .from("player_loyalty")
            .select(
              `
              id,
              player_id,
              points_balance,
              points_earned_total,
              points_redeemed_total,
              tier,
              tier_expires_at,
              tier_progress,
              achievements,
              benefits,
              milestones,
              created_at,
              updated_at
            `,
            )
            .eq("player_id", playerId)
            .single();

          if (error) {
            if (error.code === "PGRST116") {
              throw {
                code: "LOYALTY_NOT_FOUND",
                message: `Loyalty record not found for player ${playerId}`,
              };
            }
            throw error;
          }

          return data;
        },
      );
    },
  };
}

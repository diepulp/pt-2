/**
 * Loyalty Queries Module
 * Following PT-2 canonical service architecture
 *
 * Bounded Context: "What are the player's loyalty metrics?"
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { executeOperation } from "../shared/operation-wrapper";
import type { ServiceResult } from "../shared/types";

import { LOYALTY_TIERS, type LoyaltyTier } from "./business";
import type { PlayerLoyaltyDTO, LoyaltyLedgerDTO } from "./crud";

// ──────────────────────────────────────────────────────────────────
// TYPES & DTOS
// ──────────────────────────────────────────────────────────────────

export interface TransactionHistoryOptions {
  limit?: number;
  offset?: number;
  transactionType?: string;
  startDate?: string;
  endDate?: string;
}

export interface TierProgressDTO {
  currentTier: string;
  pointsEarnedTotal: number;
  pointsToNextTier: number;
  progressPercentage: number;
  nextTier: string | null;
  currentTierBenefits: readonly string[];
  nextTierBenefits: readonly string[] | null;
}

// ──────────────────────────────────────────────────────────────────
// QUERIES SERVICE FACTORY
// ──────────────────────────────────────────────────────────────────

export function createLoyaltyQueriesService(
  supabase: SupabaseClient<Database>,
) {
  return {
    /**
     * Get current points balance
     *
     * @param playerId - Player UUID
     * @returns ServiceResult with balance
     */
    getBalance: async (
      playerId: string,
    ): Promise<ServiceResult<PlayerLoyaltyDTO>> => {
      return executeOperation<PlayerLoyaltyDTO>(
        "loyalty_get_balance",
        async () => {
          const { data, error } = await supabase
            .from("player_loyalty")
            .select(
              `
              id,
              player_id,
              current_balance,
              lifetime_points,
              tier,
              tier_progress,
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

    /**
     * Get current tier
     *
     * @param playerId - Player UUID
     * @returns ServiceResult with tier info
     */
    getTier: async (
      playerId: string,
    ): Promise<ServiceResult<PlayerLoyaltyDTO>> => {
      return executeOperation<PlayerLoyaltyDTO>(
        "loyalty_get_tier",
        async () => {
          const { data, error } = await supabase
            .from("player_loyalty")
            .select(
              `
              id,
              player_id,
              current_balance,
              lifetime_points,
              tier,
              tier_progress,
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

    /**
     * Get transaction history
     *
     * @param playerId - Player UUID
     * @param options - Filtering/pagination options
     * @returns ServiceResult with ledger entries
     */
    getTransactionHistory: async (
      playerId: string,
      options?: TransactionHistoryOptions,
    ): Promise<ServiceResult<LoyaltyLedgerDTO[]>> => {
      return executeOperation<LoyaltyLedgerDTO[]>(
        "loyalty_get_transaction_history",
        async () => {
          let query = supabase
            .from("loyalty_ledger")
            .select(
              `
              id,
              player_id,
              created_at,
              points_change,
              reason,
              transaction_type,
              event_type,
              source,
              session_id,
              rating_slip_id,
              visit_id,
              staff_id,
              balance_before,
              balance_after,
              tier_before,
              tier_after,
              correlation_id
            `,
            )
            .eq("player_id", playerId)
            .order("created_at", { ascending: false });

          // Apply filters
          if (options?.transactionType) {
            query = query.eq("transaction_type", options.transactionType);
          }

          if (options?.startDate) {
            query = query.gte("created_at", options.startDate);
          }

          if (options?.endDate) {
            query = query.lte("created_at", options.endDate);
          }

          // Apply pagination
          if (options?.limit) {
            query = query.limit(options.limit);
          }

          if (options?.offset) {
            query = query.range(
              options.offset,
              options.offset + (options.limit || 10) - 1,
            );
          }

          const { data, error } = await query;

          if (error) {
            throw error;
          }

          return data || [];
        },
      );
    },

    /**
     * Get tier progress information
     *
     * @param playerId - Player UUID
     * @returns ServiceResult with progress data
     */
    getTierProgress: async (
      playerId: string,
    ): Promise<ServiceResult<TierProgressDTO>> => {
      return executeOperation<TierProgressDTO>(
        "loyalty_get_tier_progress",
        async () => {
          const { data, error } = await supabase
            .from("player_loyalty")
            .select("tier, lifetime_points, tier_progress")
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

          const currentTier = data.tier as LoyaltyTier;
          const pointsEarnedTotal = data.lifetime_points || 0;

          // Calculate next tier and points needed
          const tierConfig = LOYALTY_TIERS[currentTier];
          let nextTier: string | null = null;
          let pointsToNextTier = 0;
          let nextTierBenefits: readonly string[] | null = null;

          if (currentTier === "BRONZE") {
            nextTier = "SILVER";
            pointsToNextTier =
              LOYALTY_TIERS.SILVER.minPoints - pointsEarnedTotal;
            nextTierBenefits = LOYALTY_TIERS.SILVER.benefits;
          } else if (currentTier === "SILVER") {
            nextTier = "GOLD";
            pointsToNextTier = LOYALTY_TIERS.GOLD.minPoints - pointsEarnedTotal;
            nextTierBenefits = LOYALTY_TIERS.GOLD.benefits;
          } else if (currentTier === "GOLD") {
            nextTier = "PLATINUM";
            pointsToNextTier =
              LOYALTY_TIERS.PLATINUM.minPoints - pointsEarnedTotal;
            nextTierBenefits = LOYALTY_TIERS.PLATINUM.benefits;
          }

          return {
            currentTier,
            pointsEarnedTotal,
            pointsToNextTier: Math.max(0, pointsToNextTier),
            progressPercentage: data.tier_progress || 0,
            nextTier,
            currentTierBenefits: tierConfig.benefits,
            nextTierBenefits,
          };
        },
      );
    },
  };
}

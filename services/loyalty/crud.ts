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
  Database["public"]["Tables"]["loyalty_ledger"]["Row"];

export type PlayerLoyaltyDTO = Pick<
  PlayerLoyaltyRow,
  | "id"
  | "player_id"
  | "current_balance"
  | "lifetime_points"
  | "tier"
  | "tier_progress"
  | "created_at"
  | "updated_at"
>;

export interface PlayerLoyaltyCreateDTO {
  player_id: string;
  tier?: string;
  current_balance?: number;
  lifetime_points?: number;
  tier_progress?: number;
}

export interface PlayerLoyaltyUpdateDTO {
  current_balance?: number;
  lifetime_points?: number;
  tier?: string;
  tier_progress?: number;
}

export type LoyaltyLedgerDTO = Pick<
  LoyaltyLedgerRow,
  | "id"
  | "player_id"
  | "created_at"
  | "points_change"
  | "reason"
  | "transaction_type"
  | "event_type"
  | "source"
  | "session_id"
  | "rating_slip_id"
  | "visit_id"
  | "staff_id"
  | "balance_before"
  | "balance_after"
  | "tier_before"
  | "tier_after"
  | "correlation_id"
>;

export interface LoyaltyLedgerCreateDTO {
  player_id: string;
  points_change: number;
  transaction_type: string;
  reason: string;
  source?: string;
  event_type?: string | null;
  session_id?: string | null;
  rating_slip_id?: string | null;
  visit_id?: string | null;
  staff_id?: string | null;
  correlation_id?: string | null;
}

/**
 * Enhanced RPC result from increment_player_loyalty
 * Matches Wave 2 schema hardening RPC signature
 */
export interface IncrementPlayerLoyaltyResult {
  player_id: string;
  balance_before: number;
  balance_after: number;
  tier_before: string;
  tier_after: string;
  current_balance: number;
  lifetime_points: number;
  tier: string;
  tier_progress: number;
  updated_at: string;
  row_locked: boolean;
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
              current_balance: 0,
              lifetime_points: 0,
              tier_progress: 0,
            })
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
     * Wave 2 Enhanced: Calls increment_player_loyalty RPC and stores before/after snapshots
     *
     * @param entry - Ledger entry data
     * @returns ServiceResult with created entry including audit trail
     */
    createLedgerEntry: async (
      entry: LoyaltyLedgerCreateDTO,
    ): Promise<ServiceResult<LoyaltyLedgerDTO>> => {
      return executeOperation<LoyaltyLedgerDTO>(
        "loyalty_create_ledger_entry",
        async () => {
          // Step 1: Call enhanced RPC to get before/after snapshots
          const { data: rpcResult, error: rpcError } = await supabase.rpc(
            "increment_player_loyalty",
            {
              p_player_id: entry.player_id,
              p_delta_points: entry.points_change,
            },
          );

          if (rpcError) {
            throw rpcError;
          }

          // RPC returns array with single result
          const loyaltyUpdate = (
            rpcResult as IncrementPlayerLoyaltyResult[]
          )[0];

          if (!loyaltyUpdate) {
            throw new Error("increment_player_loyalty RPC returned no result");
          }

          // Step 2: Insert ledger entry with before/after snapshots
          const { data, error } = await supabase
            .from("loyalty_ledger")
            .insert({
              player_id: entry.player_id,
              points_change: entry.points_change,
              transaction_type: entry.transaction_type,
              reason: entry.reason,
              source: entry.source || "system",
              event_type: entry.event_type || null,
              session_id: entry.session_id || null,
              rating_slip_id: entry.rating_slip_id || null,
              visit_id: entry.visit_id || null,
              staff_id: entry.staff_id || null,
              correlation_id: entry.correlation_id || null,
              balance_before: loyaltyUpdate.balance_before,
              balance_after: loyaltyUpdate.balance_after,
              tier_before: loyaltyUpdate.tier_before,
              tier_after: loyaltyUpdate.tier_after,
            })
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
            .single();

          if (error) {
            // Handle idempotency: duplicate (session_id, transaction_type, source)
            if (error.code === "23505" && entry.session_id) {
              // Soft success: fetch existing entry
              const { data: existing, error: fetchError } = await supabase
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
                .eq("session_id", entry.session_id)
                .eq("transaction_type", entry.transaction_type)
                .eq("source", entry.source || "system")
                .single();

              if (fetchError || !existing) {
                throw error; // Original error if can't fetch existing
              }

              return existing; // Return existing entry (idempotent)
            }
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
              current_balance,
              lifetime_points,
              tier,
              tier_progress,
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
  };
}

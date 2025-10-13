/**
 * Loyalty Service Factory
 * Following PT-2 canonical service architecture with explicit interfaces
 *
 * Bounded Context: "How do we convert player performance into loyalty rewards?"
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import type { ServiceResult } from "../shared/types";

import { createLoyaltyBusinessService } from "./business";
import type {
  GameSettings,
  AccruePointsInput,
  AccruePointsResult,
  LoyaltyTier,
} from "./business";
import { createLoyaltyCrudService } from "./crud";
import type {
  PlayerLoyaltyDTO,
  PlayerLoyaltyCreateDTO,
  PlayerLoyaltyUpdateDTO,
  LoyaltyLedgerDTO,
  LoyaltyLedgerCreateDTO,
} from "./crud";
import { createLoyaltyQueriesService } from "./queries";
import type { TransactionHistoryOptions, TierProgressDTO } from "./queries";

// ──────────────────────────────────────────────────────────────────
// EXPLICIT INTERFACE (NO ReturnType INFERENCE)
// ──────────────────────────────────────────────────────────────────

/**
 * Loyalty Service Interface
 * Following PT-2 canonical service architecture
 *
 * Bounded Context: Convert gameplay into loyalty rewards
 */
export interface LoyaltyService {
  // ─────────────────────────────────────────────────────────
  // ACCRUAL OPERATIONS
  // ─────────────────────────────────────────────────────────

  /**
   * Accrue points from RatingSlip telemetry
   *
   * @param input - RatingSlip performance data
   * @returns ServiceResult with ledger entry
   *
   * @example
   * const result = await loyaltyService.accruePointsFromSlip({
   *   playerId: 'uuid',
   *   ratingSlipId: 'uuid',
   *   visitId: 'uuid',
   *   averageBet: 50,
   *   durationSeconds: 5400,
   *   gameSettings: { house_edge: 2.5, ... }
   * });
   */
  accruePointsFromSlip(
    input: AccruePointsInput,
  ): Promise<ServiceResult<AccruePointsResult>>;

  /**
   * Create ledger entry (transaction record)
   * For manual adjustments or administrative actions
   *
   * @param entry - Ledger entry data
   * @returns ServiceResult with created entry
   */
  createLedgerEntry(
    entry: LoyaltyLedgerCreateDTO,
  ): Promise<ServiceResult<LoyaltyLedgerDTO>>;

  // ─────────────────────────────────────────────────────────
  // QUERY OPERATIONS
  // ─────────────────────────────────────────────────────────

  /**
   * Get current points balance for player
   *
   * @param playerId - Player UUID
   * @returns ServiceResult with balance data
   */
  getBalance(playerId: string): Promise<ServiceResult<PlayerLoyaltyDTO>>;

  /**
   * Get current tier information for player
   *
   * @param playerId - Player UUID
   * @returns ServiceResult with tier data
   */
  getTier(playerId: string): Promise<ServiceResult<PlayerLoyaltyDTO>>;

  /**
   * Get transaction history for player
   *
   * @param playerId - Player UUID
   * @param options - Pagination/filtering options
   * @returns ServiceResult with ledger entries
   */
  getTransactionHistory(
    playerId: string,
    options?: TransactionHistoryOptions,
  ): Promise<ServiceResult<LoyaltyLedgerDTO[]>>;

  /**
   * Get tier progress information
   *
   * @param playerId - Player UUID
   * @returns ServiceResult with progress data
   */
  getTierProgress(playerId: string): Promise<ServiceResult<TierProgressDTO>>;

  // ─────────────────────────────────────────────────────────
  // TIER MANAGEMENT
  // ─────────────────────────────────────────────────────────

  /**
   * Recalculate and update player tier
   * (Typically triggered by points accrual)
   *
   * @param playerId - Player UUID
   * @returns ServiceResult with updated tier
   */
  updateTier(playerId: string): Promise<ServiceResult<PlayerLoyaltyDTO>>;

  /**
   * Initialize loyalty record for new player
   *
   * @param playerId - Player UUID
   * @returns ServiceResult with initial loyalty record
   */
  initializePlayerLoyalty(
    playerId: string,
  ): Promise<ServiceResult<PlayerLoyaltyDTO>>;

  // ─────────────────────────────────────────────────────────
  // PLAYER LOYALTY MANAGEMENT
  // ─────────────────────────────────────────────────────────

  /**
   * Get player loyalty record by ID
   *
   * @param playerId - Player UUID
   * @returns ServiceResult with loyalty record
   */
  getPlayerLoyalty(playerId: string): Promise<ServiceResult<PlayerLoyaltyDTO>>;

  /**
   * Update player loyalty record
   *
   * @param playerId - Player UUID
   * @param updates - Fields to update
   * @returns ServiceResult with updated record
   */
  updatePlayerLoyalty(
    playerId: string,
    updates: PlayerLoyaltyUpdateDTO,
  ): Promise<ServiceResult<PlayerLoyaltyDTO>>;
}

// ──────────────────────────────────────────────────────────────────
// FACTORY FUNCTION
// ──────────────────────────────────────────────────────────────────

/**
 * Loyalty Service Factory
 * Following PT-2 canonical service architecture
 */
export function createLoyaltyService(
  supabase: SupabaseClient<Database>,
): LoyaltyService {
  const crudService = createLoyaltyCrudService(supabase);
  const businessService = createLoyaltyBusinessService(supabase);
  const queriesService = createLoyaltyQueriesService(supabase);

  return {
    // Accrual operations
    accruePointsFromSlip: businessService.accruePointsFromSlip,
    createLedgerEntry: crudService.createLedgerEntry,

    // Query operations
    getBalance: queriesService.getBalance,
    getTier: queriesService.getTier,
    getTransactionHistory: queriesService.getTransactionHistory,
    getTierProgress: queriesService.getTierProgress,

    // Tier management
    updateTier: businessService.updateTier,
    initializePlayerLoyalty: crudService.initializePlayerLoyalty,

    // Player loyalty management
    getPlayerLoyalty: crudService.getPlayerLoyalty,
    updatePlayerLoyalty: crudService.updatePlayerLoyalty,
  };
}

// ──────────────────────────────────────────────────────────────────
// EXPORTS
// ──────────────────────────────────────────────────────────────────

// ✅ Export explicit type (NOT ReturnType)
export type LoyaltyServiceType = LoyaltyService;

// Export types
export type {
  PlayerLoyaltyDTO,
  PlayerLoyaltyCreateDTO,
  PlayerLoyaltyUpdateDTO,
  LoyaltyLedgerDTO,
  LoyaltyLedgerCreateDTO,
  GameSettings,
  AccruePointsInput,
  AccruePointsResult,
  TransactionHistoryOptions,
  TierProgressDTO,
  LoyaltyTier,
};

// Export tier definitions
export { LOYALTY_TIERS } from "./business";
export {
  calculatePoints,
  calculateTier,
  calculateTierProgress,
} from "./business";

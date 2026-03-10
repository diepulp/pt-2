/**
 * Player Exclusion Service Factory
 *
 * Functional factory for exclusion management.
 * Pattern B: Canonical CRUD with typed interface.
 *
 * @see ADR-042 Player Exclusion Architecture
 * @see EXEC-050 WS4
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import * as crud from './exclusion-crud';
import type {
  CreateExclusionInput,
  ExclusionStatusDTO,
  LiftExclusionInput,
  PlayerExclusionDTO,
} from './exclusion-dtos';

// Re-export DTOs and keys for consumers
export * from './exclusion-dtos';
export * from './exclusion-keys';

// === Service Interface ===

/**
 * ExclusionServiceInterface — explicit, no ReturnType inference.
 */
export interface ExclusionServiceInterface {
  /** Create a new exclusion record. */
  createExclusion(input: CreateExclusionInput): Promise<PlayerExclusionDTO>;

  /** Lift (soft-delete) an existing exclusion. Admin only. */
  liftExclusion(
    exclusionId: string,
    input: LiftExclusionInput,
  ): Promise<PlayerExclusionDTO>;

  /** List all exclusions for a player (including lifted). */
  listExclusions(playerId: string): Promise<PlayerExclusionDTO[]>;

  /** List active exclusions for a player (not lifted, temporally valid). */
  getActiveExclusions(playerId: string): Promise<PlayerExclusionDTO[]>;

  /**
   * Get collapsed exclusion status.
   * AUDIT-C3: Calls SQL function — single source of truth for precedence.
   */
  getExclusionStatus(playerId: string): Promise<ExclusionStatusDTO>;
}

// === Service Factory ===

/**
 * Creates an ExclusionService instance.
 *
 * @param supabase - Supabase client with RLS context set
 */
export function createExclusionService(
  supabase: SupabaseClient<Database>,
): ExclusionServiceInterface {
  return {
    createExclusion: (input) => crud.createExclusion(supabase, input),
    liftExclusion: (exclusionId, input) =>
      crud.liftExclusion(supabase, exclusionId, input),
    listExclusions: (playerId) => crud.listExclusions(supabase, playerId),
    getActiveExclusions: (playerId) =>
      crud.getActiveExclusions(supabase, playerId),
    getExclusionStatus: (playerId) =>
      crud.getExclusionStatus(supabase, playerId),
  };
}

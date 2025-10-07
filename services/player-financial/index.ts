/**
 * PlayerFinancial Service Entry Point
 * Following PT-2 canonical service architecture
 *
 * Bounded Context: Financial transaction ledger
 * Responsibility: Track cash and chip movements (money in/out)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { createPlayerFinancialCrudService } from "./crud";
import type { PlayerFinancialCrudService } from "./crud";

export interface PlayerFinancialService {
  crud: PlayerFinancialCrudService;
}

export function createPlayerFinancialService(
  supabase: SupabaseClient<Database>,
): PlayerFinancialService {
  return {
    crud: createPlayerFinancialCrudService(supabase),
  };
}

// Re-export types for convenience
export type {
  PlayerFinancialTransactionCreateDTO,
  PlayerFinancialTransactionUpdateDTO,
  PlayerFinancialTransactionDTO,
  PlayerFinancialCrudService,
} from "./crud";

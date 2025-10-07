/**
 * PlayerFinancial Service Entry Point
 * Following PT-2 canonical service architecture
 *
 * Bounded Context: Financial transaction ledger
 * Responsibility: Track cash and chip movements (money in/out)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import type { ServiceResult } from "../shared/types";

import { createPlayerFinancialCrudService } from "./crud";
import type {
  PlayerFinancialTransactionCreateDTO,
  PlayerFinancialTransactionUpdateDTO,
  PlayerFinancialTransactionDTO,
} from "./crud";

// ✅ Explicit interface - NOT ReturnType inference
export interface PlayerFinancialService {
  create(
    data: PlayerFinancialTransactionCreateDTO,
  ): Promise<ServiceResult<PlayerFinancialTransactionDTO>>;
  getById(id: string): Promise<ServiceResult<PlayerFinancialTransactionDTO>>;
  update(
    id: string,
    data: PlayerFinancialTransactionUpdateDTO,
  ): Promise<ServiceResult<PlayerFinancialTransactionDTO>>;
  delete(id: string): Promise<ServiceResult<void>>;
  listByPlayer(
    playerId: string,
    limit?: number,
    offset?: number,
  ): Promise<ServiceResult<PlayerFinancialTransactionDTO[]>>;
  listByVisit(
    visitId: string,
  ): Promise<ServiceResult<PlayerFinancialTransactionDTO[]>>;
  listByReconciliationStatus(
    status: Database["public"]["Enums"]["reconciliationstatus"],
    limit?: number,
    offset?: number,
  ): Promise<ServiceResult<PlayerFinancialTransactionDTO[]>>;
}

// ✅ Typed factory with explicit interface return
export function createPlayerFinancialService(
  supabase: SupabaseClient<Database>,
): PlayerFinancialService {
  const crudService = createPlayerFinancialCrudService(supabase);

  return {
    ...crudService,
  };
}

// ✅ Export explicit type
export type PlayerFinancialServiceType = PlayerFinancialService;
export type {
  PlayerFinancialTransactionCreateDTO,
  PlayerFinancialTransactionUpdateDTO,
  PlayerFinancialTransactionDTO,
} from "./crud";

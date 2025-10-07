/**
 * PlayerFinancial CRUD Module
 * Following PT-2 canonical service architecture
 *
 * Bounded Context: "What money/chips moved in/out?"
 * Owner: PlayerFinancialService (Financial Domain)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { executeOperation } from "../shared/operation-wrapper";
import type { ServiceResult } from "../shared/types";

export interface PlayerFinancialTransactionCreateDTO {
  playerId: string;
  visitId: string;
  ratingSlipId?: string | null;
  cashIn?: number | null;
  chipsBrought?: number | null;
  chipsTaken?: number | null;
  transactionType: Database["public"]["Enums"]["transactiontype"];
  netChange?: number | null;
  notes?: string | null;
  transactionTime?: string;
}

export interface PlayerFinancialTransactionUpdateDTO {
  cashIn?: number | null;
  chipsBrought?: number | null;
  chipsTaken?: number | null;
  reconciliationStatus?: Database["public"]["Enums"]["reconciliationstatus"];
  netChange?: number | null;
  notes?: string | null;
  reconciledAt?: string | null;
}

export type PlayerFinancialTransactionDTO = Pick<
  Database["public"]["Tables"]["player_financial_transaction"]["Row"],
  | "id"
  | "player_id"
  | "visit_id"
  | "rating_slip_id"
  | "cash_in"
  | "chips_brought"
  | "chips_taken"
  | "transaction_type"
  | "reconciliation_status"
  | "net_change"
  | "notes"
  | "transaction_time"
  | "reconciled_at"
  | "created_at"
  | "updated_at"
>;

export function createPlayerFinancialCrudService(
  supabase: SupabaseClient<Database>,
): PlayerFinancialCrudService {
  return {
    create: async (
      data: PlayerFinancialTransactionCreateDTO,
    ): Promise<ServiceResult<PlayerFinancialTransactionDTO>> => {
      return executeOperation<PlayerFinancialTransactionDTO>(
        "create_player_financial_transaction",
        async () => {
          const { data: transaction, error } = await supabase
            .from("player_financial_transaction")
            .insert({
              player_id: data.playerId,
              visit_id: data.visitId,
              rating_slip_id: data.ratingSlipId,
              cash_in: data.cashIn,
              chips_brought: data.chipsBrought,
              chips_taken: data.chipsTaken,
              transaction_type: data.transactionType,
              net_change: data.netChange,
              notes: data.notes,
              ...(data.transactionTime && {
                transaction_time: data.transactionTime,
              }),
            })
            .select(
              `
              id,
              player_id,
              visit_id,
              rating_slip_id,
              cash_in,
              chips_brought,
              chips_taken,
              transaction_type,
              reconciliation_status,
              net_change,
              notes,
              transaction_time,
              reconciled_at,
              created_at,
              updated_at
            `,
            )
            .single();

          if (error) {
            // Foreign key violation (player, visit, or rating_slip not found)
            if (error.code === "23503") {
              throw {
                code: "FOREIGN_KEY_VIOLATION",
                message:
                  "Referenced player, visit, or rating slip does not exist",
                details: error,
              };
            }
            // Check constraint violation (at_least_one_value, valid amounts)
            if (error.code === "23514") {
              throw {
                code: "CONSTRAINT_VIOLATION",
                message:
                  "Must provide at least one of: cashIn, chipsBrought, or chipsTaken. All amounts must be non-negative.",
                details: error,
              };
            }
            throw error;
          }

          return transaction;
        },
      );
    },

    getById: async (
      id: string,
    ): Promise<ServiceResult<PlayerFinancialTransactionDTO>> => {
      return executeOperation<PlayerFinancialTransactionDTO>(
        "get_player_financial_transaction_by_id",
        async () => {
          const { data: transaction, error } = await supabase
            .from("player_financial_transaction")
            .select(
              `
              id,
              player_id,
              visit_id,
              rating_slip_id,
              cash_in,
              chips_brought,
              chips_taken,
              transaction_type,
              reconciliation_status,
              net_change,
              notes,
              transaction_time,
              reconciled_at,
              created_at,
              updated_at
            `,
            )
            .eq("id", id)
            .single();

          if (error) {
            if (error.code === "PGRST116") {
              throw {
                code: "NOT_FOUND",
                message: "Financial transaction not found",
                details: error,
              };
            }
            throw error;
          }

          return transaction;
        },
      );
    },

    update: async (
      id: string,
      data: PlayerFinancialTransactionUpdateDTO,
    ): Promise<ServiceResult<PlayerFinancialTransactionDTO>> => {
      return executeOperation<PlayerFinancialTransactionDTO>(
        "update_player_financial_transaction",
        async () => {
          const { data: transaction, error } = await supabase
            .from("player_financial_transaction")
            .update({
              ...(data.cashIn !== undefined && { cash_in: data.cashIn }),
              ...(data.chipsBrought !== undefined && {
                chips_brought: data.chipsBrought,
              }),
              ...(data.chipsTaken !== undefined && {
                chips_taken: data.chipsTaken,
              }),
              ...(data.reconciliationStatus && {
                reconciliation_status: data.reconciliationStatus,
              }),
              ...(data.netChange !== undefined && {
                net_change: data.netChange,
              }),
              ...(data.notes !== undefined && { notes: data.notes }),
              ...(data.reconciledAt !== undefined && {
                reconciled_at: data.reconciledAt,
              }),
            })
            .eq("id", id)
            .select(
              `
              id,
              player_id,
              visit_id,
              rating_slip_id,
              cash_in,
              chips_brought,
              chips_taken,
              transaction_type,
              reconciliation_status,
              net_change,
              notes,
              transaction_time,
              reconciled_at,
              created_at,
              updated_at
            `,
            )
            .single();

          if (error) {
            if (error.code === "PGRST116") {
              throw {
                code: "NOT_FOUND",
                message: "Financial transaction not found",
                details: error,
              };
            }
            if (error.code === "23514") {
              throw {
                code: "CONSTRAINT_VIOLATION",
                message: "Invalid update: constraint violation",
                details: error,
              };
            }
            throw error;
          }

          return transaction;
        },
      );
    },

    delete: async (id: string): Promise<ServiceResult<void>> => {
      return executeOperation<void>(
        "delete_player_financial_transaction",
        async () => {
          const { error } = await supabase
            .from("player_financial_transaction")
            .delete()
            .eq("id", id);

          if (error) {
            if (error.code === "PGRST116") {
              throw {
                code: "NOT_FOUND",
                message: "Financial transaction not found",
                details: error,
              };
            }
            throw error;
          }
        },
      );
    },

    listByPlayer: async (
      playerId: string,
      limit: number = 50,
      offset: number = 0,
    ): Promise<ServiceResult<PlayerFinancialTransactionDTO[]>> => {
      return executeOperation<PlayerFinancialTransactionDTO[]>(
        "list_player_financial_transactions_by_player",
        async () => {
          const { data: transactions, error } = await supabase
            .from("player_financial_transaction")
            .select(
              `
              id,
              player_id,
              visit_id,
              rating_slip_id,
              cash_in,
              chips_brought,
              chips_taken,
              transaction_type,
              reconciliation_status,
              net_change,
              notes,
              transaction_time,
              reconciled_at,
              created_at,
              updated_at
            `,
            )
            .eq("player_id", playerId)
            .order("transaction_time", { ascending: false })
            .range(offset, offset + limit - 1);

          if (error) {
            throw error;
          }

          return transactions || [];
        },
      );
    },

    listByVisit: async (
      visitId: string,
    ): Promise<ServiceResult<PlayerFinancialTransactionDTO[]>> => {
      return executeOperation<PlayerFinancialTransactionDTO[]>(
        "list_player_financial_transactions_by_visit",
        async () => {
          const { data: transactions, error } = await supabase
            .from("player_financial_transaction")
            .select(
              `
              id,
              player_id,
              visit_id,
              rating_slip_id,
              cash_in,
              chips_brought,
              chips_taken,
              transaction_type,
              reconciliation_status,
              net_change,
              notes,
              transaction_time,
              reconciled_at,
              created_at,
              updated_at
            `,
            )
            .eq("visit_id", visitId)
            .order("transaction_time", { ascending: true });

          if (error) {
            throw error;
          }

          return transactions || [];
        },
      );
    },

    listByReconciliationStatus: async (
      status: Database["public"]["Enums"]["reconciliationstatus"],
      limit: number = 100,
      offset: number = 0,
    ): Promise<ServiceResult<PlayerFinancialTransactionDTO[]>> => {
      return executeOperation<PlayerFinancialTransactionDTO[]>(
        "list_player_financial_transactions_by_reconciliation_status",
        async () => {
          const { data: transactions, error } = await supabase
            .from("player_financial_transaction")
            .select(
              `
              id,
              player_id,
              visit_id,
              rating_slip_id,
              cash_in,
              chips_brought,
              chips_taken,
              transaction_type,
              reconciliation_status,
              net_change,
              notes,
              transaction_time,
              reconciled_at,
              created_at,
              updated_at
            `,
            )
            .eq("reconciliation_status", status)
            .order("transaction_time", { ascending: true })
            .range(offset, offset + limit - 1);

          if (error) {
            throw error;
          }

          return transactions || [];
        },
      );
    },
  };
}

// ✅ Explicit interface - NOT ReturnType inference
export interface PlayerFinancialCrudService {
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

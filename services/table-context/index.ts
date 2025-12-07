/**
 * TableContextService Index (Factory)
 *
 * Pattern A (Contract-First) with explicit interface + ServiceResult
 * and executeOperation wrapper (SLAD Service Factory Pattern).
 *
 * Bounded Context: "What is the operational state and chip custody posture of this gaming table?"
 *
 * @see PRD-007 Table Context Service
 * @see SERVICE_RESPONSIBILITY_MATRIX.md §298-333
 * @see SLAD §308-348
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import {
  getInventoryHistory,
  logDropEvent,
  logInventorySnapshot,
  requestTableCredit,
  requestTableFill,
} from './chip-custody';
import { getActiveTables, getTableById, listTables } from './crud';
import {
  assignDealer,
  endDealerRotation,
  getCurrentDealer,
} from './dealer-rotation';
import type {
  ChipsetPayload,
  DealerRotationDTO,
  GameType,
  GamingTableDTO,
  GamingTableWithDealerDTO,
  LogDropEventInput,
  LogInventorySnapshotInput,
  RequestTableCreditInput,
  RequestTableFillInput,
  SnapshotType,
  TableCreditDTO,
  TableDropEventDTO,
  TableFillDTO,
  TableInventorySnapshotDTO,
  TableListFilters,
  TableStatus,
} from './dtos';
import { activateTable, closeTable, deactivateTable } from './table-lifecycle';

// Re-export DTOs and keys for consumers
export type {
  ChipsetPayload,
  DealerRotationDTO,
  GameType,
  GamingTableDTO,
  GamingTableWithDealerDTO,
  LogDropEventInput,
  LogInventorySnapshotInput,
  RequestTableCreditInput,
  RequestTableFillInput,
  SnapshotType,
  TableCreditDTO,
  TableDropEventDTO,
  TableFillDTO,
  TableInventorySnapshotDTO,
  TableListFilters,
  TableStatus,
};
export { tableContextKeys } from './keys';

// === Service Interface ===

export interface TableContextServiceInterface {
  // Table lifecycle
  activate(tableId: string, casinoId: string): Promise<GamingTableDTO>;
  deactivate(tableId: string, casinoId: string): Promise<GamingTableDTO>;
  close(tableId: string, casinoId: string): Promise<GamingTableDTO>;

  // Dealer operations
  assignDealer(
    tableId: string,
    casinoId: string,
    staffId: string,
  ): Promise<DealerRotationDTO>;
  endDealerRotation(
    tableId: string,
    casinoId: string,
  ): Promise<DealerRotationDTO>;
  getCurrentDealer(
    tableId: string,
    casinoId: string,
  ): Promise<DealerRotationDTO | null>;

  // Table queries
  getTable(tableId: string, casinoId: string): Promise<GamingTableDTO>;
  listTables(
    casinoId: string,
    filters?: Omit<TableListFilters, 'casinoId'>,
  ): Promise<GamingTableDTO[]>;
  getActiveTables(casinoId: string): Promise<GamingTableWithDealerDTO[]>;

  // Chip custody operations
  logInventorySnapshot(
    input: LogInventorySnapshotInput,
  ): Promise<TableInventorySnapshotDTO>;
  requestFill(input: RequestTableFillInput): Promise<TableFillDTO>;
  requestCredit(input: RequestTableCreditInput): Promise<TableCreditDTO>;
  logDropEvent(input: LogDropEventInput): Promise<TableDropEventDTO>;
  getInventoryHistory(
    tableId: string,
    casinoId: string,
    limit?: number,
  ): Promise<TableInventorySnapshotDTO[]>;
}

// === Service Factory ===

/**
 * Creates a TableContextService instance.
 *
 * @param supabase - Supabase client with RLS context set
 */
export function createTableContextService(
  supabase: SupabaseClient<Database>,
): TableContextServiceInterface {
  return {
    // Table lifecycle
    activate: (tableId, casinoId) => activateTable(supabase, tableId, casinoId),
    deactivate: (tableId, casinoId) =>
      deactivateTable(supabase, tableId, casinoId),
    close: (tableId, casinoId) => closeTable(supabase, tableId, casinoId),

    // Dealer operations
    assignDealer: (tableId, casinoId, staffId) =>
      assignDealer(supabase, tableId, casinoId, staffId),
    endDealerRotation: (tableId, casinoId) =>
      endDealerRotation(supabase, tableId, casinoId),
    getCurrentDealer: (tableId, casinoId) =>
      getCurrentDealer(supabase, tableId, casinoId),

    // Table queries
    getTable: (tableId, casinoId) => getTableById(supabase, tableId, casinoId),
    listTables: (casinoId, filters) => listTables(supabase, casinoId, filters),
    getActiveTables: (casinoId) => getActiveTables(supabase, casinoId),

    // Chip custody operations
    logInventorySnapshot: (input) => logInventorySnapshot(supabase, input),
    requestFill: (input) => requestTableFill(supabase, input),
    requestCredit: (input) => requestTableCredit(supabase, input),
    logDropEvent: (input) => logDropEvent(supabase, input),
    getInventoryHistory: (tableId, casinoId, limit) =>
      getInventoryHistory(supabase, tableId, casinoId, limit),
  };
}

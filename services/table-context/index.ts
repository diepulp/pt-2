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
  CashObsCasinoRollupDTO,
  CashObsPitRollupDTO,
  CashObsSpikeAlertDTO,
  CashObsTableRollupDTO,
  ChipsetPayload,
  DealerRotationDTO,
  GameType,
  GamingTableDTO,
  GamingTableWithDealerDTO,
  LogDropEventInput,
  LogInventorySnapshotInput,
  RequestTableCreditInput,
  RequestTableFillInput,
  ShiftCashObsPitParams,
  ShiftCashObsTableParams,
  ShiftCashObsTimeWindow,
  SnapshotType,
  TableCreditDTO,
  TableDropEventDTO,
  TableFillDTO,
  TableInventorySnapshotDTO,
  TableListFilters,
  TableSettingsDTO,
  TableStatus,
  UpdateTableLimitsDTO,
  // Table Session DTOs (PRD-TABLE-SESSION-LIFECYCLE-MVP)
  TableSessionDTO,
  TableSessionStatus,
  OpenTableSessionInput,
  StartTableRundownInput,
  CloseTableSessionInput,
  GetCurrentTableSessionInput,
  // ADR-027: Table Rundown DTOs
  TableBankMode,
  TableRundownDTO,
  PostTableDropTotalInput,
} from './dtos';
import { computeTableRundown, postTableDropTotal } from './rundown';
import {
  getShiftCashObsAlerts,
  getShiftCashObsCasino,
  getShiftCashObsPit,
  getShiftCashObsTable,
} from './shift-cash-obs';
import { activateTable, closeTable, deactivateTable } from './table-lifecycle';
import {
  openTableSession,
  startTableRundown,
  closeTableSession,
  getCurrentTableSession,
  getTableSessionById,
} from './table-session';
import { getTableSettings, updateTableLimits } from './table-settings';

// Re-export DTOs and keys for consumers
export type {
  CashObsCasinoRollupDTO,
  CashObsPitRollupDTO,
  CashObsSpikeAlertDTO,
  CashObsTableRollupDTO,
  ChipsetPayload,
  DealerRotationDTO,
  GameType,
  GamingTableDTO,
  GamingTableWithDealerDTO,
  LogDropEventInput,
  LogInventorySnapshotInput,
  RequestTableCreditInput,
  RequestTableFillInput,
  ShiftCashObsPitParams,
  ShiftCashObsTableParams,
  ShiftCashObsTimeWindow,
  SnapshotType,
  TableCreditDTO,
  TableDropEventDTO,
  TableFillDTO,
  TableInventorySnapshotDTO,
  TableListFilters,
  TableSettingsDTO,
  TableStatus,
  UpdateTableLimitsDTO,
  // Table Session DTOs (PRD-TABLE-SESSION-LIFECYCLE-MVP)
  TableSessionDTO,
  TableSessionStatus,
  OpenTableSessionInput,
  StartTableRundownInput,
  CloseTableSessionInput,
  GetCurrentTableSessionInput,
  // ADR-027: Table Rundown DTOs
  TableBankMode,
  TableRundownDTO,
  PostTableDropTotalInput,
};
export { tableContextKeys } from './keys';

// Re-export shift cash obs functions (standalone, not part of factory)
export {
  getShiftCashObsAlerts,
  getShiftCashObsCasino,
  getShiftCashObsPit,
  getShiftCashObsTable,
};

// Re-export rundown functions (ADR-027, standalone for direct use)
export { computeTableRundown, postTableDropTotal };

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

  // Table settings (betting limits)
  getTableSettings(
    tableId: string,
    casinoId: string,
  ): Promise<TableSettingsDTO>;
  updateTableLimits(
    tableId: string,
    casinoId: string,
    data: UpdateTableLimitsDTO,
  ): Promise<TableSettingsDTO>;

  // Table session lifecycle (PRD-TABLE-SESSION-LIFECYCLE-MVP)
  openSession(gamingTableId: string): Promise<TableSessionDTO>;
  startRundown(sessionId: string): Promise<TableSessionDTO>;
  closeSession(input: CloseTableSessionInput): Promise<TableSessionDTO>;
  getCurrentSession(gamingTableId: string): Promise<TableSessionDTO | null>;
  getSessionById(sessionId: string): Promise<TableSessionDTO>;

  // Table rundown (ADR-027)
  computeRundown(sessionId: string): Promise<TableRundownDTO>;
  postDropTotal(
    sessionId: string,
    dropTotalCents: number,
  ): Promise<TableSessionDTO>;
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

    // Table settings (betting limits)
    getTableSettings: (tableId, casinoId) =>
      getTableSettings(supabase, tableId, casinoId),
    updateTableLimits: (tableId, casinoId, data) =>
      updateTableLimits(supabase, tableId, casinoId, data),

    // Table session lifecycle (PRD-TABLE-SESSION-LIFECYCLE-MVP)
    openSession: (gamingTableId) => openTableSession(supabase, gamingTableId),
    startRundown: (sessionId) => startTableRundown(supabase, sessionId),
    closeSession: (input) => closeTableSession(supabase, input),
    getCurrentSession: (gamingTableId) =>
      getCurrentTableSession(supabase, gamingTableId),
    getSessionById: (sessionId) => getTableSessionById(supabase, sessionId),

    // Table rundown (ADR-027)
    computeRundown: (sessionId) => computeTableRundown(supabase, sessionId),
    postDropTotal: (sessionId, dropTotalCents) =>
      postTableDropTotal(supabase, sessionId, dropTotalCents),
  };
}

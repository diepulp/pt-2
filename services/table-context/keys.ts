/**
 * TableContextService React Query Keys
 *
 * @see SLAD section 308 for key factory patterns
 */

import { serializeKeyFilters } from "@/services/shared/key-utils";

import type { TableListFilters, DealerRotationFilters } from "./dtos";

const ROOT = ["table-context"] as const;
const serializeTableFilters = (filters: TableListFilters = {}) =>
  serializeKeyFilters(filters);
const serializeRotationFilters = (filters: DealerRotationFilters = {}) =>
  serializeKeyFilters(filters);

export const tableContextKeys = {
  root: ROOT,

  // Gaming tables
  tables: Object.assign(
    (filters: TableListFilters = {}) =>
      [...ROOT, "tables", serializeTableFilters(filters)] as const,
    { scope: [...ROOT, "tables"] as const },
  ),
  table: (id: string) => [...ROOT, "table", id] as const,

  // Dealer rotations
  rotations: Object.assign(
    (filters: DealerRotationFilters = {}) =>
      [...ROOT, "rotations", serializeRotationFilters(filters)] as const,
    { scope: [...ROOT, "rotations"] as const },
  ),
  currentDealer: (tableId: string) =>
    [...ROOT, "current-dealer", tableId] as const,

  // Inventory
  inventoryHistory: (tableId: string) =>
    [...ROOT, "inventory", tableId] as const,

  // Fills/Credits (generally not cached, but for invalidation)
  fills: (tableId: string) => [...ROOT, "fills", tableId] as const,
  credits: (tableId: string) => [...ROOT, "credits", tableId] as const,
  drops: (tableId: string) => [...ROOT, "drops", tableId] as const,

  // Table settings (betting limits)
  settings: (tableId: string) => [...ROOT, "settings", tableId] as const,

  // Shift cash observation rollups (PRD-SHIFT-DASHBOARDS v0.2 PATCH)
  shiftCashObs: {
    table: (
      casinoId: string,
      startTs: string,
      endTs: string,
      tableId?: string,
    ) =>
      [
        ...ROOT,
        "shift-cash-obs",
        "table",
        casinoId,
        startTs,
        endTs,
        tableId ?? "all",
      ] as const,
    pit: (casinoId: string, startTs: string, endTs: string, pit?: string) =>
      [
        ...ROOT,
        "shift-cash-obs",
        "pit",
        casinoId,
        startTs,
        endTs,
        pit ?? "all",
      ] as const,
    casino: (casinoId: string, startTs: string, endTs: string) =>
      [...ROOT, "shift-cash-obs", "casino", casinoId, startTs, endTs] as const,
    alerts: (casinoId: string, startTs: string, endTs: string) =>
      [...ROOT, "shift-cash-obs", "alerts", casinoId, startTs, endTs] as const,
  },
};

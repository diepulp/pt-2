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
};

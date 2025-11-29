import type { KeyFilter } from "@/services/shared/key-utils";
import { serializeKeyFilters } from "@/services/shared/key-utils";

export type TableContextFilters = KeyFilter & {
  casinoId?: string;
  status?: "inactive" | "active" | "closed";
  cursor?: string;
  limit?: number;
};

export type TableInventorySnapshotFilters = TableContextFilters & {
  tableId?: string;
  snapshotType?: "open" | "close" | "rundown";
};

export type TableFillFilters = TableContextFilters & {
  tableId?: string;
  requestId?: string;
};

export type TableCreditFilters = TableFillFilters;

export type TableDropEventFilters = TableContextFilters & {
  tableId?: string;
  gamingDay?: string;
  dropBoxId?: string;
};

const ROOT = ["table-context"] as const;
const serialize = <T extends KeyFilter>(filters?: T) =>
  serializeKeyFilters(filters);

export const tableContextKeys = {
  root: ROOT,
  tables: Object.assign(
    (filters: TableContextFilters = {}) =>
      [...ROOT, "tables", serialize(filters)] as const,
    { scope: [...ROOT, "tables"] as const },
  ),
  active: (casinoId: string) => [...ROOT, "active", casinoId] as const,
  byTable: (tableId: string) => [...ROOT, "by-table", tableId] as const,
  dealerRotations: (tableId: string) =>
    [...ROOT, "dealer-rotations", tableId] as const,
  startRotation: (tableId: string) =>
    [...ROOT, "start-rotation", tableId] as const,
  inventorySnapshots: Object.assign(
    (filters: TableInventorySnapshotFilters = {}) =>
      [...ROOT, "inventory-snapshots", serialize(filters)] as const,
    { scope: [...ROOT, "inventory-snapshots"] as const },
  ),
  fills: Object.assign(
    (filters: TableFillFilters = {}) =>
      [...ROOT, "fills", serialize(filters)] as const,
    { scope: [...ROOT, "fills"] as const },
  ),
  credits: Object.assign(
    (filters: TableCreditFilters = {}) =>
      [...ROOT, "credits", serialize(filters)] as const,
    { scope: [...ROOT, "credits"] as const },
  ),
  dropEvents: Object.assign(
    (filters: TableDropEventFilters = {}) =>
      [...ROOT, "drop-events", serialize(filters)] as const,
    { scope: [...ROOT, "drop-events"] as const },
  ),
  logInventorySnapshot: [...ROOT, "mutations", "inventory-snapshot"] as const,
  requestFill: [...ROOT, "mutations", "request-fill"] as const,
  requestCredit: [...ROOT, "mutations", "request-credit"] as const,
  logDropEvent: [...ROOT, "mutations", "drop-event"] as const,
};

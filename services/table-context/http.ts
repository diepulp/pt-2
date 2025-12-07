/**
 * TableContextService HTTP Fetchers
 *
 * Client-side fetchers for Route Handlers.
 * Used by React Query hooks and UI components.
 *
 * @see SLAD section 340-341 (http.ts requirement)
 * @see EDGE_TRANSPORT_POLICY.md section 2-3
 */

import type {
  GamingTableDTO,
  GamingTableWithDealerDTO,
  DealerRotationDTO,
  TableInventorySnapshotDTO,
  TableFillDTO,
  TableCreditDTO,
  TableDropEventDTO,
  TableListFilters,
} from "./dtos";
import type {
  LogInventorySnapshotRequestBody,
  RequestTableFillRequestBody,
  RequestTableCreditRequestBody,
  LogDropEventRequestBody,
  AssignDealerRequestBody,
} from "./schemas";

const BASE_URL = "/api/v1";

// === Table CRUD ===

export async function fetchTables(
  filters: TableListFilters = {},
): Promise<GamingTableDTO[]> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.pit) params.set("pit", filters.pit);
  if (filters.type) params.set("type", filters.type);
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.limit) params.set("limit", String(filters.limit));

  const res = await fetch(`${BASE_URL}/tables?${params.toString()}`);
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function fetchTable(tableId: string): Promise<GamingTableDTO> {
  const res = await fetch(`${BASE_URL}/tables/${tableId}`);
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function fetchActiveTables(): Promise<GamingTableWithDealerDTO[]> {
  const res = await fetch(
    `${BASE_URL}/tables?status=active&include_dealer=true`,
  );
  if (!res.ok) throw await res.json();
  return res.json();
}

// === Table Lifecycle ===

export async function activateTable(
  tableId: string,
  idempotencyKey: string,
): Promise<GamingTableDTO> {
  const res = await fetch(`${BASE_URL}/tables/${tableId}/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-idempotency-key": idempotencyKey,
    },
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function deactivateTable(
  tableId: string,
  idempotencyKey: string,
): Promise<GamingTableDTO> {
  const res = await fetch(`${BASE_URL}/tables/${tableId}/deactivate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-idempotency-key": idempotencyKey,
    },
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function closeTable(
  tableId: string,
  idempotencyKey: string,
): Promise<GamingTableDTO> {
  const res = await fetch(`${BASE_URL}/tables/${tableId}/close`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-idempotency-key": idempotencyKey,
    },
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

// === Dealer Operations ===

export async function assignDealer(
  tableId: string,
  input: AssignDealerRequestBody,
  idempotencyKey: string,
): Promise<DealerRotationDTO> {
  const res = await fetch(`${BASE_URL}/tables/${tableId}/dealer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function endDealerRotation(
  tableId: string,
  idempotencyKey: string,
): Promise<DealerRotationDTO> {
  const res = await fetch(`${BASE_URL}/tables/${tableId}/dealer`, {
    method: "DELETE",
    headers: {
      "x-idempotency-key": idempotencyKey,
    },
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

// === Chip Custody Operations ===

export async function logInventorySnapshot(
  input: LogInventorySnapshotRequestBody,
  idempotencyKey: string,
): Promise<TableInventorySnapshotDTO> {
  const res = await fetch(`${BASE_URL}/table-context/inventory-snapshots`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function requestTableFill(
  input: RequestTableFillRequestBody,
  idempotencyKey: string,
): Promise<TableFillDTO> {
  const res = await fetch(`${BASE_URL}/table-context/fills`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function requestTableCredit(
  input: RequestTableCreditRequestBody,
  idempotencyKey: string,
): Promise<TableCreditDTO> {
  const res = await fetch(`${BASE_URL}/table-context/credits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function logDropEvent(
  input: LogDropEventRequestBody,
  idempotencyKey: string,
): Promise<TableDropEventDTO> {
  const res = await fetch(`${BASE_URL}/table-context/drop-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

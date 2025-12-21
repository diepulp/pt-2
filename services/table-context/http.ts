/**
 * TableContextService HTTP Fetchers
 *
 * Client-side fetchers for Route Handlers.
 * Used by React Query hooks and UI components.
 *
 * @see SLAD section 340-341 (http.ts requirement)
 * @see EDGE_TRANSPORT_POLICY.md section 2-3
 */

import { fetchJSON } from "@/lib/http/fetch-json";

import type {
  GamingTableDTO,
  GamingTableWithDealerDTO,
  DealerRotationDTO,
  TableInventorySnapshotDTO,
  TableFillDTO,
  TableCreditDTO,
  TableDropEventDTO,
  TableListFilters,
  TableSettingsDTO,
} from "./dtos";
import type {
  LogInventorySnapshotRequestBody,
  RequestTableFillRequestBody,
  RequestTableCreditRequestBody,
  LogDropEventRequestBody,
  AssignDealerRequestBody,
  UpdateTableLimitsRequestBody,
} from "./schemas";

const BASE_URL = "/api/v1";

// === Helper Functions ===

/**
 * Builds URLSearchParams from filter object, excluding undefined/null values.
 */
function buildParams(
  filters: Record<string, string | number | boolean | undefined | null>,
): URLSearchParams {
  const entries = Object.entries(filters).filter(
    ([, value]) => value != null,
  ) as [string, string | number | boolean][];

  return new URLSearchParams(
    entries.map(([key, value]) => [key, String(value)]),
  );
}

/**
 * Generates a unique idempotency key for mutations.
 */
function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

// === Table CRUD ===

export async function fetchTables(
  filters: TableListFilters = {},
): Promise<GamingTableDTO[]> {
  const params = buildParams(filters);
  const url = params.toString()
    ? `${BASE_URL}/tables?${params}`
    : `${BASE_URL}/tables`;
  // fetchJSON unwraps ServiceHttpResult.data, so we get the array directly
  return fetchJSON<GamingTableDTO[]>(url);
}

export async function fetchTable(tableId: string): Promise<GamingTableDTO> {
  return fetchJSON<GamingTableDTO>(`${BASE_URL}/tables/${tableId}`);
}

export async function fetchActiveTables(): Promise<GamingTableWithDealerDTO[]> {
  const params = buildParams({ status: "active", include_dealer: true });
  const url = `${BASE_URL}/tables?${params}`;
  // fetchJSON unwraps ServiceHttpResult.data, so we get the array directly
  return fetchJSON<GamingTableWithDealerDTO[]>(url);
}

// === Table Lifecycle ===

export async function activateTable(
  tableId: string,
  idempotencyKey?: string,
): Promise<GamingTableDTO> {
  return fetchJSON<GamingTableDTO>(`${BASE_URL}/tables/${tableId}/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": idempotencyKey ?? generateIdempotencyKey(),
    },
  });
}

export async function deactivateTable(
  tableId: string,
  idempotencyKey?: string,
): Promise<GamingTableDTO> {
  return fetchJSON<GamingTableDTO>(`${BASE_URL}/tables/${tableId}/deactivate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": idempotencyKey ?? generateIdempotencyKey(),
    },
  });
}

export async function closeTable(
  tableId: string,
  idempotencyKey?: string,
): Promise<GamingTableDTO> {
  return fetchJSON<GamingTableDTO>(`${BASE_URL}/tables/${tableId}/close`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": idempotencyKey ?? generateIdempotencyKey(),
    },
  });
}

// === Dealer Operations ===

export async function assignDealer(
  tableId: string,
  input: AssignDealerRequestBody,
  idempotencyKey?: string,
): Promise<DealerRotationDTO> {
  return fetchJSON<DealerRotationDTO>(`${BASE_URL}/tables/${tableId}/dealer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": idempotencyKey ?? generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

export async function endDealerRotation(
  tableId: string,
  idempotencyKey?: string,
): Promise<DealerRotationDTO> {
  return fetchJSON<DealerRotationDTO>(`${BASE_URL}/tables/${tableId}/dealer`, {
    method: "DELETE",
    headers: {
      "idempotency-key": idempotencyKey ?? generateIdempotencyKey(),
    },
  });
}

// === Chip Custody Operations ===

export async function logInventorySnapshot(
  input: LogInventorySnapshotRequestBody,
  idempotencyKey?: string,
): Promise<TableInventorySnapshotDTO> {
  return fetchJSON<TableInventorySnapshotDTO>(
    `${BASE_URL}/table-context/inventory-snapshots`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "idempotency-key": idempotencyKey ?? generateIdempotencyKey(),
      },
      body: JSON.stringify(input),
    },
  );
}

export async function requestTableFill(
  input: RequestTableFillRequestBody,
  idempotencyKey?: string,
): Promise<TableFillDTO> {
  return fetchJSON<TableFillDTO>(`${BASE_URL}/table-context/fills`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": idempotencyKey ?? generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

export async function requestTableCredit(
  input: RequestTableCreditRequestBody,
  idempotencyKey?: string,
): Promise<TableCreditDTO> {
  return fetchJSON<TableCreditDTO>(`${BASE_URL}/table-context/credits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": idempotencyKey ?? generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

export async function logDropEvent(
  input: LogDropEventRequestBody,
  idempotencyKey?: string,
): Promise<TableDropEventDTO> {
  return fetchJSON<TableDropEventDTO>(`${BASE_URL}/table-context/drop-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": idempotencyKey ?? generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

// === Table Settings (Betting Limits) ===

export async function fetchTableSettings(
  tableId: string,
): Promise<TableSettingsDTO> {
  return fetchJSON<TableSettingsDTO>(`${BASE_URL}/tables/${tableId}/settings`);
}

export async function patchTableLimits(
  tableId: string,
  data: UpdateTableLimitsRequestBody,
  idempotencyKey?: string,
): Promise<TableSettingsDTO> {
  return fetchJSON<TableSettingsDTO>(`${BASE_URL}/tables/${tableId}/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": idempotencyKey ?? generateIdempotencyKey(),
    },
    body: JSON.stringify(data),
  });
}

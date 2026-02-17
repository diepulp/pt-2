/**
 * TableContextService HTTP Fetchers
 *
 * Client-side fetchers for Route Handlers.
 * Used by React Query hooks and UI components.
 *
 * @see SLAD section 340-341 (http.ts requirement)
 * @see EDGE_TRANSPORT_POLICY.md section 2-3
 */

import { fetchJSON } from '@/lib/http/fetch-json';
import { IDEMPOTENCY_HEADER } from '@/lib/http/headers';

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
  TableSessionDTO,
} from './dtos';
import type {
  LogInventorySnapshotRequestBody,
  RequestTableFillRequestBody,
  RequestTableCreditRequestBody,
  LogDropEventRequestBody,
  AssignDealerRequestBody,
  UpdateTableLimitsRequestBody,
  CloseTableSessionRequestBody,
  OpenTableSessionRequestBody,
  ConfirmTableFillRequestBody,
  ConfirmTableCreditRequestBody,
} from './schemas';

const BASE_URL = '/api/v1';

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
  const params = buildParams({ status: 'active', include_dealer: true });
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
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
    },
  });
}

export async function deactivateTable(
  tableId: string,
  idempotencyKey?: string,
): Promise<GamingTableDTO> {
  return fetchJSON<GamingTableDTO>(`${BASE_URL}/tables/${tableId}/deactivate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
    },
  });
}

export async function closeTable(
  tableId: string,
  idempotencyKey?: string,
): Promise<GamingTableDTO> {
  return fetchJSON<GamingTableDTO>(`${BASE_URL}/tables/${tableId}/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
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
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

export async function endDealerRotation(
  tableId: string,
  idempotencyKey?: string,
): Promise<DealerRotationDTO> {
  return fetchJSON<DealerRotationDTO>(`${BASE_URL}/tables/${tableId}/dealer`, {
    method: 'DELETE',
    headers: {
      [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
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
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
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
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

export async function requestTableCredit(
  input: RequestTableCreditRequestBody,
  idempotencyKey?: string,
): Promise<TableCreditDTO> {
  return fetchJSON<TableCreditDTO>(`${BASE_URL}/table-context/credits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

export async function logDropEvent(
  input: LogDropEventRequestBody,
  idempotencyKey?: string,
): Promise<TableDropEventDTO> {
  return fetchJSON<TableDropEventDTO>(`${BASE_URL}/table-context/drop-events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
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
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
    },
    body: JSON.stringify(data),
  });
}

// === Table Session Operations (PRD-TABLE-SESSION-LIFECYCLE-MVP) ===

/**
 * Opens a new table session.
 * POST /api/v1/table-sessions
 */
export async function openTableSession(
  input: OpenTableSessionRequestBody,
  idempotencyKey?: string,
): Promise<TableSessionDTO> {
  return fetchJSON<TableSessionDTO>(`${BASE_URL}/table-sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

/**
 * Starts rundown for a table session.
 * PATCH /api/v1/table-sessions/[id]/rundown
 */
export async function startTableRundown(
  sessionId: string,
  idempotencyKey?: string,
): Promise<TableSessionDTO> {
  return fetchJSON<TableSessionDTO>(
    `${BASE_URL}/table-sessions/${sessionId}/rundown`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
      },
    },
  );
}

/**
 * Closes a table session.
 * PATCH /api/v1/table-sessions/[id]/close
 */
export async function closeTableSession(
  sessionId: string,
  input: CloseTableSessionRequestBody,
  idempotencyKey?: string,
): Promise<TableSessionDTO> {
  return fetchJSON<TableSessionDTO>(
    `${BASE_URL}/table-sessions/${sessionId}/close`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
      },
      body: JSON.stringify(input),
    },
  );
}

/**
 * Gets the current session for a gaming table.
 * GET /api/v1/tables/[tableId]/current-session
 */
export async function fetchCurrentTableSession(
  tableId: string,
): Promise<TableSessionDTO | null> {
  try {
    return await fetchJSON<TableSessionDTO>(
      `${BASE_URL}/tables/${tableId}/current-session`,
    );
  } catch {
    // 404 means no active session
    return null;
  }
}

// === Cashier Confirmation Operations (PRD-033) ===

/**
 * Confirms a table fill fulfillment.
 * PATCH /api/v1/table-context/fills/[id]/confirm
 */
export async function confirmTableFill(
  fillId: string,
  input: ConfirmTableFillRequestBody,
  idempotencyKey?: string,
): Promise<TableFillDTO> {
  return fetchJSON<TableFillDTO>(
    `${BASE_URL}/table-context/fills/${fillId}/confirm`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
      },
      body: JSON.stringify(input),
    },
  );
}

/**
 * Confirms a table credit receipt.
 * PATCH /api/v1/table-context/credits/[id]/confirm
 */
export async function confirmTableCredit(
  creditId: string,
  input: ConfirmTableCreditRequestBody,
  idempotencyKey?: string,
): Promise<TableCreditDTO> {
  return fetchJSON<TableCreditDTO>(
    `${BASE_URL}/table-context/credits/${creditId}/confirm`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
      },
      body: JSON.stringify(input),
    },
  );
}

/**
 * Acknowledges drop box received at cage.
 * PATCH /api/v1/table-context/drop-events/[id]/acknowledge
 */
export async function acknowledgeDropReceived(
  dropEventId: string,
  idempotencyKey?: string,
): Promise<TableDropEventDTO> {
  return fetchJSON<TableDropEventDTO>(
    `${BASE_URL}/table-context/drop-events/${dropEventId}/acknowledge`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
      },
    },
  );
}

/**
 * Fetches pending fills (status=requested) for current gaming day.
 * GET /api/v1/table-context/fills?status=requested&gaming_day=...
 */
export async function fetchPendingFills(
  gamingDay?: string,
): Promise<TableFillDTO[]> {
  const params = buildParams({
    status: 'requested',
    gaming_day: gamingDay,
  });
  return fetchJSON<TableFillDTO[]>(`${BASE_URL}/table-context/fills?${params}`);
}

/**
 * Fetches pending credits (status=requested) for current gaming day.
 * GET /api/v1/table-context/credits?status=requested&gaming_day=...
 */
export async function fetchPendingCredits(
  gamingDay?: string,
): Promise<TableCreditDTO[]> {
  const params = buildParams({
    status: 'requested',
    gaming_day: gamingDay,
  });
  return fetchJSON<TableCreditDTO[]>(
    `${BASE_URL}/table-context/credits?${params}`,
  );
}

/**
 * Fetches unacknowledged drops for current gaming day.
 * GET /api/v1/table-context/drop-events?cage_received=false&gaming_day=...
 */
export async function fetchUnacknowledgedDrops(
  gamingDay?: string,
): Promise<TableDropEventDTO[]> {
  const params = buildParams({
    cage_received: 'false',
    gaming_day: gamingDay,
  });
  return fetchJSON<TableDropEventDTO[]>(
    `${BASE_URL}/table-context/drop-events?${params}`,
  );
}

# EXECUTION-SPEC-PRD-007: TableContextService Implementation

**Generated**: 2025-12-07
**PRD**: [PRD-007-table-context-service.md](../../../10-prd/PRD-007-table-context-service.md)
**Pattern**: A (Contract-First) per SLAD §308-348 (v3.0.0)
**Status**: Ready for Parallel Execution

---

## Executive Summary

TableContextService manages gaming table lifecycle, dealer rotations, and chip custody operations. This service follows **Pattern A (Contract-First)** due to its complex domain logic (state machines, custody chains, idempotency).

**Bounded Context**: "What is the operational state and chip custody posture of this gaming table?"

**Owned Tables**: `gaming_table`, `gaming_table_settings`, `dealer_rotation`, `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event`

---

## Workstream Decomposition

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PRD-007 WORKSTREAMS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐     │
│  │   WS-1      │   │   WS-2      │   │   WS-3      │   │   WS-4      │     │
│  │ Foundation  │   │ Table Ops   │   │ Chip Ops    │   │ API Routes  │     │
│  │  (dtos,     │   │ (lifecycle  │   │ (fills,     │   │ (handlers)  │     │
│  │  schemas,   │   │  dealer,    │   │  credits,   │   │             │     │
│  │  keys)      │   │  queries)   │   │  drops)     │   │             │     │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘     │
│         │                 │                 │                  │            │
│         │                 │                 │                  │            │
│         v                 v                 v                  v            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                          WS-5: Testing                               │  │
│  │              (unit tests, integration tests, mappers.test.ts)        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

PARALLEL EXECUTION:
  - WS-1 → WS-2, WS-3 (parallel after WS-1 complete)
  - WS-4 depends on WS-2 + WS-3
  - WS-5 runs continuously, finalizes after WS-4
```

---

## WS-1: Foundation (PARALLEL START)

**Agent**: `pt2-service-implementer`
**Files to Create**:
- `services/table-context/dtos.ts`
- `services/table-context/schemas.ts`
- `services/table-context/keys.ts`
- `services/table-context/selects.ts`
- `services/table-context/mappers.ts`
- `services/table-context/http.ts`
- `services/table-context/README.md`

### 1.1 DTOs (`dtos.ts`)

Pattern A allows manual interfaces. Define domain contracts:

```typescript
/**
 * TableContextService DTOs
 *
 * Pattern A (Contract-First): Manual interfaces with domain contracts.
 * All types derived from Database types where applicable.
 *
 * @see PRD-007 Table Context Service
 * @see SERVICE_RESPONSIBILITY_MATRIX.md §298-333
 */

import type { Database } from "@/types/database.types";

// === Enum Types ===
export type TableStatus = Database["public"]["Enums"]["table_status"];
export type GameType = Database["public"]["Enums"]["game_type"];

// === Chipset Type (JSONB payload) ===
/** Denomination → quantity mapping for chip counts */
export type ChipsetPayload = Record<string, number>;

// === Gaming Table DTOs ===

/** Public table record */
export interface GamingTableDTO {
  id: string;
  casino_id: string;
  label: string;
  pit: string | null;
  type: GameType;
  status: TableStatus;
  created_at: string;
}

/** Table with current dealer info for dashboard queries */
export interface GamingTableWithDealerDTO extends GamingTableDTO {
  current_dealer: {
    staff_id: string;
    started_at: string;
  } | null;
}

// === Dealer Rotation DTOs ===

export interface DealerRotationDTO {
  id: string;
  casino_id: string;
  table_id: string;
  staff_id: string | null;
  started_at: string;
  ended_at: string | null;
}

// === Table Lifecycle DTOs ===

export interface ActivateTableInput {
  tableId: string;
  casinoId: string;
}

export interface DeactivateTableInput {
  tableId: string;
  casinoId: string;
}

export interface CloseTableInput {
  tableId: string;
  casinoId: string;
}

// === Dealer Assignment DTOs ===

export interface AssignDealerInput {
  tableId: string;
  casinoId: string;
  staffId: string;
}

export interface EndDealerRotationInput {
  tableId: string;
  casinoId: string;
}

// === Inventory Snapshot DTOs ===

export type SnapshotType = "open" | "close" | "rundown";

export interface TableInventorySnapshotDTO {
  id: string;
  casino_id: string;
  table_id: string;
  snapshot_type: SnapshotType;
  chipset: ChipsetPayload;
  counted_by: string | null;
  verified_by: string | null;
  discrepancy_cents: number | null;
  note: string | null;
  created_at: string;
}

export interface LogInventorySnapshotInput {
  casinoId: string;
  tableId: string;
  snapshotType: SnapshotType;
  chipset: ChipsetPayload;
  countedBy?: string;
  verifiedBy?: string;
  discrepancyCents?: number;
  note?: string;
}

// === Table Fill DTOs ===

export interface TableFillDTO {
  id: string;
  casino_id: string;
  table_id: string;
  request_id: string;
  chipset: ChipsetPayload;
  amount_cents: number;
  requested_by: string;
  delivered_by: string;
  received_by: string;
  slip_no: string;
  created_at: string;
}

export interface RequestTableFillInput {
  casinoId: string;
  tableId: string;
  requestId: string; // Idempotency key
  chipset: ChipsetPayload;
  amountCents: number;
  requestedBy: string;
  deliveredBy: string;
  receivedBy: string;
  slipNo: string;
}

// === Table Credit DTOs ===

export interface TableCreditDTO {
  id: string;
  casino_id: string;
  table_id: string;
  request_id: string;
  chipset: ChipsetPayload;
  amount_cents: number;
  authorized_by: string;
  sent_by: string;
  received_by: string;
  slip_no: string;
  created_at: string;
}

export interface RequestTableCreditInput {
  casinoId: string;
  tableId: string;
  requestId: string; // Idempotency key
  chipset: ChipsetPayload;
  amountCents: number;
  authorizedBy: string;
  sentBy: string;
  receivedBy: string;
  slipNo: string;
}

// === Table Drop Event DTOs ===

export interface TableDropEventDTO {
  id: string;
  casino_id: string;
  table_id: string;
  drop_box_id: string;
  seal_no: string;
  gaming_day: string | null;
  seq_no: number | null;
  removed_by: string;
  witnessed_by: string;
  removed_at: string | null;
  delivered_at: string | null;
  delivered_scan_at: string | null;
  note: string | null;
}

export interface LogDropEventInput {
  casinoId: string;
  tableId: string;
  dropBoxId: string;
  sealNo: string;
  removedBy: string;
  witnessedBy: string;
  removedAt?: string;
  deliveredAt?: string;
  deliveredScanAt?: string;
  gamingDay?: string;
  seqNo?: number;
  note?: string;
}

// === Filter Types ===

export type TableListFilters = {
  casinoId?: string;
  status?: TableStatus;
  pit?: string;
  type?: GameType;
  cursor?: string;
  limit?: number;
};

export type DealerRotationFilters = {
  tableId?: string;
  staffId?: string;
  activeOnly?: boolean;
};
```

### 1.2 Zod Schemas (`schemas.ts`)

```typescript
/**
 * TableContextService Zod Schemas
 *
 * Validation schemas for API operations.
 * Used by route handlers for request validation per ADR-013.
 *
 * NOTE: Schemas stay snake_case to mirror HTTP payloads; service-layer DTOs remain
 * camelCase in `dtos.ts`. Route handlers must map schema outputs → DTO inputs.
 *
 * @see PRD-007 Table Context Service
 */

import { z } from "zod";

// === Enum Schemas ===

export const tableStatusSchema = z.enum(["inactive", "active", "closed"]);
export const gameTypeSchema = z.enum(["blackjack", "poker", "roulette", "baccarat"]);
export const snapshotTypeSchema = z.enum(["open", "close", "rundown"]);

// === Chipset Schema ===

/**
 * Validates chipset payload (denomination → quantity).
 * Keys should be string denominations, values positive integers.
 */
export const chipsetSchema = z.record(
  z.string(),
  z.number().int().min(0, "Chip quantity must be non-negative")
);

// === Table Lifecycle Schemas ===

export const activateTableSchema = z.object({
  table_id: z.string().uuid("Invalid table ID format"),
});

export const deactivateTableSchema = z.object({
  table_id: z.string().uuid("Invalid table ID format"),
});

export const closeTableSchema = z.object({
  table_id: z.string().uuid("Invalid table ID format"),
});

// === Dealer Schemas ===

export const assignDealerSchema = z.object({
  staff_id: z.string().uuid("Invalid staff ID format"),
});

// === Inventory Snapshot Schema ===

export const logInventorySnapshotSchema = z.object({
  table_id: z.string().uuid("Invalid table ID format"),
  snapshot_type: snapshotTypeSchema,
  chipset: chipsetSchema,
  counted_by: z.string().uuid().optional(),
  verified_by: z.string().uuid().optional(),
  discrepancy_cents: z.number().int().optional(),
  note: z.string().max(500).optional(),
});

// === Fill/Credit Schemas ===

export const requestTableFillSchema = z.object({
  table_id: z.string().uuid("Invalid table ID format"),
  request_id: z.string().min(1, "Request ID is required"), // Idempotency key
  chipset: chipsetSchema,
  amount_cents: z.number().int().positive("Amount must be positive"),
  requested_by: z.string().uuid("Invalid staff ID format"),
  delivered_by: z.string().uuid("Invalid staff ID format"),
  received_by: z.string().uuid("Invalid staff ID format"),
  slip_no: z.string().min(1, "Slip number is required"),
});

export const requestTableCreditSchema = z.object({
  table_id: z.string().uuid("Invalid table ID format"),
  request_id: z.string().min(1, "Request ID is required"), // Idempotency key
  chipset: chipsetSchema,
  amount_cents: z.number().int().positive("Amount must be positive"),
  authorized_by: z.string().uuid("Invalid staff ID format"),
  sent_by: z.string().uuid("Invalid staff ID format"),
  received_by: z.string().uuid("Invalid staff ID format"),
  slip_no: z.string().min(1, "Slip number is required"),
});

// === Drop Event Schema ===

export const logDropEventSchema = z.object({
  table_id: z.string().uuid("Invalid table ID format"),
  drop_box_id: z.string().min(1, "Drop box ID is required"),
  seal_no: z.string().min(1, "Seal number is required"),
  removed_by: z.string().uuid("Invalid staff ID format"),
  witnessed_by: z.string().uuid("Invalid staff ID format"),
  removed_at: z.string().datetime().optional(),
  delivered_at: z.string().datetime().optional(),
  delivered_scan_at: z.string().datetime().optional(),
  gaming_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  seq_no: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
});

// === Query Schemas ===

export const tableListQuerySchema = z.object({
  status: tableStatusSchema.optional(),
  pit: z.string().optional(),
  type: gameTypeSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const tableRouteParamsSchema = z.object({
  tableId: z.string().uuid("Invalid table ID format"),
});

// === Transport Type Exports (HTTP-only; map to camelCase DTOs in services) ===

export type ActivateTableInput = z.infer<typeof activateTableSchema>;
export type DeactivateTableInput = z.infer<typeof deactivateTableSchema>;
export type CloseTableInput = z.infer<typeof closeTableSchema>;
export type AssignDealerInput = z.infer<typeof assignDealerSchema>;
export type LogInventorySnapshotInput = z.infer<typeof logInventorySnapshotSchema>;
export type RequestTableFillInput = z.infer<typeof requestTableFillSchema>;
export type RequestTableCreditInput = z.infer<typeof requestTableCreditSchema>;
export type LogDropEventInput = z.infer<typeof logDropEventSchema>;
export type TableListQuery = z.infer<typeof tableListQuerySchema>;
```

### 1.3 React Query Keys (`keys.ts`)

```typescript
/**
 * TableContextService React Query Keys
 *
 * @see SLAD §308 for key factory patterns
 */

import { serializeKeyFilters } from "@/services/shared/key-utils";
import type { TableListFilters, DealerRotationFilters } from "./dtos";

const ROOT = ["table-context"] as const;
const serialize = <T extends Record<string, unknown>>(filters: T) =>
  serializeKeyFilters(filters);

export const tableContextKeys = {
  root: ROOT,

  // Gaming tables
  tables: Object.assign(
    (filters: TableListFilters = {}) =>
      [...ROOT, "tables", serialize(filters)] as const,
    { scope: [...ROOT, "tables"] as const }
  ),
  table: (id: string) => [...ROOT, "table", id] as const,

  // Dealer rotations
  rotations: Object.assign(
    (filters: DealerRotationFilters = {}) =>
      [...ROOT, "rotations", serialize(filters)] as const,
    { scope: [...ROOT, "rotations"] as const }
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
```

### 1.4 Selects (`selects.ts`)

```typescript
/**
 * TableContextService Named Column Projections
 *
 * @see SLAD §326 for select patterns
 */

// Gaming table projections
export const GAMING_TABLE_SELECT = `
  id,
  casino_id,
  label,
  pit,
  type,
  status,
  created_at
` as const;

export const GAMING_TABLE_WITH_DEALER_SELECT = `
  id,
  casino_id,
  label,
  pit,
  type,
  status,
  created_at,
  dealer_rotation!inner (
    staff_id,
    started_at
  )
` as const;

// Dealer rotation projection
export const DEALER_ROTATION_SELECT = `
  id,
  casino_id,
  table_id,
  staff_id,
  started_at,
  ended_at
` as const;

// Inventory snapshot projection
export const TABLE_INVENTORY_SNAPSHOT_SELECT = `
  id,
  casino_id,
  table_id,
  snapshot_type,
  chipset,
  counted_by,
  verified_by,
  discrepancy_cents,
  note,
  created_at
` as const;

// Fill projection
export const TABLE_FILL_SELECT = `
  id,
  casino_id,
  table_id,
  request_id,
  chipset,
  amount_cents,
  requested_by,
  delivered_by,
  received_by,
  slip_no,
  created_at
` as const;

// Credit projection
export const TABLE_CREDIT_SELECT = `
  id,
  casino_id,
  table_id,
  request_id,
  chipset,
  amount_cents,
  authorized_by,
  sent_by,
  received_by,
  slip_no,
  created_at
` as const;

// Drop event projection
export const TABLE_DROP_EVENT_SELECT = `
  id,
  casino_id,
  table_id,
  drop_box_id,
  seal_no,
  gaming_day,
  seq_no,
  removed_by,
  witnessed_by,
  removed_at,
  delivered_at,
  delivered_scan_at,
  note
` as const;
```

### 1.5 Mappers (`mappers.ts`)

```typescript
/**
 * TableContextService Mappers
 *
 * Type-safe transformations from Supabase rows/RPC returns to DTOs.
 * Eliminates `as` type assertions per SLAD v3.0.0.
 *
 * @see SLAD §327-365
 */

import type { Database } from "@/types/database.types";
import type {
  GamingTableDTO,
  GamingTableWithDealerDTO,
  DealerRotationDTO,
  TableInventorySnapshotDTO,
  TableFillDTO,
  TableCreditDTO,
  TableDropEventDTO,
  TableStatus,
  GameType,
  ChipsetPayload,
} from "./dtos";

// === Row Types (match query projections) ===

type GamingTableSelectedRow = {
  id: string;
  casino_id: string;
  label: string;
  pit: string | null;
  type: GameType;
  status: TableStatus;
  created_at: string;
};

type GamingTableWithDealerSelectedRow = GamingTableSelectedRow & {
  dealer_rotation: {
    staff_id: string;
    started_at: string;
  }[] | null;
};

type DealerRotationSelectedRow = {
  id: string;
  casino_id: string;
  table_id: string;
  staff_id: string | null;
  started_at: string;
  ended_at: string | null;
};

// RPC Return Types
type RpcTableInventorySnapshotReturn =
  Database["public"]["Functions"]["rpc_log_table_inventory_snapshot"]["Returns"];
type RpcTableFillReturn =
  Database["public"]["Functions"]["rpc_request_table_fill"]["Returns"];
type RpcTableCreditReturn =
  Database["public"]["Functions"]["rpc_request_table_credit"]["Returns"];
type RpcTableDropReturn =
  Database["public"]["Functions"]["rpc_log_table_drop"]["Returns"];

// === Gaming Table Mappers ===

export function toGamingTableDTO(row: GamingTableSelectedRow): GamingTableDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    label: row.label,
    pit: row.pit,
    type: row.type,
    status: row.status,
    created_at: row.created_at,
  };
}

export function toGamingTableDTOList(
  rows: GamingTableSelectedRow[]
): GamingTableDTO[] {
  return rows.map(toGamingTableDTO);
}

export function toGamingTableDTOOrNull(
  row: GamingTableSelectedRow | null
): GamingTableDTO | null {
  return row ? toGamingTableDTO(row) : null;
}

export function toGamingTableWithDealerDTO(
  row: GamingTableWithDealerSelectedRow
): GamingTableWithDealerDTO {
  const activeRotation = row.dealer_rotation?.find(
    (r) => r.started_at && !("ended_at" in r)
  );

  return {
    id: row.id,
    casino_id: row.casino_id,
    label: row.label,
    pit: row.pit,
    type: row.type,
    status: row.status,
    created_at: row.created_at,
    current_dealer: activeRotation
      ? {
          staff_id: activeRotation.staff_id,
          started_at: activeRotation.started_at,
        }
      : null,
  };
}

// === Dealer Rotation Mappers ===

export function toDealerRotationDTO(
  row: DealerRotationSelectedRow
): DealerRotationDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    table_id: row.table_id,
    staff_id: row.staff_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
  };
}

export function toDealerRotationDTOList(
  rows: DealerRotationSelectedRow[]
): DealerRotationDTO[] {
  return rows.map(toDealerRotationDTO);
}

// === RPC Response Mappers ===

export function toTableInventorySnapshotDTO(
  rpcResult: RpcTableInventorySnapshotReturn
): TableInventorySnapshotDTO {
  return {
    id: rpcResult.id,
    casino_id: rpcResult.casino_id,
    table_id: rpcResult.table_id,
    snapshot_type: rpcResult.snapshot_type,
    chipset: rpcResult.chipset as ChipsetPayload,
    counted_by: rpcResult.counted_by,
    verified_by: rpcResult.verified_by,
    discrepancy_cents: rpcResult.discrepancy_cents,
    note: rpcResult.note,
    created_at: rpcResult.created_at,
  };
}

export function toTableFillDTO(rpcResult: RpcTableFillReturn): TableFillDTO {
  return {
    id: rpcResult.id,
    casino_id: rpcResult.casino_id,
    table_id: rpcResult.table_id,
    request_id: rpcResult.request_id,
    chipset: rpcResult.chipset as ChipsetPayload,
    amount_cents: rpcResult.amount_cents,
    requested_by: rpcResult.requested_by,
    delivered_by: rpcResult.delivered_by,
    received_by: rpcResult.received_by,
    slip_no: rpcResult.slip_no,
    created_at: rpcResult.created_at,
  };
}

export function toTableCreditDTO(
  rpcResult: RpcTableCreditReturn
): TableCreditDTO {
  return {
    id: rpcResult.id,
    casino_id: rpcResult.casino_id,
    table_id: rpcResult.table_id,
    request_id: rpcResult.request_id,
    chipset: rpcResult.chipset as ChipsetPayload,
    amount_cents: rpcResult.amount_cents,
    authorized_by: rpcResult.authorized_by,
    sent_by: rpcResult.sent_by,
    received_by: rpcResult.received_by,
    slip_no: rpcResult.slip_no,
    created_at: rpcResult.created_at,
  };
}

export function toTableDropEventDTO(
  rpcResult: RpcTableDropReturn
): TableDropEventDTO {
  return {
    id: rpcResult.id,
    casino_id: rpcResult.casino_id,
    table_id: rpcResult.table_id,
    drop_box_id: rpcResult.drop_box_id,
    seal_no: rpcResult.seal_no,
    gaming_day: rpcResult.gaming_day,
    seq_no: rpcResult.seq_no,
    removed_by: rpcResult.removed_by,
    witnessed_by: rpcResult.witnessed_by,
    removed_at: rpcResult.removed_at,
    delivered_at: rpcResult.delivered_at,
    delivered_scan_at: rpcResult.delivered_scan_at,
    note: rpcResult.note,
  };
}
```

### 1.6 README (`README.md`)

```markdown
# TableContextService - Operational Telemetry Context

> **Bounded Context**: "What is the operational state and chip custody posture of this gaming table?"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §298-333](../../SERVICE_RESPONSIBILITY_MATRIX.md)
> **Pattern**: A (Contract-First)
> **Status**: In Progress

## Ownership

**Tables**:
- `gaming_table` - Core table entity with status lifecycle
- `gaming_table_settings` - Table-specific settings (limits, rotation intervals)
- `dealer_rotation` - Dealer assignment history
- `table_inventory_snapshot` - Chip inventory at open/close/rundown
- `table_fill` - Chip fills from cage
- `table_credit` - Chip credits back to cage
- `table_drop_event` - Drop box custody chain

**DTOs**:
- `GamingTableDTO`, `GamingTableWithDealerDTO`
- `DealerRotationDTO`
- `TableInventorySnapshotDTO`
- `TableFillDTO`, `TableCreditDTO`
- `TableDropEventDTO`

**RPCs**:
- `rpc_log_table_inventory_snapshot`
- `rpc_request_table_fill`
- `rpc_request_table_credit`
- `rpc_log_table_drop`

## Dependencies

**Consumes**:
- CasinoService (casino_id context, staff validation)

**Consumed By**:
- RatingSlipService (table_id FK)
- FloorLayoutService (floor_table_slot references)
- Pit Dashboard (PRD-006)

## Pattern Justification

Pattern A (Contract-First) selected because:
1. Complex state machine (inactive → active → closed)
2. Chip custody operations with idempotency requirements
3. Dealer rotation logic with auto-end on reassignment
4. Multiple RPCs with domain-specific validation
5. Cross-context consumption by Pit Dashboard

## Domain Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `TABLE_NOT_FOUND` | 404 | Gaming table does not exist |
| `TABLE_NOT_ACTIVE` | 409 | Operation requires active table |
| `TABLE_NOT_INACTIVE` | 409 | Activation requires inactive table |
| `TABLE_ALREADY_CLOSED` | 409 | Table is already closed (terminal state) |
| `TABLE_HAS_OPEN_SLIPS` | 409 | Cannot deactivate with open rating slips |
| `FILL_DUPLICATE_REQUEST` | 409 | Fill request_id already processed |
| `CREDIT_DUPLICATE_REQUEST` | 409 | Credit request_id already processed |
| `DEALER_ROTATION_NOT_FOUND` | 404 | No active dealer rotation to end |

## References

- [PRD-007 Table Context Service](../../../docs/10-prd/PRD-007-table-context-service.md)
- [SRM §298-333](../../SERVICE_RESPONSIBILITY_MATRIX.md)
- [SLAD §308-348](../../SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)
- [Chip Custody Migration](../../../supabase/migrations/20251108195341_table_context_chip_custody.sql)
```

### 1.7 HTTP Fetchers (`http.ts`)

Thin wrappers for Route Handlers per SLAD §340-341:

```typescript
/**
 * TableContextService HTTP Fetchers
 *
 * Client-side fetchers for Route Handlers.
 * Used by React Query hooks and UI components.
 *
 * @see SLAD §340-341 (http.ts requirement)
 * @see EDGE_TRANSPORT_POLICY.md §2-3
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
  LogInventorySnapshotInput,
  RequestTableFillInput,
  RequestTableCreditInput,
  LogDropEventInput,
  AssignDealerInput,
} from "./schemas";

const BASE_URL = "/api/v1";

// === Table CRUD ===

export async function fetchTables(
  filters: TableListFilters = {}
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
  const res = await fetch(`${BASE_URL}/tables?status=active&include_dealer=true`);
  if (!res.ok) throw await res.json();
  return res.json();
}

// === Table Lifecycle ===

export async function activateTable(
  tableId: string,
  idempotencyKey: string
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
  idempotencyKey: string
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
  idempotencyKey: string
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
  input: AssignDealerInput,
  idempotencyKey: string
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
  idempotencyKey: string
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
  input: LogInventorySnapshotInput,
  idempotencyKey: string
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
  input: RequestTableFillInput,
  idempotencyKey: string
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
  input: RequestTableCreditInput,
  idempotencyKey: string
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
  input: LogDropEventInput,
  idempotencyKey: string
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
```

---

## WS-2: Table Operations (DEPENDS: WS-1, RatingSlipService)

**Agent**: `pt2-service-implementer`
**Files to Create**:
- `services/table-context/table-lifecycle.ts`
- `services/table-context/dealer-rotation.ts`
- `services/table-context/crud.ts`

**SRM Alignment (TableContextService §298-333)**:
- Layout sync: add listener/handler to reconcile `floor_layout.activated` events (activation state).
- Casino validation: ensure `assert_table_context_casino()` trigger remains enforced on settings/rotations.

### Cross-Context Dependency: RatingSlipService

**IMPORTANT**: Per SLAD Bounded Context DTO Access Rules, TableContextService MUST NOT directly query the `rating_slip` table (owned by RatingSlipService).

The `deactivateTable` operation requires checking for open rating slips. This check MUST use a published query from RatingSlipService:

```typescript
// RatingSlipService must expose this query (services/rating-slip/index.ts)
export async function hasOpenSlipsForTable(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string
): Promise<boolean>;
```

**Implementation Options**:
1. **If RatingSlipService exists**: Import and call `hasOpenSlipsForTable`
2. **If RatingSlipService not yet built**: Create a stub in `services/rating-slip/queries.ts` that TableContextService can consume, to be replaced when PRD-002 is implemented

**Query Contract** (to be implemented by RatingSlipService):
```typescript
// services/rating-slip/queries.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Check if a table has any open (unsettled) rating slips.
 * Published query for cross-context consumption by TableContextService.
 *
 * @param supabase - Supabase client with RLS context
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID (RLS scoping)
 * @returns true if any open slips exist for this table
 */
export async function hasOpenSlipsForTable(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from("rating_slip")
    .select("id", { count: "exact", head: true })
    .eq("table_id", tableId)
    .eq("casino_id", casinoId)
    .eq("status", "open");

  if (error) {
    throw new DomainError("INTERNAL_ERROR", "Failed to check open slips");
  }

  return (count ?? 0) > 0;
}
```

### 2.1 Table Lifecycle (`table-lifecycle.ts`)

Implements state machine transitions: activate, deactivate, close.

```typescript
/**
 * Table Lifecycle Operations
 *
 * State machine: inactive → active → closed
 * Transitions: inactive ↔ active (bidirectional), active/inactive → closed (terminal)
 *
 * @see PRD-007 section 5.1 (Functional Requirements)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { DomainError } from "@/lib/errors/domain-errors";
import type { GamingTableDTO } from "./dtos";
import { toGamingTableDTO } from "./mappers";
import { GAMING_TABLE_SELECT } from "./selects";

// Cross-context query import (bounded context compliant)
import { hasOpenSlipsForTable } from "@/services/rating-slip/queries";

// === State Machine Transitions ===

const VALID_TRANSITIONS: Record<string, string[]> = {
  inactive: ["active", "closed"],
  active: ["inactive", "closed"],
  closed: [], // Terminal state
};

function assertValidTransition(
  currentStatus: string,
  targetStatus: string
): void {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    if (currentStatus === "closed") {
      throw new DomainError("TABLE_ALREADY_CLOSED");
    }
    throw new DomainError(
      "TABLE_NOT_ACTIVE",
      `Cannot transition from ${currentStatus} to ${targetStatus}`
    );
  }
}

// === Activate Table ===

export async function activateTable(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string
): Promise<GamingTableDTO> {
  // 1. Fetch current table state
  const { data: table, error: fetchError } = await supabase
    .from("gaming_table")
    .select(GAMING_TABLE_SELECT)
    .eq("id", tableId)
    .eq("casino_id", casinoId)
    .single();

  if (fetchError || !table) {
    throw new DomainError("TABLE_NOT_FOUND");
  }

  // 2. Validate transition
  assertValidTransition(table.status, "active");

  if (table.status !== "inactive") {
    throw new DomainError("TABLE_NOT_INACTIVE");
  }

  // 3. Update status
  const { data: updated, error: updateError } = await supabase
    .from("gaming_table")
    .update({ status: "active" })
    .eq("id", tableId)
    .eq("casino_id", casinoId)
    .select(GAMING_TABLE_SELECT)
    .single();

  if (updateError || !updated) {
    throw new DomainError("INTERNAL_ERROR", "Failed to activate table");
  }

  return toGamingTableDTO(updated);
}

// === Deactivate Table ===

export async function deactivateTable(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string
): Promise<GamingTableDTO> {
  // 1. Fetch current table state
  const { data: table, error: fetchError } = await supabase
    .from("gaming_table")
    .select(GAMING_TABLE_SELECT)
    .eq("id", tableId)
    .eq("casino_id", casinoId)
    .single();

  if (fetchError || !table) {
    throw new DomainError("TABLE_NOT_FOUND");
  }

  // 2. Validate transition
  assertValidTransition(table.status, "inactive");

  if (table.status !== "active") {
    throw new DomainError("TABLE_NOT_ACTIVE");
  }

  // 3. Check for open rating slips (cross-context query via RatingSlipService)
  const hasOpenSlips = await hasOpenSlipsForTable(supabase, tableId, casinoId);
  if (hasOpenSlips) {
    throw new DomainError("TABLE_HAS_OPEN_SLIPS");
  }

  // 4. End any active dealer rotation
  await supabase
    .from("dealer_rotation")
    .update({ ended_at: new Date().toISOString() })
    .eq("table_id", tableId)
    .eq("casino_id", casinoId)
    .is("ended_at", null);

  // 5. Update status
  const { data: updated, error: updateError } = await supabase
    .from("gaming_table")
    .update({ status: "inactive" })
    .eq("id", tableId)
    .eq("casino_id", casinoId)
    .select(GAMING_TABLE_SELECT)
    .single();

  if (updateError || !updated) {
    throw new DomainError("INTERNAL_ERROR", "Failed to deactivate table");
  }

  return toGamingTableDTO(updated);
}

// === Close Table ===

export async function closeTable(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string
): Promise<GamingTableDTO> {
  // 1. Fetch current table state
  const { data: table, error: fetchError } = await supabase
    .from("gaming_table")
    .select(GAMING_TABLE_SELECT)
    .eq("id", tableId)
    .eq("casino_id", casinoId)
    .single();

  if (fetchError || !table) {
    throw new DomainError("TABLE_NOT_FOUND");
  }

  // 2. Validate transition
  assertValidTransition(table.status, "closed");

  // 3. End any active dealer rotation
  await supabase
    .from("dealer_rotation")
    .update({ ended_at: new Date().toISOString() })
    .eq("table_id", tableId)
    .eq("casino_id", casinoId)
    .is("ended_at", null);

  // 4. Update status to closed (terminal)
  const { data: updated, error: updateError } = await supabase
    .from("gaming_table")
    .update({ status: "closed" })
    .eq("id", tableId)
    .eq("casino_id", casinoId)
    .select(GAMING_TABLE_SELECT)
    .single();

  if (updateError || !updated) {
    throw new DomainError("INTERNAL_ERROR", "Failed to close table");
  }

  return toGamingTableDTO(updated);
}
```

### 2.2 Dealer Rotation (`dealer-rotation.ts`)

```typescript
/**
 * Dealer Rotation Operations
 *
 * Manages dealer assignments with auto-end of previous rotation.
 *
 * @see PRD-007 section 5.1 (Dealer rotation invariants)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { DomainError } from "@/lib/errors/domain-errors";
import type { DealerRotationDTO, GamingTableDTO } from "./dtos";
import { toDealerRotationDTO, toGamingTableDTO } from "./mappers";
import { DEALER_ROTATION_SELECT, GAMING_TABLE_SELECT } from "./selects";

// === Assign Dealer ===

export async function assignDealer(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string,
  staffId: string
): Promise<DealerRotationDTO> {
  // 1. Verify table exists and is active
  const { data: table, error: tableError } = await supabase
    .from("gaming_table")
    .select("id, status")
    .eq("id", tableId)
    .eq("casino_id", casinoId)
    .single();

  if (tableError || !table) {
    throw new DomainError("TABLE_NOT_FOUND");
  }

  if (table.status !== "active") {
    throw new DomainError("TABLE_NOT_ACTIVE");
  }

  // 2. End any current active rotation
  const now = new Date().toISOString();
  await supabase
    .from("dealer_rotation")
    .update({ ended_at: now })
    .eq("table_id", tableId)
    .eq("casino_id", casinoId)
    .is("ended_at", null);

  // 3. Create new rotation
  const { data: rotation, error: insertError } = await supabase
    .from("dealer_rotation")
    .insert({
      casino_id: casinoId,
      table_id: tableId,
      staff_id: staffId,
      started_at: now,
    })
    .select(DEALER_ROTATION_SELECT)
    .single();

  if (insertError || !rotation) {
    throw new DomainError("INTERNAL_ERROR", "Failed to assign dealer");
  }

  return toDealerRotationDTO(rotation);
}

// === End Dealer Rotation ===

export async function endDealerRotation(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string
): Promise<DealerRotationDTO> {
  // 1. Find active rotation
  const { data: rotation, error: fetchError } = await supabase
    .from("dealer_rotation")
    .select(DEALER_ROTATION_SELECT)
    .eq("table_id", tableId)
    .eq("casino_id", casinoId)
    .is("ended_at", null)
    .single();

  if (fetchError || !rotation) {
    throw new DomainError("DEALER_ROTATION_NOT_FOUND");
  }

  // 2. End rotation
  const { data: updated, error: updateError } = await supabase
    .from("dealer_rotation")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", rotation.id)
    .select(DEALER_ROTATION_SELECT)
    .single();

  if (updateError || !updated) {
    throw new DomainError("INTERNAL_ERROR", "Failed to end dealer rotation");
  }

  return toDealerRotationDTO(updated);
}

// === Get Current Dealer ===

export async function getCurrentDealer(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string
): Promise<DealerRotationDTO | null> {
  const { data: rotation, error } = await supabase
    .from("dealer_rotation")
    .select(DEALER_ROTATION_SELECT)
    .eq("table_id", tableId)
    .eq("casino_id", casinoId)
    .is("ended_at", null)
    .maybeSingle();

  if (error) {
    throw new DomainError("INTERNAL_ERROR", "Failed to fetch current dealer");
  }

  return rotation ? toDealerRotationDTO(rotation) : null;
}
```

### 2.3 CRUD Queries (`crud.ts`)

```typescript
/**
 * TableContextService CRUD Operations
 *
 * Read operations for tables, using mappers (no `as` casting).
 *
 * @see SLAD §308-348
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { DomainError } from "@/lib/errors/domain-errors";
import type {
  GamingTableDTO,
  GamingTableWithDealerDTO,
  TableListFilters,
} from "./dtos";
import {
  toGamingTableDTO,
  toGamingTableDTOList,
  toGamingTableWithDealerDTO,
} from "./mappers";
import { GAMING_TABLE_SELECT } from "./selects";

// === Get Table by ID ===

export async function getTableById(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string
): Promise<GamingTableDTO> {
  const { data, error } = await supabase
    .from("gaming_table")
    .select(GAMING_TABLE_SELECT)
    .eq("id", tableId)
    .eq("casino_id", casinoId)
    .single();

  if (error || !data) {
    throw new DomainError("TABLE_NOT_FOUND");
  }

  return toGamingTableDTO(data);
}

// === List Tables with Filters ===

export async function listTables(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  filters: Omit<TableListFilters, "casinoId"> = {}
): Promise<GamingTableDTO[]> {
  let query = supabase
    .from("gaming_table")
    .select(GAMING_TABLE_SELECT)
    .eq("casino_id", casinoId)
    .order("created_at", { ascending: false });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.pit) {
    query = query.eq("pit", filters.pit);
  }

  if (filters.type) {
    query = query.eq("type", filters.type);
  }

  if (filters.cursor) {
    query = query.lt("created_at", filters.cursor);
  }

  const limit = filters.limit ?? 20;
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    throw new DomainError("INTERNAL_ERROR", "Failed to list tables");
  }

  return toGamingTableDTOList(data ?? []);
}

// === Get Active Tables for Casino (Dashboard) ===

export async function getActiveTables(
  supabase: SupabaseClient<Database>,
  casinoId: string
): Promise<GamingTableWithDealerDTO[]> {
  const { data, error } = await supabase
    .from("gaming_table")
    .select(`
      id,
      casino_id,
      label,
      pit,
      type,
      status,
      created_at,
      dealer_rotation!left (
        staff_id,
        started_at,
        ended_at
      )
    `)
    .eq("casino_id", casinoId)
    .eq("status", "active")
    .order("label", { ascending: true });

  if (error) {
    throw new DomainError("INTERNAL_ERROR", "Failed to fetch active tables");
  }

  return (data ?? []).map((row) => {
    const activeRotation = row.dealer_rotation?.find((r) => r.ended_at === null);
    return {
      id: row.id,
      casino_id: row.casino_id,
      label: row.label,
      pit: row.pit,
      type: row.type,
      status: row.status,
      created_at: row.created_at,
      current_dealer: activeRotation
        ? {
            staff_id: activeRotation.staff_id!,
            started_at: activeRotation.started_at,
          }
        : null,
    };
  });
}
```

---

## WS-3: Chip Custody Operations (DEPENDS: WS-1)

**Agent**: `pt2-service-implementer`
**Files to Create**:
- `services/table-context/chip-custody.ts`

### 3.1 Chip Custody (`chip-custody.ts`)

Implements inventory snapshots, fills, credits, and drops via RPCs.

```typescript
/**
 * Chip Custody Operations
 *
 * Inventory snapshots, fills, credits, and drop box events.
 * All mutations via RPCs with idempotency support.
 *
 * @see PRD-007 section 4 (Scope & Feature List)
 * @see Migration 20251108195341_table_context_chip_custody.sql
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { DomainError } from "@/lib/errors/domain-errors";
import type {
  TableInventorySnapshotDTO,
  LogInventorySnapshotInput,
  TableFillDTO,
  RequestTableFillInput,
  TableCreditDTO,
  RequestTableCreditInput,
  TableDropEventDTO,
  LogDropEventInput,
} from "./dtos";
import {
  toTableInventorySnapshotDTO,
  toTableFillDTO,
  toTableCreditDTO,
  toTableDropEventDTO,
} from "./mappers";

// === Inventory Snapshot ===

export async function logInventorySnapshot(
  supabase: SupabaseClient<Database>,
  input: LogInventorySnapshotInput
): Promise<TableInventorySnapshotDTO> {
  const { data, error } = await supabase.rpc("rpc_log_table_inventory_snapshot", {
    p_casino_id: input.casinoId,
    p_table_id: input.tableId,
    p_snapshot_type: input.snapshotType,
    p_chipset: input.chipset,
    p_counted_by: input.countedBy,
    p_verified_by: input.verifiedBy,
    p_discrepancy_cents: input.discrepancyCents ?? 0,
    p_note: input.note,
  });

  if (error) {
    throw new DomainError("INTERNAL_ERROR", error.message);
  }

  return toTableInventorySnapshotDTO(data);
}

// === Table Fill (Idempotent) ===

export async function requestTableFill(
  supabase: SupabaseClient<Database>,
  input: RequestTableFillInput
): Promise<TableFillDTO> {
  const { data, error } = await supabase.rpc("rpc_request_table_fill", {
    p_casino_id: input.casinoId,
    p_table_id: input.tableId,
    p_request_id: input.requestId,
    p_chipset: input.chipset,
    p_amount_cents: input.amountCents,
    p_requested_by: input.requestedBy,
    p_delivered_by: input.deliveredBy,
    p_received_by: input.receivedBy,
    p_slip_no: input.slipNo,
  });

  if (error) {
    // Handle duplicate request (idempotent - return existing per SLAD idempotency)
    if (error.code === "23505") {
      const { data: existing, error: lookupError } = await supabase
        .from("table_fill")
        .select("id, casino_id, table_id, request_id, chipset, amount_cents, requested_by, delivered_by, received_by, slip_no, created_at")
        .eq("casino_id", input.casinoId)
        .eq("request_id", input.requestId)
        .single();

      if (existing && !lookupError) {
        return toTableFillDTO(existing);
      }

      throw new DomainError("TABLE_FILL_REJECTED", "Idempotency lookup failed");
    }
    throw new DomainError("TABLE_FILL_REJECTED", error.message);
  }

  return toTableFillDTO(data);
}

// === Table Credit (Idempotent) ===

export async function requestTableCredit(
  supabase: SupabaseClient<Database>,
  input: RequestTableCreditInput
): Promise<TableCreditDTO> {
  const { data, error } = await supabase.rpc("rpc_request_table_credit", {
    p_casino_id: input.casinoId,
    p_table_id: input.tableId,
    p_request_id: input.requestId,
    p_chipset: input.chipset,
    p_amount_cents: input.amountCents,
    p_authorized_by: input.authorizedBy,
    p_sent_by: input.sentBy,
    p_received_by: input.receivedBy,
    p_slip_no: input.slipNo,
  });

  if (error) {
    // Handle duplicate request (idempotent - return existing per SLAD idempotency)
    if (error.code === "23505") {
      const { data: existing, error: lookupError } = await supabase
        .from("table_credit")
        .select("id, casino_id, table_id, request_id, chipset, amount_cents, authorized_by, sent_by, received_by, slip_no, created_at")
        .eq("casino_id", input.casinoId)
        .eq("request_id", input.requestId)
        .single();

      if (existing && !lookupError) {
        return toTableCreditDTO(existing);
      }

      throw new DomainError("TABLE_CREDIT_REJECTED", "Idempotency lookup failed");
    }
    throw new DomainError("TABLE_CREDIT_REJECTED", error.message);
  }

  return toTableCreditDTO(data);
}

// === Drop Event ===

export async function logDropEvent(
  supabase: SupabaseClient<Database>,
  input: LogDropEventInput
): Promise<TableDropEventDTO> {
  const { data, error } = await supabase.rpc("rpc_log_table_drop", {
    p_casino_id: input.casinoId,
    p_table_id: input.tableId,
    p_drop_box_id: input.dropBoxId,
    p_seal_no: input.sealNo,
    p_removed_by: input.removedBy,
    p_witnessed_by: input.witnessedBy,
    p_removed_at: input.removedAt,
    p_delivered_at: input.deliveredAt,
    p_delivered_scan_at: input.deliveredScanAt,
    p_gaming_day: input.gamingDay,
    p_seq_no: input.seqNo,
    p_note: input.note,
  });

  if (error) {
    throw new DomainError("INTERNAL_ERROR", error.message);
  }

  return toTableDropEventDTO(data);
}

// === Get Inventory History ===

export async function getInventoryHistory(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string,
  limit: number = 20
): Promise<TableInventorySnapshotDTO[]> {
  const { data, error } = await supabase
    .from("table_inventory_snapshot")
    .select("*")
    .eq("table_id", tableId)
    .eq("casino_id", casinoId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new DomainError("INTERNAL_ERROR", error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    casino_id: row.casino_id,
    table_id: row.table_id,
    snapshot_type: row.snapshot_type,
    chipset: row.chipset,
    counted_by: row.counted_by,
    verified_by: row.verified_by,
    discrepancy_cents: row.discrepancy_cents,
    note: row.note,
    created_at: row.created_at,
  }));
}
```

---

## WS-4: Transport Layer (DEPENDS: WS-2 + WS-3)

**Agent**: `api-expert`

### Transport Entry-Point Strategy

Per SLAD §505-513 and EDGE_TRANSPORT_POLICY.md:93, TableContextService uses the **dual-entry transport pattern**:

| Use Case | Entry Point | Examples |
|----------|-------------|----------|
| React Query mutations/queries | **Route Handlers** | Table status reads, fills, credits, drops |
| Form-based quick actions | **Server Actions** | Quick activate/deactivate buttons, dealer assignment forms |
| Hardware integrations | **Route Handlers** | Chip scanner feeds, drop box readers |

### 4.1 Route Handlers (React Query / External)

**Files to Create**:
- `app/api/v1/tables/route.ts` (list tables)
- `app/api/v1/tables/[tableId]/route.ts` (get table)
- `app/api/v1/tables/[tableId]/activate/route.ts`
- `app/api/v1/tables/[tableId]/deactivate/route.ts`
- `app/api/v1/tables/[tableId]/close/route.ts`
- `app/api/v1/tables/[tableId]/dealer/route.ts`
- `app/api/v1/table-context/inventory-snapshots/route.ts`
- `app/api/v1/table-context/fills/route.ts`
- `app/api/v1/table-context/credits/route.ts`
- `app/api/v1/table-context/drop-events/route.ts`

#### Route Handler Pattern

All routes follow the pattern from `EDGE_TRANSPORT_POLICY.md`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withServerAction } from "@/lib/server-actions/with-server-action-wrapper";
import { getCasinoContext } from "@/lib/auth/casino-context";
import { tableRouteParamsSchema } from "@/services/table-context/schemas";
import { activateTable } from "@/services/table-context/table-lifecycle";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  return withServerAction(
    async () => {
      const { tableId } = tableRouteParamsSchema.parse(await params);
      const supabase = await createClient();
      const { casinoId } = await getCasinoContext(supabase);

      return activateTable(supabase, tableId, casinoId);
    },
    { domain: "table-context", operation: "activate-table" }
  );
}
```

### 4.2 Server Actions (Form-Based Quick Actions)

**Files to Create**:
- `app/actions/table-context/activate-table.ts`
- `app/actions/table-context/deactivate-table.ts`
- `app/actions/table-context/close-table.ts`
- `app/actions/table-context/assign-dealer.ts`
- `app/actions/table-context/end-dealer-rotation.ts`

**Rationale**: Per EDGE_TRANSPORT_POLICY.md:93, TableContextService provides Server Actions for "form-based quick actions" used by the Pit Dashboard UI. These are first-party form/RSC flows that don't require React Query's cache management.

#### Server Action Pattern

```typescript
/**
 * Activate Table Server Action
 *
 * Used by Pit Dashboard quick-action buttons (form-based).
 * For React Query mutations, use Route Handler instead.
 *
 * @see EDGE_TRANSPORT_POLICY.md §6 (TableContextService)
 * @see SLAD §505-513 (Entry Point Strategy)
 */
"use server";

import { createClient } from "@/lib/supabase/server";
import { withServerAction } from "@/lib/server-actions/with-server-action-wrapper";
import { getCasinoContext } from "@/lib/auth/casino-context";
import { activateTable } from "@/services/table-context/table-lifecycle";
import { tableRouteParamsSchema } from "@/services/table-context/schemas";
import type { GamingTableDTO } from "@/services/table-context/dtos";
import type { ServiceResult } from "@/services/shared/types";

export async function activateTableAction(
  tableId: string
): Promise<ServiceResult<GamingTableDTO>> {
  return withServerAction(
    async () => {
      const { tableId: validatedId } = tableRouteParamsSchema.parse({ tableId });
      const supabase = await createClient();
      const { casinoId } = await getCasinoContext(supabase);

      return activateTable(supabase, validatedId, casinoId);
    },
    { domain: "table-context", operation: "activate-table" }
  );
}
```

#### Dealer Assignment Form Action

```typescript
/**
 * Assign Dealer Server Action
 *
 * Used by dealer assignment form in Pit Dashboard.
 * Supports useFormState for progressive enhancement.
 */
"use server";

import { createClient } from "@/lib/supabase/server";
import { withServerAction } from "@/lib/server-actions/with-server-action-wrapper";
import { getCasinoContext } from "@/lib/auth/casino-context";
import { assignDealer } from "@/services/table-context/dealer-rotation";
import { assignDealerSchema, tableRouteParamsSchema } from "@/services/table-context/schemas";
import type { DealerRotationDTO } from "@/services/table-context/dtos";
import type { ServiceResult } from "@/services/shared/types";

export async function assignDealerAction(
  tableId: string,
  formData: FormData
): Promise<ServiceResult<DealerRotationDTO>> {
  return withServerAction(
    async () => {
      const { tableId: validatedTableId } = tableRouteParamsSchema.parse({ tableId });
      const { staff_id } = assignDealerSchema.parse({
        staff_id: formData.get("staff_id"),
      });

      const supabase = await createClient();
      const { casinoId } = await getCasinoContext(supabase);

      return assignDealer(supabase, validatedTableId, casinoId, staff_id);
    },
    { domain: "table-context", operation: "assign-dealer" }
  );
}
```

### 4.3 Transport Decision Matrix

| Operation | Route Handler | Server Action | Why |
|-----------|--------------|---------------|-----|
| List tables | ✅ | - | React Query cache for dashboard |
| Get table | ✅ | - | React Query query |
| Activate table | ✅ | ✅ | RQ for programmatic, SA for form button |
| Deactivate table | ✅ | ✅ | RQ for programmatic, SA for form button |
| Close table | ✅ | ✅ | RQ for programmatic, SA for form button |
| Assign dealer | ✅ | ✅ | RQ for drag-drop, SA for form |
| End dealer rotation | ✅ | ✅ | RQ for programmatic, SA for form button |
| Log inventory snapshot | ✅ | - | Hardware integration / batch operations |
| Request fill | ✅ | - | Hardware integration / idempotency critical |
| Request credit | ✅ | - | Hardware integration / idempotency critical |
| Log drop event | ✅ | - | Hardware integration / custody chain |

**Note**: Chip custody operations (fills, credits, drops, inventory) use Route Handlers exclusively because:
1. Hardware integrations (chip scanners, drop box readers) require JSON transport
2. `x-idempotency-key` header semantics are critical for custody chain integrity
3. These are not form-based user actions

---

## WS-5: Testing (CONTINUOUS, FINALIZES AFTER WS-4)

**Agent**: `pt2-service-implementer`
**Files to Create**:
- `services/table-context/__tests__/mappers.test.ts`
- `services/table-context/__tests__/table-lifecycle.test.ts`
- `services/table-context/__tests__/dealer-rotation.test.ts`
- `services/table-context/__tests__/chip-custody.test.ts`
- `services/table-context/__tests__/table-context.integration.test.ts`

### 5.1 Mapper Tests

```typescript
import { describe, it, expect } from "vitest";
import {
  toGamingTableDTO,
  toDealerRotationDTO,
  toTableFillDTO,
  toTableCreditDTO,
  toTableDropEventDTO,
  toTableInventorySnapshotDTO,
} from "../mappers";

describe("TableContext Mappers", () => {
  describe("toGamingTableDTO", () => {
    it("maps all fields correctly", () => {
      const row = {
        id: "table-1",
        casino_id: "casino-1",
        label: "BJ-01",
        pit: "main",
        type: "blackjack" as const,
        status: "active" as const,
        created_at: "2025-12-01T00:00:00Z",
      };

      const dto = toGamingTableDTO(row);

      expect(dto).toEqual({
        id: "table-1",
        casino_id: "casino-1",
        label: "BJ-01",
        pit: "main",
        type: "blackjack",
        status: "active",
        created_at: "2025-12-01T00:00:00Z",
      });
    });

    it("handles null pit", () => {
      const row = {
        id: "table-1",
        casino_id: "casino-1",
        label: "BJ-01",
        pit: null,
        type: "blackjack" as const,
        status: "inactive" as const,
        created_at: "2025-12-01T00:00:00Z",
      };

      const dto = toGamingTableDTO(row);
      expect(dto.pit).toBeNull();
    });
  });

  // Additional mapper tests for each DTO type...
});
```

### 5.2 State Machine Tests

```typescript
describe("Table Lifecycle", () => {
  describe("activateTable", () => {
    it("activates an inactive table", async () => {
      // Test inactive → active transition
    });

    it("throws TABLE_NOT_INACTIVE if table is already active", async () => {
      // Test double-activation prevention
    });

    it("throws TABLE_ALREADY_CLOSED if table is closed", async () => {
      // Test closed is terminal
    });
  });

  describe("deactivateTable", () => {
    it("deactivates an active table", async () => {
      // Test active → inactive transition
    });

    it("throws TABLE_HAS_OPEN_SLIPS if slips exist", async () => {
      // Test rating slip validation
    });

    it("auto-ends active dealer rotation", async () => {
      // Test rotation cleanup
    });
  });

  describe("closeTable", () => {
    it("closes an active table", async () => {
      // Test active → closed
    });

    it("closes an inactive table", async () => {
      // Test inactive → closed
    });

    it("throws TABLE_ALREADY_CLOSED for already closed table", async () => {
      // Test terminal state
    });
  });
});
```

### 5.3 Integration Test

```typescript
describe("TableContext Integration", () => {
  it("full table lifecycle: activate → assign dealer → fill → close", async () => {
    // 1. Create inactive table
    // 2. Activate table
    // 3. Assign dealer
    // 4. Request fill
    // 5. Log inventory snapshot
    // 6. Close table
    // 7. Verify all states correct
  });

  it("idempotent fill/credit", async () => {
    // 1. Request fill with request_id
    // 2. Request same fill again
    // 3. Verify idempotent (no error, same data)
  });
});
```

---

## Service Index (`services/table-context/index.ts`)

```typescript
/**
 * TableContextService Index (Factory)
 *
 * Pattern A (Contract-First) with explicit interface + ServiceResult
 * and executeOperation wrapper (SLAD Service Factory Pattern).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { ServiceResult } from "@/services/shared/types";
import { executeOperation } from "@/services/shared/execute-operation";
import {
  activateTable,
  deactivateTable,
  closeTable,
} from "./table-lifecycle";
import {
  assignDealer,
  endDealerRotation,
  getCurrentDealer,
} from "./dealer-rotation";
import {
  getTableById,
  listTables,
  getActiveTables,
} from "./crud";
import {
  logInventorySnapshot,
  requestTableFill,
  requestTableCredit,
  logDropEvent,
  getInventoryHistory,
} from "./chip-custody";
import type {
  GamingTableDTO,
  GamingTableWithDealerDTO,
  DealerRotationDTO,
  TableInventorySnapshotDTO,
  TableFillDTO,
  TableCreditDTO,
  TableDropEventDTO,
  TableListFilters,
  ChipsetPayload,
  TableStatus,
  GameType,
  SnapshotType,
} from "./dtos";

export interface TableContextService {
  activate(tableId: string, casinoId: string): Promise<ServiceResult<GamingTableDTO>>;
  deactivate(tableId: string, casinoId: string): Promise<ServiceResult<GamingTableDTO>>;
  close(tableId: string, casinoId: string): Promise<ServiceResult<GamingTableDTO>>;

  assignDealer(tableId: string, casinoId: string, staffId: string): Promise<ServiceResult<DealerRotationDTO>>;
  endDealerRotation(tableId: string, casinoId: string): Promise<ServiceResult<DealerRotationDTO>>;
  getCurrentDealer(tableId: string, casinoId: string): Promise<ServiceResult<DealerRotationDTO | null>>;

  getTable(tableId: string, casinoId: string): Promise<ServiceResult<GamingTableDTO>>;
  listTables(casinoId: string, filters?: Omit<TableListFilters, "casinoId">): Promise<ServiceResult<GamingTableDTO[]>>;
  getActiveTables(casinoId: string): Promise<ServiceResult<GamingTableWithDealerDTO[]>>;

  logInventorySnapshot(input: Parameters<typeof logInventorySnapshot>[1]): Promise<ServiceResult<TableInventorySnapshotDTO>>;
  requestFill(input: Parameters<typeof requestTableFill>[1]): Promise<ServiceResult<TableFillDTO>>;
  requestCredit(input: Parameters<typeof requestTableCredit>[1]): Promise<ServiceResult<TableCreditDTO>>;
  logDropEvent(input: Parameters<typeof logDropEvent>[1]): Promise<ServiceResult<TableDropEventDTO>>;
  getInventoryHistory(tableId: string, casinoId: string, limit?: number): Promise<ServiceResult<TableInventorySnapshotDTO[]>>;
}

export function createTableContextService(
  supabase: SupabaseClient<Database>
): TableContextService {
  return {
    activate: (tableId, casinoId) =>
      executeOperation({ label: "table-context.activate" }, () =>
        activateTable(supabase, tableId, casinoId)
      ),
    deactivate: (tableId, casinoId) =>
      executeOperation({ label: "table-context.deactivate" }, () =>
        deactivateTable(supabase, tableId, casinoId)
      ),
    close: (tableId, casinoId) =>
      executeOperation({ label: "table-context.close" }, () =>
        closeTable(supabase, tableId, casinoId)
      ),

    assignDealer: (tableId, casinoId, staffId) =>
      executeOperation({ label: "table-context.assign-dealer" }, () =>
        assignDealer(supabase, tableId, casinoId, staffId)
      ),
    endDealerRotation: (tableId, casinoId) =>
      executeOperation({ label: "table-context.end-dealer-rotation" }, () =>
        endDealerRotation(supabase, tableId, casinoId)
      ),
    getCurrentDealer: (tableId, casinoId) =>
      executeOperation({ label: "table-context.current-dealer" }, () =>
        getCurrentDealer(supabase, tableId, casinoId)
      ),

    getTable: (tableId, casinoId) =>
      executeOperation({ label: "table-context.get" }, () =>
        getTableById(supabase, tableId, casinoId)
      ),
    listTables: (casinoId, filters) =>
      executeOperation({ label: "table-context.list" }, () =>
        listTables(supabase, casinoId, filters)
      ),
    getActiveTables: (casinoId) =>
      executeOperation({ label: "table-context.active" }, () =>
        getActiveTables(supabase, casinoId)
      ),

    logInventorySnapshot: (input) =>
      executeOperation({ label: "table-context.snapshot" }, () =>
        logInventorySnapshot(supabase, input)
      ),
    requestFill: (input) =>
      executeOperation({ label: "table-context.fill" }, () =>
        requestTableFill(supabase, input)
      ),
    requestCredit: (input) =>
      executeOperation({ label: "table-context.credit" }, () =>
        requestTableCredit(supabase, input)
      ),
    logDropEvent: (input) =>
      executeOperation({ label: "table-context.drop" }, () =>
        logDropEvent(supabase, input)
      ),
    getInventoryHistory: (tableId, casinoId, limit) =>
      executeOperation({ label: "table-context.inventory-history" }, () =>
        getInventoryHistory(supabase, tableId, casinoId, limit)
      ),
  };
}

// Re-export DTOs and keys for consumers
export type {
  GamingTableDTO,
  GamingTableWithDealerDTO,
  DealerRotationDTO,
  TableInventorySnapshotDTO,
  TableFillDTO,
  TableCreditDTO,
  TableDropEventDTO,
  TableListFilters,
  ChipsetPayload,
  TableStatus,
  GameType,
  SnapshotType,
};
export { tableContextKeys } from "./keys";
```

---

## Domain Error Codes to Add

Ensure these codes exist in `lib/errors/domain-errors.ts`:

```typescript
export type TableContextErrorCode =
  | "TABLE_NOT_FOUND"
  | "TABLE_NOT_ACTIVE"
  | "TABLE_NOT_INACTIVE"
  | "TABLE_ALREADY_CLOSED"
  | "TABLE_HAS_OPEN_SLIPS"
  | "TABLE_OCCUPIED"
  | "TABLE_DEALER_CONFLICT"
  | "TABLE_SETTINGS_INVALID"
  | "TABLE_FILL_REJECTED"
  | "TABLE_CREDIT_REJECTED"
  | "FILL_DUPLICATE_REQUEST"
  | "CREDIT_DUPLICATE_REQUEST"
  | "DEALER_ROTATION_NOT_FOUND";
```

---

## Parallel Execution Summary

| Workstream | Agent | Dependencies | Estimated Complexity |
|------------|-------|--------------|---------------------|
| **WS-1: Foundation** | pt2-service-implementer | None | Medium |
| **WS-2: Table Ops** | pt2-service-implementer | WS-1, RatingSlipService query | High |
| **WS-3: Chip Ops** | pt2-service-implementer | WS-1 | Medium |
| **WS-4: API Routes** | api-expert | WS-2 + WS-3 | Medium |
| **WS-5: Testing** | pt2-service-implementer | Continuous | Medium |

**Cross-Context Prerequisite**:
- Before WS-2 can be completed, `services/rating-slip/queries.ts` must exist with `hasOpenSlipsForTable()` function
- This can be a minimal stub file that will be expanded when PRD-002 (RatingSlipService) is fully implemented

**Execution Order**:
1. Start WS-1 (Foundation) + Create `services/rating-slip/queries.ts` stub
2. After WS-1: Start WS-2 + WS-3 in parallel
3. After WS-2 + WS-3: Start WS-4
4. WS-5 runs continuously, finalizing after WS-4

---

## Validation Checklist

See `references/validation-checklist.md` for complete checklist. Key items:

- [ ] Pattern A structure with dtos.ts, mappers.ts, selects.ts
- [ ] http.ts for HTTP fetchers (SLAD §340-341)
- [ ] Dual-entry transport: Route Handlers + Server Actions (SLAD §505-513)
- [ ] All mappers tested (100% coverage)
- [ ] No `as` type assertions in service code
- [ ] Domain errors thrown (not ServiceResult returned)
- [ ] Zod schemas for all API inputs (ADR-013)
- [ ] Tests in `__tests__/` subdirectory (ADR-002)
- [ ] README.md complete with error codes (V6)
- [ ] DTO_CATALOG.md updated (W2)
- [ ] Security: casino context from auth, not client (V4)

---

**Document Version**: 1.4.0
**Created**: 2025-12-07
**Updated**: 2025-12-07
**Status**: Ready for Agent Execution

### Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.4.0 | 2025-12-07 | Separated transport types from DTOs: schemas.ts exports `*RequestBody`/`*QueryParams` (HTTP boundary, snake_case); dtos.ts exports `*Input`/`*DTO` (service boundary). Route handlers map schema→DTO per SLAD §319-324 |
| 1.3.0 | 2025-12-07 | Added Server Actions for form-based quick actions per SLAD §505-513 dual-entry transport pattern; renamed WS-4 to "Transport Layer"; added transport decision matrix |
| 1.2.0 | 2025-12-07 | Added missing http.ts to WS-1 per SLAD §340-341 compliance audit |
| 1.1.0 | 2025-12-07 | Fixed bounded context violation: deactivateTable now uses RatingSlipService.hasOpenSlipsForTable() instead of direct rating_slip table access |
| 1.0.0 | 2025-12-07 | Initial spec generated |

/**
 * TableContextService DTOs
 *
 * Pattern A (Contract-First): Manual interfaces with domain contracts.
 * All types derived from Database types where applicable.
 *
 * @see PRD-007 Table Context Service
 * @see SERVICE_RESPONSIBILITY_MATRIX.md section 298-333
 */

import type { Database } from "@/types/database.types";

// === Enum Types ===
export type TableStatus = Database["public"]["Enums"]["table_status"];
export type GameType = Database["public"]["Enums"]["game_type"];

// === Chipset Type (JSONB payload) ===
/** Denomination to quantity mapping for chip counts */
export type ChipsetPayload = Record<string, number>;

// === Gaming Table DTOs ===

/** Public table record */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: includes computed current_dealer
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
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: computed nested dealer object
export interface GamingTableWithDealerDTO extends GamingTableDTO {
  current_dealer: {
    staff_id: string;
    started_at: string;
  } | null;
}

// === Dealer Rotation DTOs ===

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: dealer_rotation table projection
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

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: RPC return type with JSONB chipset
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

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: RPC return type with JSONB chipset
export interface TableFillDTO {
  id: string;
  casino_id: string;
  table_id: string;
  request_id: string;
  chipset: ChipsetPayload;
  amount_cents: number;
  requested_by: string | null;
  delivered_by: string | null;
  received_by: string | null;
  slip_no: string | null;
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

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: RPC return type with JSONB chipset
export interface TableCreditDTO {
  id: string;
  casino_id: string;
  table_id: string;
  request_id: string;
  chipset: ChipsetPayload;
  amount_cents: number;
  authorized_by: string | null;
  sent_by: string | null;
  received_by: string | null;
  slip_no: string | null;
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

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: drop event with custody chain fields
export interface TableDropEventDTO {
  id: string;
  casino_id: string;
  table_id: string;
  drop_box_id: string;
  seal_no: string | null;
  gaming_day: string | null;
  seq_no: number | null;
  removed_by: string | null;
  witnessed_by: string | null;
  removed_at: string;
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

// === Table Settings (Betting Limits) DTOs ===

/** Table settings with betting limits */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: includes settings with game defaults
export interface TableSettingsDTO {
  id: string;
  casino_id: string;
  table_id: string;
  min_bet: number;
  max_bet: number;
  active_from: string;
}

/** Input for updating table limits - both required, never null */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: input DTO with validation, not direct table row mapping
export interface UpdateTableLimitsDTO {
  min_bet: number;
  max_bet: number;
}

/** Input for getTableSettings with auto-create */
export interface GetTableSettingsInput {
  tableId: string;
  casinoId: string;
}

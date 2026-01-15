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

// === Shift Cash Observation Rollup DTOs (PRD-SHIFT-DASHBOARDS v0.2 PATCH) ===
// TELEMETRY-ONLY: These rollups are observational, NOT authoritative Drop/Win/Hold

/**
 * Per-table cash observation rollup for shift window.
 * Pattern A: Contract-First - computed aggregates from RPC.
 *
 * @see PRD-SHIFT-DASHBOARDS-v0.2 PATCH
 * @see SHIFT_METRICS_CATALOG §3.7
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: RPC aggregate response
export interface CashObsTableRollupDTO {
  table_id: string;
  table_label: string;
  pit: string | null;
  cash_out_observed_estimate_total: number;
  cash_out_observed_confirmed_total: number;
  cash_out_observation_count: number;
  cash_out_last_observed_at: string | null;
}

/**
 * Per-pit cash observation rollup.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: RPC aggregate response
export interface CashObsPitRollupDTO {
  pit: string;
  cash_out_observed_estimate_total: number;
  cash_out_observed_confirmed_total: number;
  cash_out_observation_count: number;
  cash_out_last_observed_at: string | null;
}

/**
 * Casino-level cash observation rollup.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: RPC aggregate response
export interface CashObsCasinoRollupDTO {
  cash_out_observed_estimate_total: number;
  cash_out_observed_confirmed_total: number;
  cash_out_observation_count: number;
  cash_out_last_observed_at: string | null;
}

/**
 * Cash observation spike alert.
 * TELEMETRY label: This is observational, not authoritative.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: RPC alert response
export interface CashObsSpikeAlertDTO {
  alert_type: "cash_out_observed_spike_telemetry";
  severity: "info" | "warn" | "critical";
  entity_type: "table" | "pit";
  entity_id: string;
  entity_label: string;
  observed_value: number;
  threshold: number;
  message: string;
  is_telemetry: true;
}

// === Shift Cash Obs Input Types ===

export interface ShiftCashObsTimeWindow {
  casinoId: string; // Cache scoping only; RPC derives casino scope from RLS context.
  startTs: string; // ISO timestamp
  endTs: string; // ISO timestamp
}

export interface ShiftCashObsTableParams extends ShiftCashObsTimeWindow {
  tableId?: string; // Optional filter to single table
}

export interface ShiftCashObsPitParams extends ShiftCashObsTimeWindow {
  pit?: string; // Optional filter to single pit
}

// === Table Session DTOs (PRD-TABLE-SESSION-LIFECYCLE-MVP) ===

/**
 * Table session status enum.
 * State machine: OPEN → ACTIVE → RUNDOWN → CLOSED
 * Note: OPEN → ACTIVE is implicit (we start sessions in ACTIVE state for MVP)
 */
export type TableSessionStatus = "OPEN" | "ACTIVE" | "RUNDOWN" | "CLOSED";

/**
 * Table session DTO.
 * Pattern A (Contract-First): Manual interface with domain contracts.
 *
 * @see PRD-TABLE-SESSION-LIFECYCLE-MVP
 * @see ADR-024 (RLS context injection)
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: session with state machine and audit fields
export interface TableSessionDTO {
  id: string;
  casino_id: string;
  gaming_table_id: string;
  gaming_day: string; // ISO date (YYYY-MM-DD)
  shift_id: string | null;
  status: TableSessionStatus;
  opened_at: string; // ISO timestamp
  opened_by_staff_id: string;
  rundown_started_at: string | null;
  rundown_started_by_staff_id: string | null;
  closed_at: string | null;
  closed_by_staff_id: string | null;
  opening_inventory_snapshot_id: string | null;
  closing_inventory_snapshot_id: string | null;
  drop_event_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Input for opening a new table session.
 * Casino context derived from RLS (ADR-024 compliant).
 */
export interface OpenTableSessionInput {
  gamingTableId: string;
}

/**
 * Input for starting rundown on a session.
 */
export interface StartTableRundownInput {
  sessionId: string;
}

/**
 * Input for closing a table session.
 * At least one of dropEventId or closingInventorySnapshotId is required.
 */
export interface CloseTableSessionInput {
  sessionId: string;
  dropEventId?: string;
  closingInventorySnapshotId?: string;
  notes?: string;
}

/**
 * Input for getting current session for a table.
 */
export interface GetCurrentTableSessionInput {
  gamingTableId: string;
}

// === Consolidated Cash Observation Summary DTO (PERF-001 BFF) ===

/**
 * Consolidated cash observation summary.
 * PERF: Reduces 4 HTTP calls to 1 by combining all cash obs data.
 *
 * Pattern A: Contract-First - BFF aggregation of RPC responses.
 * TELEMETRY-ONLY: All data is observational, NOT authoritative.
 *
 * @see SHIFT_DASHBOARD_HTTP_CASCADE.md (PERF-001)
 * @see PRD-SHIFT-DASHBOARDS-v0.2
 */

export interface CashObsSummaryDTO {
  casino: CashObsCasinoRollupDTO;
  pits: CashObsPitRollupDTO[];
  tables: CashObsTableRollupDTO[];
  alerts: CashObsSpikeAlertDTO[];
}

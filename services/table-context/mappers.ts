/**
 * TableContextService Mappers
 *
 * Type-safe transformations from Supabase rows/RPC returns to DTOs.
 * Eliminates `as` type assertions per SLAD v3.0.0.
 *
 * @see SLAD section 327-365
 */

import type { Database } from '@/types/database.types';

import type {
  GamingTableDTO,
  GamingTableWithDealerDTO,
  DealerRotationDTO,
  TableInventorySnapshotDTO,
  TableFillDTO,
  TableCreditDTO,
  TableDropEventDTO,
  TableRundownDTO,
  TableStatus,
  GameType,
  ChipsetPayload,
} from './dtos';

// Row types for direct queries (pending queue GET endpoints)
type TableFillRow = Database['public']['Tables']['table_fill']['Row'];
type TableCreditRow = Database['public']['Tables']['table_credit']['Row'];
type TableDropEventRow =
  Database['public']['Tables']['table_drop_event']['Row'];

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
  dealer_rotation:
    | {
        staff_id: string;
        started_at: string;
      }[]
    | null;
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
  Database['public']['Functions']['rpc_log_table_inventory_snapshot']['Returns'];
type RpcTableFillReturn =
  Database['public']['Functions']['rpc_request_table_fill']['Returns'];
type RpcTableCreditReturn =
  Database['public']['Functions']['rpc_request_table_credit']['Returns'];
type RpcTableDropReturn =
  Database['public']['Functions']['rpc_log_table_drop']['Returns'];

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
  rows: GamingTableSelectedRow[],
): GamingTableDTO[] {
  return rows.map(toGamingTableDTO);
}

export function toGamingTableDTOOrNull(
  row: GamingTableSelectedRow | null,
): GamingTableDTO | null {
  return row ? toGamingTableDTO(row) : null;
}

export function toGamingTableWithDealerDTO(
  row: GamingTableWithDealerSelectedRow,
): GamingTableWithDealerDTO {
  const activeRotation = row.dealer_rotation?.find(
    (r) => r.started_at && !('ended_at' in r),
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
  row: DealerRotationSelectedRow,
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
  rows: DealerRotationSelectedRow[],
): DealerRotationDTO[] {
  return rows.map(toDealerRotationDTO);
}

// === RPC Response Mappers ===

export function toTableInventorySnapshotDTO(
  rpcResult: RpcTableInventorySnapshotReturn,
): TableInventorySnapshotDTO {
  return {
    id: rpcResult.id,
    casino_id: rpcResult.casino_id,
    table_id: rpcResult.table_id,
    snapshot_type:
      rpcResult.snapshot_type as TableInventorySnapshotDTO['snapshot_type'],
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- JSONB from Postgres returns Json type
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
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- JSONB from Postgres returns Json type
    chipset: rpcResult.chipset as ChipsetPayload,
    amount_cents: rpcResult.amount_cents,
    requested_by: rpcResult.requested_by,
    delivered_by: rpcResult.delivered_by,
    received_by: rpcResult.received_by,
    slip_no: rpcResult.slip_no,
    created_at: rpcResult.created_at,
    status: rpcResult.status,
    confirmed_at: rpcResult.confirmed_at,
    confirmed_by: rpcResult.confirmed_by,
    confirmed_amount_cents: rpcResult.confirmed_amount_cents,
    discrepancy_note: rpcResult.discrepancy_note,
  };
}

export function toTableCreditDTO(
  rpcResult: RpcTableCreditReturn,
): TableCreditDTO {
  return {
    id: rpcResult.id,
    casino_id: rpcResult.casino_id,
    table_id: rpcResult.table_id,
    request_id: rpcResult.request_id,
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- JSONB from Postgres returns Json type
    chipset: rpcResult.chipset as ChipsetPayload,
    amount_cents: rpcResult.amount_cents,
    authorized_by: rpcResult.authorized_by,
    sent_by: rpcResult.sent_by,
    received_by: rpcResult.received_by,
    slip_no: rpcResult.slip_no,
    created_at: rpcResult.created_at,
    status: rpcResult.status,
    confirmed_at: rpcResult.confirmed_at,
    confirmed_by: rpcResult.confirmed_by,
    confirmed_amount_cents: rpcResult.confirmed_amount_cents,
    discrepancy_note: rpcResult.discrepancy_note,
  };
}

export function toTableDropEventDTO(
  rpcResult: RpcTableDropReturn,
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
    cage_received_at: rpcResult.cage_received_at,
    cage_received_by: rpcResult.cage_received_by,
  };
}

// === Row-based mappers for direct queries ===

type TableInventorySnapshotRow =
  Database['public']['Tables']['table_inventory_snapshot']['Row'];

export function toTableInventorySnapshotDTOFromRow(
  row: TableInventorySnapshotRow,
): TableInventorySnapshotDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    table_id: row.table_id,
    snapshot_type:
      row.snapshot_type as TableInventorySnapshotDTO['snapshot_type'],
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- JSONB from Postgres returns Json type
    chipset: row.chipset as ChipsetPayload,
    counted_by: row.counted_by,
    verified_by: row.verified_by,
    discrepancy_cents: row.discrepancy_cents,
    note: row.note,
    created_at: row.created_at,
  };
}

export function toTableInventorySnapshotDTOListFromRows(
  rows: TableInventorySnapshotRow[],
): TableInventorySnapshotDTO[] {
  return rows.map(toTableInventorySnapshotDTOFromRow);
}

// === Table Settings Mappers ===

type GamingTableSettingsRow =
  Database['public']['Tables']['gaming_table_settings']['Row'];

export function toTableSettingsDTO(
  row: GamingTableSettingsRow,
): import('./dtos').TableSettingsDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    table_id: row.table_id,
    min_bet: row.min_bet ?? 0,
    max_bet: row.max_bet ?? 0,
    active_from: row.active_from,
  };
}

// === Table Rundown Mappers (ADR-027) ===

type RpcRundownRow =
  Database['public']['Functions']['rpc_compute_table_rundown']['Returns'][0];

/**
 * Maps RPC rundown result to TableRundownDTO.
 * Handles nullable fields and preserves PATCHED behavior:
 * - table_win_cents is NULL when drop is not posted
 *
 * @see ADR-027 Table Bank Mode (Visibility Slice, MVP)
 */
export function toTableRundownDTO(row: RpcRundownRow): TableRundownDTO {
  return {
    session_id: row.session_id,
    opening_total_cents: row.opening_total_cents,
    closing_total_cents: row.closing_total_cents,
    fills_total_cents: row.fills_total_cents,
    credits_total_cents: row.credits_total_cents,
    drop_total_cents: row.drop_total_cents,
    table_win_cents: row.table_win_cents,
    drop_posted_at: row.drop_posted_at,
    table_bank_mode: row.table_bank_mode,
    need_total_cents: row.need_total_cents,
  };
}

// === Cashier Confirmation RPC Mappers (PRD-033) ===

type RpcConfirmFillReturn =
  Database['public']['Functions']['rpc_confirm_table_fill']['Returns'];
type RpcConfirmCreditReturn =
  Database['public']['Functions']['rpc_confirm_table_credit']['Returns'];
type RpcAcknowledgeDropReturn =
  Database['public']['Functions']['rpc_acknowledge_drop_received']['Returns'];

export function toTableFillDTOFromConfirmRpc(
  rpcResult: RpcConfirmFillReturn,
): TableFillDTO {
  return {
    id: rpcResult.id,
    casino_id: rpcResult.casino_id,
    table_id: rpcResult.table_id,
    request_id: rpcResult.request_id,
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- JSONB from Postgres returns Json type
    chipset: rpcResult.chipset as ChipsetPayload,
    amount_cents: rpcResult.amount_cents,
    requested_by: rpcResult.requested_by,
    delivered_by: rpcResult.delivered_by,
    received_by: rpcResult.received_by,
    slip_no: rpcResult.slip_no,
    created_at: rpcResult.created_at,
    status: rpcResult.status,
    confirmed_at: rpcResult.confirmed_at,
    confirmed_by: rpcResult.confirmed_by,
    confirmed_amount_cents: rpcResult.confirmed_amount_cents,
    discrepancy_note: rpcResult.discrepancy_note,
  };
}

export function toTableCreditDTOFromConfirmRpc(
  rpcResult: RpcConfirmCreditReturn,
): TableCreditDTO {
  return {
    id: rpcResult.id,
    casino_id: rpcResult.casino_id,
    table_id: rpcResult.table_id,
    request_id: rpcResult.request_id,
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- JSONB from Postgres returns Json type
    chipset: rpcResult.chipset as ChipsetPayload,
    amount_cents: rpcResult.amount_cents,
    authorized_by: rpcResult.authorized_by,
    sent_by: rpcResult.sent_by,
    received_by: rpcResult.received_by,
    slip_no: rpcResult.slip_no,
    created_at: rpcResult.created_at,
    status: rpcResult.status,
    confirmed_at: rpcResult.confirmed_at,
    confirmed_by: rpcResult.confirmed_by,
    confirmed_amount_cents: rpcResult.confirmed_amount_cents,
    discrepancy_note: rpcResult.discrepancy_note,
  };
}

export function toTableDropEventDTOFromAcknowledgeRpc(
  rpcResult: RpcAcknowledgeDropReturn,
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
    cage_received_at: rpcResult.cage_received_at,
    cage_received_by: rpcResult.cage_received_by,
  };
}

// === Row-based mappers for direct queries (PRD-033 pending queue endpoints) ===

export function toTableFillDTOFromRow(row: TableFillRow): TableFillDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    table_id: row.table_id,
    request_id: row.request_id,
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- JSONB from Postgres returns Json type
    chipset: row.chipset as ChipsetPayload,
    amount_cents: row.amount_cents,
    requested_by: row.requested_by,
    delivered_by: row.delivered_by,
    received_by: row.received_by,
    slip_no: row.slip_no,
    created_at: row.created_at,
    status: row.status,
    confirmed_at: row.confirmed_at,
    confirmed_by: row.confirmed_by,
    confirmed_amount_cents: row.confirmed_amount_cents,
    discrepancy_note: row.discrepancy_note,
  };
}

export function toTableFillDTOListFromRows(
  rows: TableFillRow[],
): TableFillDTO[] {
  return rows.map(toTableFillDTOFromRow);
}

export function toTableCreditDTOFromRow(row: TableCreditRow): TableCreditDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    table_id: row.table_id,
    request_id: row.request_id,
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- JSONB from Postgres returns Json type
    chipset: row.chipset as ChipsetPayload,
    amount_cents: row.amount_cents,
    authorized_by: row.authorized_by,
    sent_by: row.sent_by,
    received_by: row.received_by,
    slip_no: row.slip_no,
    created_at: row.created_at,
    status: row.status,
    confirmed_at: row.confirmed_at,
    confirmed_by: row.confirmed_by,
    confirmed_amount_cents: row.confirmed_amount_cents,
    discrepancy_note: row.discrepancy_note,
  };
}

export function toTableCreditDTOListFromRows(
  rows: TableCreditRow[],
): TableCreditDTO[] {
  return rows.map(toTableCreditDTOFromRow);
}

export function toTableDropEventDTOFromRow(
  row: TableDropEventRow,
): TableDropEventDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    table_id: row.table_id,
    drop_box_id: row.drop_box_id,
    seal_no: row.seal_no,
    gaming_day: row.gaming_day,
    seq_no: row.seq_no,
    removed_by: row.removed_by,
    witnessed_by: row.witnessed_by,
    removed_at: row.removed_at,
    delivered_at: row.delivered_at,
    delivered_scan_at: row.delivered_scan_at,
    note: row.note,
    cage_received_at: row.cage_received_at,
    cage_received_by: row.cage_received_by,
  };
}

export function toTableDropEventDTOListFromRows(
  rows: TableDropEventRow[],
): TableDropEventDTO[] {
  return rows.map(toTableDropEventDTOFromRow);
}

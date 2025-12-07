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

import { DomainError } from "@/lib/errors/domain-errors";
import type { Database } from "@/types/database.types";

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
  toTableInventorySnapshotDTOListFromRows,
} from "./mappers";

// === Inventory Snapshot ===

export async function logInventorySnapshot(
  supabase: SupabaseClient<Database>,
  input: LogInventorySnapshotInput,
): Promise<TableInventorySnapshotDTO> {
  const { data, error } = await supabase.rpc(
    "rpc_log_table_inventory_snapshot",
    {
      p_casino_id: input.casinoId,
      p_table_id: input.tableId,
      p_snapshot_type: input.snapshotType,
      p_chipset: input.chipset,
      p_counted_by: input.countedBy,
      p_verified_by: input.verifiedBy,
      p_discrepancy_cents: input.discrepancyCents ?? 0,
      p_note: input.note,
    },
  );

  if (error) {
    throw new DomainError("INTERNAL_ERROR", error.message);
  }

  return toTableInventorySnapshotDTO(data);
}

// === Table Fill (Idempotent) ===

export async function requestTableFill(
  supabase: SupabaseClient<Database>,
  input: RequestTableFillInput,
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
        .select(
          "id, casino_id, table_id, request_id, chipset, amount_cents, requested_by, delivered_by, received_by, slip_no, created_at",
        )
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
  input: RequestTableCreditInput,
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
        .select(
          "id, casino_id, table_id, request_id, chipset, amount_cents, authorized_by, sent_by, received_by, slip_no, created_at",
        )
        .eq("casino_id", input.casinoId)
        .eq("request_id", input.requestId)
        .single();

      if (existing && !lookupError) {
        return toTableCreditDTO(existing);
      }

      throw new DomainError(
        "TABLE_CREDIT_REJECTED",
        "Idempotency lookup failed",
      );
    }
    throw new DomainError("TABLE_CREDIT_REJECTED", error.message);
  }

  return toTableCreditDTO(data);
}

// === Drop Event ===

export async function logDropEvent(
  supabase: SupabaseClient<Database>,
  input: LogDropEventInput,
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
  limit: number = 20,
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

  return toTableInventorySnapshotDTOListFromRows(data ?? []);
}

/**
 * FloorLayoutService DTOs
 *
 * Pattern B (Canonical CRUD): DTOs derived via Pick/Omit from Database types.
 * No manual interfaces except for computed/aggregated response types.
 *
 * @see SERVICE_RESPONSIBILITY_MATRIX.md section 1580-1719
 */

import type { Database } from "@/types/database.types";

// === Base Row Types (for Pick/Omit derivation) ===

type FloorLayoutRow = Database["public"]["Tables"]["floor_layout"]["Row"];
type FloorLayoutInsert = Database["public"]["Tables"]["floor_layout"]["Insert"];
type FloorLayoutVersionRow =
  Database["public"]["Tables"]["floor_layout_version"]["Row"];
type FloorPitRow = Database["public"]["Tables"]["floor_pit"]["Row"];
type FloorTableSlotRow =
  Database["public"]["Tables"]["floor_table_slot"]["Row"];
type FloorLayoutActivationRow =
  Database["public"]["Tables"]["floor_layout_activation"]["Row"];

// === Layout Status Enum (derived from database) ===

export type FloorLayoutStatus =
  Database["public"]["Enums"]["floor_layout_status"];
export type FloorLayoutVersionStatus =
  Database["public"]["Enums"]["floor_layout_version_status"];

// === Layout DTOs ===

/** Public floor layout record */
export type FloorLayoutDTO = Pick<
  FloorLayoutRow,
  | "id"
  | "casino_id"
  | "name"
  | "description"
  | "status"
  | "created_by"
  | "created_at"
  | "updated_at"
>;

/** Layout creation input */
export type CreateFloorLayoutDTO = Pick<
  FloorLayoutInsert,
  "casino_id" | "name" | "description" | "created_by"
>;

// === Version DTOs ===

/** Floor layout version record */
export type FloorLayoutVersionDTO = Pick<
  FloorLayoutVersionRow,
  | "id"
  | "layout_id"
  | "version_no"
  | "status"
  | "layout_payload"
  | "notes"
  | "created_by"
  | "created_at"
>;

// === Pit DTOs ===

/** Floor pit record */
export type FloorPitDTO = Pick<
  FloorPitRow,
  | "id"
  | "layout_version_id"
  | "label"
  | "sequence"
  | "capacity"
  | "geometry"
  | "metadata"
>;

// === Table Slot DTOs ===

/** Floor table slot record */
export type FloorTableSlotDTO = Pick<
  FloorTableSlotRow,
  | "id"
  | "layout_version_id"
  | "pit_id"
  | "slot_label"
  | "game_type"
  | "coordinates"
  | "orientation"
  | "metadata"
>;

// === Activation DTOs ===

/** Floor layout activation record */
export type FloorLayoutActivationDTO = Pick<
  FloorLayoutActivationRow,
  | "id"
  | "casino_id"
  | "layout_version_id"
  | "activated_by"
  | "activated_at"
  | "deactivated_at"
  | "activation_request_id"
>;

// === Enriched Version DTO ===

/**
 * Version with embedded pits and table slots.
 * RPC response type - computed aggregate with nested arrays.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC response: nested aggregation, not table projection
export type FloorLayoutVersionWithSlotsDTO = FloorLayoutVersionDTO & {
  pits: FloorPitDTO[];
  table_slots: FloorTableSlotDTO[];
};

// === Filter Types (for query keys and HTTP fetchers) ===

/** Filters for floor layout list queries */
export type FloorLayoutListFilters = {
  casino_id: string;
  status?: FloorLayoutStatus;
  cursor?: string;
  limit?: number;
};

/** Filters for version list queries */
export type FloorLayoutVersionFilters = {
  layout_id: string;
  status?: FloorLayoutVersionStatus;
  include_slots?: boolean;
};

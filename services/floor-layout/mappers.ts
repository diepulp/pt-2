/**
 * FloorLayoutService Mappers
 *
 * Type-safe transformations from database rows to DTOs.
 * Pattern B: Required when crud.ts exists to avoid type assertions.
 *
 * @see SLAD §327-359
 * @see DTO_CANONICAL_STANDARD.md
 */

import type { Database } from "@/types/database.types";

import type {
  FloorLayoutDTO,
  FloorLayoutVersionDTO,
  FloorLayoutVersionWithSlotsDTO,
  FloorPitDTO,
  FloorTableSlotDTO,
} from "./dtos";

// === Row Types (from database) ===

type FloorLayoutRow = Database["public"]["Tables"]["floor_layout"]["Row"];
type FloorLayoutVersionRow =
  Database["public"]["Tables"]["floor_layout_version"]["Row"];
type FloorPitRow = Database["public"]["Tables"]["floor_pit"]["Row"];
type FloorTableSlotRow =
  Database["public"]["Tables"]["floor_table_slot"]["Row"];

// === Layout Mappers ===

/** Map floor layout row to DTO */
export function toFloorLayoutDTO(row: FloorLayoutRow): FloorLayoutDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    name: row.name,
    description: row.description,
    status: row.status,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Map floor layout rows to DTO list */
export function toFloorLayoutDTOList(
  rows: FloorLayoutRow[] | null,
): FloorLayoutDTO[] {
  return (rows ?? []).map(toFloorLayoutDTO);
}

// === Version Mappers ===

/** Map floor layout version row to DTO */
export function toFloorLayoutVersionDTO(
  row: FloorLayoutVersionRow,
): FloorLayoutVersionDTO {
  return {
    id: row.id,
    layout_id: row.layout_id,
    version_no: row.version_no,
    status: row.status,
    layout_payload: row.layout_payload,
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

/** Map floor layout version rows to DTO list */
export function toFloorLayoutVersionDTOList(
  rows: FloorLayoutVersionRow[] | null,
): FloorLayoutVersionDTO[] {
  return (rows ?? []).map(toFloorLayoutVersionDTO);
}

// === Pit Mappers ===

/** Map floor pit row to DTO */
export function toFloorPitDTO(row: FloorPitRow): FloorPitDTO {
  return {
    id: row.id,
    layout_version_id: row.layout_version_id,
    label: row.label,
    sequence: row.sequence,
    capacity: row.capacity,
    geometry: row.geometry,
    metadata: row.metadata,
  };
}

/** Map floor pit rows to DTO list */
export function toFloorPitDTOList(rows: FloorPitRow[] | null): FloorPitDTO[] {
  return (rows ?? []).map(toFloorPitDTO);
}

// === Table Slot Mappers ===

/** Map floor table slot row to DTO */
export function toFloorTableSlotDTO(row: FloorTableSlotRow): FloorTableSlotDTO {
  return {
    id: row.id,
    layout_version_id: row.layout_version_id,
    pit_id: row.pit_id,
    slot_label: row.slot_label,
    game_type: row.game_type,
    coordinates: row.coordinates,
    orientation: row.orientation,
    metadata: row.metadata,
  };
}

/** Map floor table slot rows to DTO list */
export function toFloorTableSlotDTOList(
  rows: FloorTableSlotRow[] | null,
): FloorTableSlotDTO[] {
  return (rows ?? []).map(toFloorTableSlotDTO);
}

// === Enriched Version Mapper ===

/** Map version with pits and slots to enriched DTO */
export function toFloorLayoutVersionWithSlotsDTO(
  version: FloorLayoutVersionDTO,
  pits: FloorPitDTO[],
  tableSlots: FloorTableSlotDTO[],
): FloorLayoutVersionWithSlotsDTO {
  return {
    ...version,
    pits,
    table_slots: tableSlots,
  };
}

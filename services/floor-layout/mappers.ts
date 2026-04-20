/**
 * FloorLayoutService Mappers
 *
 * Type-safe transformations from database rows to DTOs.
 * Pattern B: Required when crud.ts exists to avoid type assertions.
 *
 * @see SLAD §327-359
 * @see DTO_CANONICAL_STANDARD.md
 */

import type { Database } from '@/types/database.types';

import type {
  AssignedTableRef,
  AssignOrMoveResultDTO,
  ClearResultDTO,
  FloorLayoutDTO,
  FloorLayoutVersionDTO,
  FloorLayoutVersionWithSlotsDTO,
  FloorPitDTO,
  FloorTableSlotDTO,
  FloorTableSlotWithTableRefDTO,
  PitAssignmentStateDTO,
} from './dtos';

// === Row Types (from database) ===

type FloorLayoutRow = Database['public']['Tables']['floor_layout']['Row'];
type FloorLayoutVersionRow =
  Database['public']['Tables']['floor_layout_version']['Row'];
type FloorPitRow = Database['public']['Tables']['floor_pit']['Row'];
type FloorTableSlotRow =
  Database['public']['Tables']['floor_table_slot']['Row'];
type GamingTableRow = Database['public']['Tables']['gaming_table']['Row'];

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

// === Pit Assignment Mappers (PRD-067) ===

/** Map gaming_table row projection to AssignedTableRef. */
export function toAssignedTableRef(
  row: Pick<GamingTableRow, 'id' | 'label' | 'type' | 'status'>,
): AssignedTableRef {
  return {
    id: row.id,
    label: row.label,
    type: row.type,
    status: row.status,
  };
}

/**
 * Map a slot row + optional gaming_table projection to the enriched DTO.
 * `preferred_table_id` is needed for assignment state; `assigned_table` is
 * the joined table row (null when the slot is empty).
 */
export function toFloorTableSlotWithTableRefDTO(
  row: FloorTableSlotRow,
  assignedTable: AssignedTableRef | null,
): FloorTableSlotWithTableRefDTO {
  return {
    ...toFloorTableSlotDTO(row),
    preferred_table_id: row.preferred_table_id,
    assigned_table: assignedTable,
  };
}

/**
 * Build the aggregate PitAssignmentStateDTO from four row sets scoped to
 * the active layout_version_id. Groups nothing — the client assembles per-pit
 * views via slot.pit_id.
 *
 * `allCasinoTables` is the complete gaming_table set for the casino; the
 * function computes `unassigned_tables` by subtracting those referenced by
 * `slotRows.preferred_table_id`.
 */
export function toPitAssignmentStateDTO(params: {
  layoutVersionId: string;
  pitRows: FloorPitRow[];
  slotRows: FloorTableSlotRow[];
  allCasinoTables: Pick<GamingTableRow, 'id' | 'label' | 'type' | 'status'>[];
}): PitAssignmentStateDTO {
  const { layoutVersionId, pitRows, slotRows, allCasinoTables } = params;

  const tableRefById = new Map<string, AssignedTableRef>();
  for (const table of allCasinoTables) {
    tableRefById.set(table.id, toAssignedTableRef(table));
  }

  const slots: FloorTableSlotWithTableRefDTO[] = slotRows.map((slot) =>
    toFloorTableSlotWithTableRefDTO(
      slot,
      slot.preferred_table_id
        ? (tableRefById.get(slot.preferred_table_id) ?? null)
        : null,
    ),
  );

  const assignedTableIds = new Set<string>();
  for (const slot of slotRows) {
    if (slot.preferred_table_id) assignedTableIds.add(slot.preferred_table_id);
  }

  const unassigned_tables: AssignedTableRef[] = [];
  for (const [id, ref] of tableRefById) {
    if (!assignedTableIds.has(id)) unassigned_tables.push(ref);
  }

  return {
    layout_version_id: layoutVersionId,
    pits: toFloorPitDTOList(pitRows),
    slots,
    unassigned_tables,
  };
}

// === RPC Response Mappers (jsonb → DTO) ===

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`RPC response missing string field: ${field}`);
  }
  return value;
}

function asNullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new Error(`RPC response field ${field} must be string or null`);
  }
  return value;
}

function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`RPC response missing boolean field: ${field}`);
  }
  return value;
}

/** Map rpc_assign_or_move_table_to_slot jsonb result → AssignOrMoveResultDTO. */
export function toAssignOrMoveResultDTO(value: unknown): AssignOrMoveResultDTO {
  if (!value || typeof value !== 'object') {
    throw new Error('RPC response is not an object');
  }
  const obj = value as Record<string, unknown>;
  return {
    table_id: asString(obj.table_id, 'table_id'),
    slot_id: asString(obj.slot_id, 'slot_id'),
    pit_id: asString(obj.pit_id, 'pit_id'),
    pit_label: asString(obj.pit_label, 'pit_label'),
    previous_slot_id: asNullableString(
      obj.previous_slot_id,
      'previous_slot_id',
    ),
  };
}

/** Map rpc_clear_slot_assignment jsonb result → ClearResultDTO. */
export function toClearResultDTO(value: unknown): ClearResultDTO {
  if (!value || typeof value !== 'object') {
    throw new Error('RPC response is not an object');
  }
  const obj = value as Record<string, unknown>;
  const result: ClearResultDTO = {
    cleared: asBoolean(obj.cleared, 'cleared'),
    slot_id: asString(obj.slot_id, 'slot_id'),
    previous_table_id: asNullableString(
      obj.previous_table_id,
      'previous_table_id',
    ),
  };
  if (obj.idempotent !== undefined) {
    result.idempotent = asBoolean(obj.idempotent, 'idempotent');
  }
  return result;
}

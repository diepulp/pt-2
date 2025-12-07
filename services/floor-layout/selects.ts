/**
 * FloorLayoutService Select Projections
 *
 * Named column sets for consistent query projections.
 * Pattern B: Matches DTO fields for type-safe mapping.
 *
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md section 327
 */

// === Layout Selects ===

/** Layout basic fields (matches FloorLayoutDTO) */
export const FLOOR_LAYOUT_SELECT =
  'id, casino_id, name, description, status, created_by, created_at, updated_at' as const;

/** Layout list fields (same as FLOOR_LAYOUT_SELECT for cursor pagination) */
export const FLOOR_LAYOUT_SELECT_LIST = FLOOR_LAYOUT_SELECT;

// === Version Selects ===

/** Version basic fields (matches FloorLayoutVersionDTO) */
export const FLOOR_LAYOUT_VERSION_SELECT =
  'id, layout_id, version_no, status, layout_payload, notes, created_by, created_at' as const;

/** Version list fields */
export const FLOOR_LAYOUT_VERSION_SELECT_LIST = FLOOR_LAYOUT_VERSION_SELECT;

// === Pit Selects ===

/** Pit basic fields (matches FloorPitDTO) */
export const FLOOR_PIT_SELECT =
  'id, layout_version_id, label, sequence, capacity, geometry, metadata' as const;

// === Table Slot Selects ===

/** Table slot basic fields (matches FloorTableSlotDTO) */
export const FLOOR_TABLE_SLOT_SELECT =
  'id, layout_version_id, pit_id, slot_label, game_type, coordinates, orientation, metadata' as const;

// === Activation Selects ===

/** Activation record fields (matches FloorLayoutActivationDTO) */
export const FLOOR_LAYOUT_ACTIVATION_SELECT =
  'id, casino_id, layout_version_id, activated_by, activated_at, deactivated_at, activation_request_id' as const;

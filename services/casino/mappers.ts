/**
 * CasinoService Mappers
 *
 * Type-safe transformations from database rows to DTOs.
 * Eliminates type assertions in crud.ts by providing explicit field mapping.
 *
 * Pattern: Internal row → DTO transformations per SLAD §326-331.
 *
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md §326-331
 * @see SPEC-PRD-000-casino-foundation.md section 4.2
 */

import type {
  CasinoDTO,
  CasinoSettingsDTO,
  StaffDTO,
  StaffInviteDTO,
} from './dtos';

// === Selected Row Types (match what selects.ts queries return) ===

/**
 * Type for casino rows returned by CASINO_SELECT_PUBLIC query.
 * Must match: "id, name, location, status, created_at"
 */
type CasinoSelectedRow = {
  id: string;
  name: string;
  location: string | null;
  status: string;
  created_at: string;
};

/**
 * Type for casino_settings rows returned by CASINO_SETTINGS_SELECT query.
 * Must match: "id, casino_id, gaming_day_start_time, timezone, watchlist_floor, ctr_threshold"
 */
type CasinoSettingsSelectedRow = {
  id: string;
  casino_id: string;
  gaming_day_start_time: string;
  timezone: string;
  watchlist_floor: number;
  ctr_threshold: number;
};

/**
 * Type for staff rows returned by STAFF_SELECT_PUBLIC query.
 * Must match: "id, first_name, last_name, role, status, employee_id, casino_id"
 *
 * Note: 'cashier' role added per ADR-017
 */
type StaffSelectedRow = {
  id: string;
  first_name: string;
  last_name: string;
  role: 'dealer' | 'pit_boss' | 'admin' | 'cashier';
  status: 'active' | 'inactive';
  employee_id: string | null;
  casino_id: string;
};

/**
 * Extended staff row with created_at for cursor pagination.
 * Used when we need created_at for pagination but still select STAFF_SELECT_PUBLIC columns.
 */
type StaffSelectedRowWithCreatedAt = StaffSelectedRow & {
  created_at?: string;
};

// === Casino Mappers ===

/**
 * Maps a selected casino row to CasinoDTO.
 * Explicitly maps only public fields.
 */
export function toCasinoDTO(row: CasinoSelectedRow): CasinoDTO {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    status: row.status as 'active' | 'inactive',
    created_at: row.created_at,
  };
}

/**
 * Maps an array of casino rows to CasinoDTO[].
 */
export function toCasinoDTOList(rows: CasinoSelectedRow[]): CasinoDTO[] {
  return rows.map(toCasinoDTO);
}

/**
 * Maps a nullable casino row to CasinoDTO | null.
 */
export function toCasinoDTOOrNull(
  row: CasinoSelectedRow | null,
): CasinoDTO | null {
  return row ? toCasinoDTO(row) : null;
}

// === Casino Settings Mappers ===

/**
 * Maps a selected casino_settings row to CasinoSettingsDTO.
 * Explicitly maps only public fields, omitting audit timestamps.
 */
export function toCasinoSettingsDTO(
  row: CasinoSettingsSelectedRow,
): CasinoSettingsDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    gaming_day_start_time: row.gaming_day_start_time,
    timezone: row.timezone,
    watchlist_floor: row.watchlist_floor,
    ctr_threshold: row.ctr_threshold,
  };
}

/**
 * Maps a nullable casino_settings row to CasinoSettingsDTO | null.
 */
export function toCasinoSettingsDTOOrNull(
  row: CasinoSettingsSelectedRow | null,
): CasinoSettingsDTO | null {
  return row ? toCasinoSettingsDTO(row) : null;
}

// === Staff Mappers ===

/**
 * Maps a selected staff row to StaffDTO.
 * Explicitly maps only public fields, omitting email and user_id for privacy.
 */
export function toStaffDTO(row: StaffSelectedRow): StaffDTO {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    role: row.role,
    status: row.status,
    employee_id: row.employee_id,
    casino_id: row.casino_id,
  };
}

/**
 * Maps an array of staff rows to StaffDTO[].
 */
export function toStaffDTOList(
  rows: StaffSelectedRowWithCreatedAt[],
): StaffDTO[] {
  return rows.map(toStaffDTO);
}

/**
 * Maps a nullable staff row to StaffDTO | null.
 */
export function toStaffDTOOrNull(
  row: StaffSelectedRow | null,
): StaffDTO | null {
  return row ? toStaffDTO(row) : null;
}

// === Staff Invite Mappers ===

/**
 * Row shape returned by staff_invite SELECT (excluding token_hash).
 */
type StaffInviteSelectedRow = {
  id: string;
  casino_id: string;
  email: string;
  staff_role: 'dealer' | 'pit_boss' | 'cashier' | 'admin';
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

/**
 * Maps a selected staff_invite row to StaffInviteDTO.
 */
export function toStaffInviteDTO(row: StaffInviteSelectedRow): StaffInviteDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    email: row.email,
    staff_role: row.staff_role,
    expires_at: row.expires_at,
    accepted_at: row.accepted_at,
    created_at: row.created_at,
  };
}

/**
 * Maps an array of staff_invite rows to StaffInviteDTO[].
 */
export function toStaffInviteDTOList(
  rows: StaffInviteSelectedRow[],
): StaffInviteDTO[] {
  return rows.map(toStaffInviteDTO);
}

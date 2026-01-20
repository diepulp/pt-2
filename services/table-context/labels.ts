/**
 * Table Status Label Constants (ADR-028 D6)
 *
 * Centralized UI labels and colors for table status enums.
 * Resolves naming collision between `table_status` and `table_session_status`
 * at the presentation layer with distinct human-readable labels.
 *
 * @see ADR-028 Table Status Standardization
 * @see services/table-context/dtos.ts - Type aliases
 */

import type { TableAvailability, SessionPhase, TableBankMode } from './dtos';

// === Table Availability Labels (gaming_table.status) ===

/**
 * UI labels for table availability status.
 * Maps database enum values to user-friendly display text.
 */
export const TABLE_AVAILABILITY_LABELS: Record<TableAvailability, string> = {
  inactive: 'Idle',
  active: 'Available',
  closed: 'Decommissioned',
};

/**
 * Color scheme for table availability status.
 * Uses Tailwind color names for consistency.
 */
export const TABLE_AVAILABILITY_COLORS: Record<TableAvailability, string> = {
  inactive: 'gray',
  active: 'green',
  closed: 'red',
};

// === Session Phase Labels (table_session.status) ===

/**
 * UI labels for session lifecycle phase.
 * Maps database enum values to user-friendly display text.
 */
export const SESSION_PHASE_LABELS: Record<SessionPhase, string> = {
  OPEN: 'Opening',
  ACTIVE: 'In Play',
  RUNDOWN: 'Rundown',
  CLOSED: 'Closed',
};

/**
 * Color scheme for session lifecycle phase.
 * Uses Tailwind color names for consistency.
 */
export const SESSION_PHASE_COLORS: Record<SessionPhase, string> = {
  OPEN: 'blue',
  ACTIVE: 'green',
  RUNDOWN: 'amber',
  CLOSED: 'gray',
};

// === Table Bank Mode Labels (ADR-027) ===

/**
 * UI labels for table bank mode.
 * Maps database enum values to user-friendly display text.
 *
 * @see ADR-027 Table Bank Mode (Visibility Slice, MVP)
 */
export const TABLE_BANK_MODE_LABELS: Record<TableBankMode, string> = {
  INVENTORY_COUNT: 'Inventory Count',
  IMPREST_TO_PAR: 'Imprest to Par',
};

/**
 * Descriptions for table bank mode (tooltip/help text).
 */
export const TABLE_BANK_MODE_DESCRIPTIONS: Record<TableBankMode, string> = {
  INVENTORY_COUNT: 'Count and record tray as-is at shift close',
  IMPREST_TO_PAR: 'Restore tray to par via final fill/credit before close',
};

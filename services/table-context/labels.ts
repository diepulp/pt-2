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

import type {
  TableAvailability,
  SessionPhase,
  TableBankMode,
  CloseReasonType,
} from './dtos';

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

// === Close Reason Labels (PRD-038A) ===

/**
 * UI labels for table session close reason enum.
 * Maps database enum values to user-friendly display text.
 *
 * @see PRD-038A Table Lifecycle Audit Patch
 */
export const CLOSE_REASON_LABELS: Record<CloseReasonType, string> = {
  end_of_shift: 'End of Shift',
  maintenance: 'Maintenance',
  game_change: 'Game Change',
  dealer_unavailable: 'Dealer Unavailable',
  low_demand: 'Low Demand',
  security_hold: 'Security Hold',
  emergency: 'Emergency',
  other: 'Other',
};

/**
 * Close reason options for Select/dropdown components.
 * Preserves enum ordering from CLOSE_REASON_LABELS.
 */
export const CLOSE_REASON_OPTIONS: ReadonlyArray<{
  value: CloseReasonType;
  label: string;
}> = (Object.entries(CLOSE_REASON_LABELS) as [CloseReasonType, string][]).map(
  ([value, label]) => ({ value, label }),
);

/**
 * Roles permitted to force-close a table session.
 * Matches server-side gate in close_guardrails_rpcs migration.
 */
export const FORCE_CLOSE_PRIVILEGED_ROLES: readonly string[] = [
  'pit_boss',
  'admin',
] as const;

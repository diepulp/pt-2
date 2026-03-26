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
 *
 * @deprecated Use {@link import('./admin-display').ADMIN_DISPLAY_LABELS} for admin surfaces
 * or {@link import('./pit-display').PIT_DISPLAY_LABELS} for pit surfaces.
 * ADR-047 separates admin and pit vocabularies into surface-specific modules.
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
  OPEN: 'Open',
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

// === Operator Display State Derivation (ADR-028 D6.1) ===

/**
 * Operator display states derived from table availability + session phase.
 *
 * @deprecated Use {@link import('./pit-display').PitDisplayState} for pit surfaces
 * or {@link import('./admin-display').AdminDisplayState} for admin surfaces.
 * ADR-047 separates these into surface-specific types.
 * @see ADR-028 Amendment D6.1–D6.6
 */
export type OperatorDisplayState =
  | 'IN_PLAY'
  | 'RUNDOWN'
  | 'OPEN'
  | 'AVAILABLE'
  | 'IDLE'
  | 'DECOMMISSIONED';

export interface OperatorDisplayBadge {
  state: OperatorDisplayState;
  label: string;
  /** Tailwind color token prefix (e.g., 'emerald', 'amber', 'zinc') */
  color: 'emerald' | 'amber' | 'blue' | 'zinc' | 'gray';
  /** Whether to show pulse ring animation */
  pulse: boolean;
  /** Whether to dim the badge (reduced opacity/saturation) */
  dimmed: boolean;
}

/**
 * D6.1 Composite Derivation — single source of truth for operator badge rendering.
 *
 * Precedence:
 * 1. Terminal availability states override everything (closed → DECOMMISSIONED, inactive → IDLE)
 * 2. Session phase determines display when table is active and session exists
 * 3. Active table with no session → AVAILABLE
 *
 * @deprecated Use {@link import('./pit-display').derivePitDisplayBadge} for pit surfaces
 * or {@link import('./admin-display').deriveAdminDisplayBadge} for admin surfaces.
 * ADR-047 separates badge derivation into surface-specific functions.
 * @see ADR-028 Amendment D6.2 display state table
 * @see ADR-028 Amendment D6.5 scenarios S1–S10
 */
export function deriveOperatorDisplayBadge(
  tableAvailability: TableAvailability,
  sessionPhase: SessionPhase | null | undefined,
): OperatorDisplayBadge {
  if (tableAvailability === 'closed') {
    return {
      state: 'DECOMMISSIONED',
      label: 'Decommissioned',
      color: 'zinc',
      pulse: false,
      dimmed: false,
    };
  }
  if (tableAvailability === 'inactive') {
    return {
      state: 'IDLE',
      label: 'Idle',
      color: 'gray',
      pulse: false,
      dimmed: false,
    };
  }
  // Table is active — session phase determines display
  if (sessionPhase === 'ACTIVE') {
    return {
      state: 'IN_PLAY',
      label: 'In Play',
      color: 'emerald',
      pulse: true,
      dimmed: false,
    };
  }
  if (sessionPhase === 'RUNDOWN') {
    return {
      state: 'RUNDOWN',
      label: 'Rundown',
      color: 'amber',
      pulse: false,
      dimmed: false,
    };
  }
  if (sessionPhase === 'OPEN') {
    return {
      state: 'OPEN',
      label: 'Open',
      color: 'blue',
      pulse: false,
      dimmed: false,
    };
  }
  // null/undefined session → AVAILABLE
  return {
    state: 'AVAILABLE',
    label: 'Available',
    color: 'emerald',
    pulse: false,
    dimmed: true,
  };
}

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
  cancelled: 'Cancelled',
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

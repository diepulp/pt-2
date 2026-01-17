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

import type { TableAvailability, SessionPhase } from "./dtos";

// === Table Availability Labels (gaming_table.status) ===

/**
 * UI labels for table availability status.
 * Maps database enum values to user-friendly display text.
 */
export const TABLE_AVAILABILITY_LABELS: Record<TableAvailability, string> = {
  inactive: "Idle",
  active: "Available",
  closed: "Decommissioned",
};

/**
 * Color scheme for table availability status.
 * Uses Tailwind color names for consistency.
 */
export const TABLE_AVAILABILITY_COLORS: Record<TableAvailability, string> = {
  inactive: "gray",
  active: "green",
  closed: "red",
};

// === Session Phase Labels (table_session.status) ===

/**
 * UI labels for session lifecycle phase.
 * Maps database enum values to user-friendly display text.
 */
export const SESSION_PHASE_LABELS: Record<SessionPhase, string> = {
  OPEN: "Opening",
  ACTIVE: "In Play",
  RUNDOWN: "Rundown",
  CLOSED: "Closed",
};

/**
 * Color scheme for session lifecycle phase.
 * Uses Tailwind color names for consistency.
 */
export const SESSION_PHASE_COLORS: Record<SessionPhase, string> = {
  OPEN: "blue",
  ACTIVE: "green",
  RUNDOWN: "amber",
  CLOSED: "gray",
};

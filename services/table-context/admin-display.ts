/**
 * Admin Display Module (ADR-047 D4, D5)
 *
 * Administrative vocabulary for the future admin catalog surface.
 * deriveAdminDisplayBadge() maps gaming_table.status (TableAvailability)
 * to admin-facing labels independent of the pit display vocabulary.
 *
 * No UI consumer in this PRD — constants prepared for ADR-047 Phase 3
 * (admin catalog route).
 *
 * @see ADR-047 D4 Administrative Display States
 * @see PRD-058 WS3
 */

import type { TableAvailability } from './dtos';

// === Admin Display States (table availability-derived) ===

export type AdminDisplayState = 'ON_FLOOR' | 'OFFLINE' | 'RETIRED';

export const ADMIN_DISPLAY_LABELS: Record<AdminDisplayState, string> = {
  ON_FLOOR: 'On Floor',
  OFFLINE: 'Offline',
  RETIRED: 'Retired',
};

export interface AdminDisplayBadge {
  state: AdminDisplayState;
  label: string;
  /** Tailwind color token prefix */
  color: 'emerald' | 'amber' | 'zinc';
}

/**
 * D4: Admin surface badge derivation.
 *
 * Maps table availability (gaming_table.status) to admin-facing display.
 * Independent of session lifecycle — the admin catalog shows all tables
 * regardless of operational state.
 *
 * @see ADR-047 D4 admin display state table
 * @see ADR-047 D7 scenarios A1–A3
 */
export function deriveAdminDisplayBadge(
  tableAvailability: TableAvailability,
): AdminDisplayBadge {
  switch (tableAvailability) {
    case 'active':
      return { state: 'ON_FLOOR', label: 'On Floor', color: 'emerald' };
    case 'inactive':
      return { state: 'OFFLINE', label: 'Offline', color: 'amber' };
    case 'closed':
      return { state: 'RETIRED', label: 'Retired', color: 'zinc' };
  }
}

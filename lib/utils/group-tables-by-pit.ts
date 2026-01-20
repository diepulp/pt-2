/**
 * Utility to group tables by pit for the PitMapSelector
 *
 * @see components/table/pit-map-selector.tsx
 */

import type {
  PitMapPit,
  PitMapTable,
} from '@/components/table/pit-map-selector';
import type { DashboardTableDTO } from '@/hooks/dashboard/types';

/**
 * Groups dashboard tables by their pit field.
 * Tables with null pit are grouped under "Unassigned".
 *
 * @param tables - Array of dashboard tables
 * @returns Array of pits with nested tables
 */
export function groupTablesByPit(tables: DashboardTableDTO[]): PitMapPit[] {
  const pitMap = new Map<string, PitMapTable[]>();

  for (const table of tables) {
    const pitLabel = table.pit ?? 'Unassigned';

    if (!pitMap.has(pitLabel)) {
      pitMap.set(pitLabel, []);
    }

    pitMap.get(pitLabel)!.push({
      id: table.id,
      label: table.label,
      status: table.status,
      gameType: table.type,
    });
  }

  // Convert map to array and sort pits alphabetically
  // "Unassigned" goes last
  const pits: PitMapPit[] = [];

  const sortedPitLabels = Array.from(pitMap.keys()).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  for (const pitLabel of sortedPitLabels) {
    const tables = pitMap.get(pitLabel)!;

    // Sort tables within pit by label
    tables.sort((a, b) => a.label.localeCompare(b.label));

    pits.push({
      id: pitLabel.toLowerCase().replace(/\s+/g, '-'),
      label: pitLabel,
      tables,
    });
  }

  return pits;
}

/**
 * Finds the pit ID for a given table ID.
 *
 * @param pits - Array of pits with nested tables
 * @param tableId - The table ID to find
 * @returns The pit ID or null if not found
 */
export function findPitIdForTable(
  pits: PitMapPit[],
  tableId: string | null,
): string | null {
  if (!tableId) return null;

  for (const pit of pits) {
    if (pit.tables.some((t) => t.id === tableId)) {
      return pit.id;
    }
  }

  return null;
}

/**
 * Finds the pit label for a given table ID.
 *
 * @param pits - Array of pits with nested tables
 * @param tableId - The table ID to find
 * @returns The pit label or null if not found
 */
export function findPitLabelForTable(
  pits: PitMapPit[],
  tableId: string | null,
): string | null {
  if (!tableId) return null;

  for (const pit of pits) {
    if (pit.tables.some((t) => t.id === tableId)) {
      return pit.label;
    }
  }

  return null;
}

/**
 * Inventory Snapshot Query and Mutation Hooks
 *
 * Hooks for chip inventory snapshot operations.
 * Used by ChipCountCaptureDialog and InventoryPanel.
 *
 * @see services/table-context/chip-custody.ts - Service layer
 * @see services/table-context/keys.ts - Query key factory
 * @see GAP-TABLE-ROLLOVER-UI WS1
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import {
  getInventoryHistory,
  logInventorySnapshot,
} from '@/services/table-context/chip-custody';
import type {
  LogInventorySnapshotInput,
  SnapshotType,
  TableInventorySnapshotDTO,
  ChipsetPayload,
} from '@/services/table-context/dtos';
import { tableContextKeys } from '@/services/table-context/keys';

// === Query Hooks ===

/**
 * Fetches inventory snapshot history for a gaming table.
 * Returns most recent snapshots first.
 *
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID
 * @param limit - Maximum number of snapshots to fetch (default: 20)
 */
export function useInventorySnapshots(
  tableId: string,
  casinoId: string,
  limit: number = 20,
) {
  return useQuery({
    queryKey: tableContextKeys.inventoryHistory(tableId),
    queryFn: async () => {
      const supabase = createBrowserComponentClient();
      return getInventoryHistory(supabase, tableId, casinoId, limit);
    },
    enabled: !!tableId && !!casinoId,
    staleTime: 30_000, // 30 seconds
  });
}

// === Mutation Hooks ===

/**
 * Input for creating a new inventory snapshot.
 */
export interface CreateSnapshotInput {
  snapshotType: SnapshotType;
  chipset: ChipsetPayload;
  verifiedBy?: string;
  discrepancyCents?: number;
  note?: string;
}

/**
 * Logs a new inventory snapshot.
 * Invalidates inventory history cache on success.
 *
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID
 */
export function useLogInventorySnapshot(tableId: string, casinoId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['log-inventory-snapshot', tableId],
    mutationFn: async (input: CreateSnapshotInput) => {
      const supabase = createBrowserComponentClient();
      const fullInput: LogInventorySnapshotInput = {
        casinoId,
        tableId,
        snapshotType: input.snapshotType,
        chipset: input.chipset,
        verifiedBy: input.verifiedBy,
        discrepancyCents: input.discrepancyCents,
        note: input.note,
      };
      return logInventorySnapshot(supabase, fullInput);
    },
    onSuccess: () => {
      // Invalidate inventory history to refetch with new snapshot
      queryClient.invalidateQueries({
        queryKey: tableContextKeys.inventoryHistory(tableId),
      });
    },
  });
}

// === Utility Functions ===

/**
 * Standard US chip denominations.
 * Used as default in ChipCountCaptureDialog.
 */
export const STANDARD_DENOMINATIONS = [1, 5, 25, 100, 500] as const;

/**
 * Calculates total value from chipset payload.
 */
export function calculateChipsetTotal(chipset: ChipsetPayload): number {
  return Object.entries(chipset).reduce((total, [denom, qty]) => {
    return total + Number(denom) * qty;
  }, 0);
}

/**
 * Creates an empty chipset payload with standard denominations.
 */
export function createEmptyChipset(): ChipsetPayload {
  const chipset: ChipsetPayload = {};
  for (const denom of STANDARD_DENOMINATIONS) {
    chipset[String(denom)] = 0;
  }
  return chipset;
}

/**
 * Formats snapshot type for display.
 */
export function getSnapshotTypeLabel(type: SnapshotType): string {
  const labels: Record<SnapshotType, string> = {
    open: 'Opening',
    close: 'Closing',
    rundown: 'Rundown',
  };
  return labels[type];
}

// Re-export types for convenience
export type { TableInventorySnapshotDTO, SnapshotType, ChipsetPayload };

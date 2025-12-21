/**
 * Table Settings Query and Mutation Hooks
 *
 * Hooks for fetching and updating table betting limits.
 * Auto-creates settings from game_settings defaults if missing.
 *
 * @see services/table-context/http.ts - HTTP fetchers
 * @see services/table-context/keys.ts - Query key factory
 * @see PRD-012 Table Betting Limits Management
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  TableSettingsDTO,
  UpdateTableLimitsDTO,
} from "@/services/table-context/dtos";
import {
  fetchTableSettings,
  patchTableLimits,
} from "@/services/table-context/http";
import { tableContextKeys } from "@/services/table-context/keys";

/**
 * Fetches table betting limits settings.
 * Auto-creates settings from game_settings defaults if missing.
 *
 * @param tableId - Table UUID
 */
export function useTableSettings(tableId: string) {
  return useQuery({
    queryKey: tableContextKeys.settings(tableId),
    queryFn: () => fetchTableSettings(tableId),
    enabled: !!tableId,
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Updates table betting limits.
 * Generates idempotency key per mutation call.
 * Immediately updates cache with returned data on success.
 *
 * @param tableId - Table UUID
 */
export function useUpdateTableLimits(tableId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    // Mutation key ensures hook recreates when tableId changes
    mutationKey: ["update-table-limits", tableId],
    mutationFn: async (data: UpdateTableLimitsDTO) => {
      const idempotencyKey = crypto.randomUUID();
      return patchTableLimits(tableId, data, idempotencyKey);
    },
    onSuccess: (data) => {
      // Immediately update cache with returned data for instant UI feedback
      queryClient.setQueryData(tableContextKeys.settings(tableId), data);
    },
  });
}

// Re-export types for convenience
export type { TableSettingsDTO, UpdateTableLimitsDTO };

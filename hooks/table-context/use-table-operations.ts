/**
 * Table Operations Hooks
 *
 * TanStack Query mutations for table status updates.
 * Implements idempotency and query invalidation patterns.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { tableContextKeys } from "@/services/table-context";
import type { Database } from "@/types/database.types";

// ============================================================================
// TYPES
// ============================================================================

interface UpdateTableStatusParams {
  tableId: string;
  status: Database["public"]["Enums"]["table_status"];
}

interface UpdateTableStatusResponse {
  success: boolean;
  table: {
    id: string;
    status: Database["public"]["Enums"]["table_status"];
  };
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Update table status mutation
 *
 * Calls POST /api/v1/table-context/status
 * - Generates idempotency key for each request
 * - Invalidates related table queries on success
 *
 * @example
 * const { mutate, isPending } = useUpdateTableStatus();
 * mutate({ tableId: '123', status: 'active' });
 */
export function useUpdateTableStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    // Generic mutation key (W1 fix - no tableId in key)
    mutationKey: tableContextKeys.updateStatus(""),

    mutationFn: async ({ tableId, status }: UpdateTableStatusParams) => {
      // Generate idempotency key
      const idempotencyKey = crypto.randomUUID();

      const response = await fetch("/api/v1/table-context/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ tableId, status }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update table status");
      }

      return response.json() as Promise<UpdateTableStatusResponse>;
    },

    onSuccess: (_, { tableId }) => {
      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: tableContextKeys.byTable(tableId),
      });
      queryClient.invalidateQueries({
        queryKey: tableContextKeys.tables.scope,
      });
    },
  });
}

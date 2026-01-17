/**
 * Drop Event Query and Mutation Hooks
 *
 * Hooks for drop box custody event operations.
 * Used by DropEventDialog and InventoryPanel.
 *
 * @see services/table-context/chip-custody.ts - Service layer
 * @see services/table-context/keys.ts - Query key factory
 * @see GAP-TABLE-ROLLOVER-UI WS3
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createBrowserComponentClient } from "@/lib/supabase/client";
import { logDropEvent } from "@/services/table-context/chip-custody";
import type {
  LogDropEventInput,
  TableDropEventDTO,
} from "@/services/table-context/dtos";
import { tableContextKeys } from "@/services/table-context/keys";

// === Query Hooks ===

/**
 * Fetches drop events for a gaming table.
 * Optionally filters by gaming day.
 *
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID
 * @param gamingDay - Optional gaming day filter (YYYY-MM-DD)
 * @param limit - Maximum number of events to fetch (default: 20)
 */
export function useDropEvents(
  tableId: string,
  casinoId: string,
  gamingDay?: string,
  limit: number = 20,
) {
  return useQuery({
    queryKey: [...tableContextKeys.drops(tableId), gamingDay ?? "all"],
    queryFn: async () => {
      const supabase = createBrowserComponentClient();
      let query = supabase
        .from("table_drop_event")
        .select("*")
        .eq("table_id", tableId)
        .eq("casino_id", casinoId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (gamingDay) {
        query = query.eq("gaming_day", gamingDay);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      return data as TableDropEventDTO[];
    },
    enabled: !!tableId && !!casinoId,
    staleTime: 30_000, // 30 seconds
  });
}

// === Mutation Hooks ===

/**
 * Input for creating a new drop event.
 * Simplified input - casinoId and tableId are injected by the hook.
 */
export interface CreateDropEventInput {
  dropBoxId: string;
  sealNo: string;
  witnessedBy: string;
  removedAt?: string;
  gamingDay?: string;
  seqNo?: number;
  note?: string;
}

/**
 * Logs a new drop event.
 * Invalidates drop events cache on success.
 *
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID
 */
export function useLogDropEvent(tableId: string, casinoId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["log-drop-event", tableId],
    mutationFn: async (input: CreateDropEventInput) => {
      const supabase = createBrowserComponentClient();
      const fullInput: LogDropEventInput = {
        casinoId,
        tableId,
        dropBoxId: input.dropBoxId,
        sealNo: input.sealNo,
        witnessedBy: input.witnessedBy,
        removedAt: input.removedAt,
        gamingDay: input.gamingDay,
        seqNo: input.seqNo,
        note: input.note,
      };
      return logDropEvent(supabase, fullInput);
    },
    onSuccess: () => {
      // Invalidate drop events cache
      queryClient.invalidateQueries({
        queryKey: tableContextKeys.drops(tableId),
      });
    },
  });
}

// === Utility Functions ===

/**
 * Formats drop event for display in picker.
 */
export function formatDropEventLabel(event: TableDropEventDTO): string {
  const time = new Date(event.removed_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const seal = event.seal_no ? ` • Seal #${event.seal_no}` : "";
  return `${time}${seal}`;
}

/**
 * Gets next sequence number for a new drop event.
 */
export function getNextSeqNo(events: TableDropEventDTO[]): number {
  if (events.length === 0) return 1;
  const maxSeq = Math.max(...events.map((e) => e.seq_no ?? 0));
  return maxSeq + 1;
}

// Re-export types for convenience
export type { TableDropEventDTO };

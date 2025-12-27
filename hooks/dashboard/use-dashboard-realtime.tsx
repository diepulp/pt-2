/**
 * Dashboard Realtime Hook
 *
 * Subscribes to Supabase realtime changes for dashboard data.
 * Invalidates React Query cache when relevant changes occur.
 *
 * P1 feature - graceful degradation if realtime unavailable.
 *
 * @see PRD-006 Pit Dashboard UI
 * @see EXECUTION-SPEC-PRD-006.md WS5
 */

"use client";

import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { createBrowserComponentClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";

import { dashboardKeys } from "./keys";

type GamingTableRow = Database["public"]["Tables"]["gaming_table"]["Row"];
type RatingSlipRow = Database["public"]["Tables"]["rating_slip"]["Row"];

interface UseDashboardRealtimeOptions {
  /** Casino ID to scope subscriptions */
  casinoId: string;
  /** Selected table ID for slip subscriptions */
  selectedTableId?: string | null;
  /** Enable/disable realtime (defaults to true) */
  enabled?: boolean;
}

interface DashboardRealtimeResult {
  /** Whether realtime is connected */
  isConnected: boolean;
  /** Connection error (if any) */
  error: Error | null;
  /** Last update timestamp */
  lastUpdate: Date | null;
}

/**
 * Subscribes to realtime changes for gaming tables and rating slips.
 * Automatically invalidates relevant React Query caches on changes.
 *
 * @example
 * ```tsx
 * const { isConnected, error } = useDashboardRealtime({
 *   casinoId,
 *   selectedTableId,
 * });
 * ```
 */
export function useDashboardRealtime({
  casinoId,
  selectedTableId,
  enabled = true,
}: UseDashboardRealtimeOptions): DashboardRealtimeResult {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = React.useState<Date | null>(null);

  // Track active channel
  const channelRef = React.useRef<RealtimeChannel | null>(null);

  React.useEffect(() => {
    if (!enabled || !casinoId) {
      return;
    }

    const supabase = createBrowserComponentClient();
    const channelName = `dashboard:${casinoId}`;

    // Create channel with subscriptions
    const channel = supabase
      .channel(channelName)
      // Subscribe to gaming_table changes
      .on<GamingTableRow>(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gaming_table",
          filter: `casino_id=eq.${casinoId}`,
        },
        (payload: RealtimePostgresChangesPayload<GamingTableRow>) => {
          handleTableChange(payload);
        },
      )
      // Subscribe to rating_slip changes
      .on<RatingSlipRow>(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rating_slip",
          filter: `casino_id=eq.${casinoId}`,
        },
        (payload: RealtimePostgresChangesPayload<RatingSlipRow>) => {
          handleSlipChange(payload);
        },
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
          setError(null);
        } else if (status === "CHANNEL_ERROR") {
          setIsConnected(false);
          setError(new Error("Realtime channel error"));
        } else if (status === "TIMED_OUT") {
          setIsConnected(false);
          setError(new Error("Realtime connection timed out"));
        }
      });

    channelRef.current = channel;

    // Handle table changes
    function handleTableChange(
      payload: RealtimePostgresChangesPayload<GamingTableRow>,
    ) {
      setLastUpdate(new Date());

      // Invalidate tables query
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.tables.scope,
      });

      // Invalidate stats
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
    }

    // Handle slip changes
    // PRD-020: Use TARGETED invalidation to prevent N×2 HTTP cascade
    function handleSlipChange(
      payload: RealtimePostgresChangesPayload<RatingSlipRow>,
    ) {
      setLastUpdate(new Date());

      const record = payload.new as RatingSlipRow | undefined;
      const oldRecord = payload.old as Partial<RatingSlipRow> | undefined;

      // Determine which table(s) were affected
      const newTableId = record?.table_id;
      const oldTableId = oldRecord?.table_id;

      // PRD-020: Targeted invalidation - only invalidate affected table(s)
      // This prevents the N×2 cascade where ALL tables would refetch
      if (newTableId) {
        queryClient.invalidateQueries({
          queryKey: dashboardKeys.activeSlips(newTableId),
        });
        queryClient.invalidateQueries({
          queryKey: dashboardKeys.slips(newTableId),
        });
      }

      // If table changed (move operation), also invalidate the old table
      if (oldTableId && oldTableId !== newTableId) {
        queryClient.invalidateQueries({
          queryKey: dashboardKeys.activeSlips(oldTableId),
        });
        queryClient.invalidateQueries({
          queryKey: dashboardKeys.slips(oldTableId),
        });
      }

      // Invalidate stats (slip count may have changed)
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });

      // PRD-020: Do NOT invalidate tables.scope - this triggers re-renders
      // The table card's activeSlipsCount will be updated by the targeted slip invalidation
    }

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [casinoId, selectedTableId, enabled, queryClient]);

  return {
    isConnected,
    error,
    lastUpdate,
  };
}

/**
 * Realtime connection status indicator component.
 * Shows a small dot indicating realtime status.
 */
export function RealtimeStatusIndicator({
  isConnected,
  error,
  className,
}: {
  isConnected: boolean;
  error: Error | null;
  className?: string;
}) {
  if (error) {
    return (
      <div className={className} title={`Realtime error: ${error.message}`}>
        <div className="h-2 w-2 rounded-full bg-destructive" />
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className={className} title="Realtime connected">
        <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
      </div>
    );
  }

  return (
    <div className={className} title="Realtime connecting...">
      <div className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
    </div>
  );
}

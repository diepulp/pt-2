/**
 * Shift Dashboard Realtime Hook — ADR-050 §4 E1/E3 canonical surface
 *
 * Subscribes to postgres_changes on `public.table_buyin_telemetry` and
 * invalidates the registered shiftDashboardKeys factory on WAL arrival.
 *
 * DEC-DD1(c): centralized debounce — WAL-side invalidation is suppressed
 * within DEBOUNCE_WINDOW_MS of any preceding shift-dashboard-keyed
 * invalidation (which is how mutation-side code signals it already
 * invalidated the surface). This eliminates double-refetch without
 * requiring per-mutation-hook coordination code.
 *
 * The mutation-side signal is observed via `queryClient.getQueryCache().subscribe()`
 * — TanStack Query v5's QueryCache emits `QueryCacheNotifyEvent` whose
 * `action.type === 'invalidate'` identifies invalidateQueries calls.
 *
 * @see ADR-050 Financial Surface Freshness Contract
 * @see PRD-068 / EXEC-068 W2
 * @see hooks/dashboard/use-dashboard-realtime.tsx (canonical exemplar)
 */

'use client';

import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import type { Database } from '@/types/database.types';

import { shiftDashboardKeys } from './keys';

type TableBuyinTelemetryRow =
  Database['public']['Tables']['table_buyin_telemetry']['Row'];

interface UseShiftDashboardRealtimeOptions {
  /** Casino ID to scope subscription (RLS Pattern C, §4 E3). */
  casinoId: string | null | undefined;
  /** Enable/disable (defaults true). E2E sets to false via NEXT_PUBLIC_E2E_DISABLE_REALTIME. */
  enabled?: boolean;
}

interface ShiftDashboardRealtimeResult {
  isConnected: boolean;
  error: Error | null;
  lastUpdate: Date | null;
}

/** DEC-DD1 debounce window — WAL events within this window of a mutation-side
 *  invalidation are suppressed. 500ms matches the typical React-Query refetch
 *  completion time after invalidateQueries. */
export const DEBOUNCE_WINDOW_MS = 500;

/** Returns true when a queryKey belongs to the shift-dashboard root. */
export function isShiftDashboardKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === shiftDashboardKeys.root[0];
}

export function useShiftDashboardRealtime({
  casinoId,
  enabled = true,
}: UseShiftDashboardRealtimeOptions): ShiftDashboardRealtimeResult {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = React.useState<Date | null>(null);

  const channelRef = React.useRef<RealtimeChannel | null>(null);
  const lastMutationInvalidationAtRef = React.useRef<number | null>(null);

  // DEC-DD1(c): observe mutation-side invalidations via QueryCache subscribe.
  React.useEffect(() => {
    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.action?.type === 'invalidate' &&
        isShiftDashboardKey(event.query.queryKey)
      ) {
        lastMutationInvalidationAtRef.current = Date.now();
      }
    });
    return unsubscribe;
  }, [queryClient]);

  React.useEffect(() => {
    if (!enabled || !casinoId) {
      return;
    }

    const supabase = createBrowserComponentClient();
    const channelName = `shift-dashboard-rated-buyin-${casinoId}`;

    const channel = supabase
      .channel(channelName)
      .on<TableBuyinTelemetryRow>(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'table_buyin_telemetry',
          filter: `casino_id=eq.${casinoId}`,
        },
        (_payload: RealtimePostgresChangesPayload<TableBuyinTelemetryRow>) => {
          handleTelemetryChange();
        },
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          setError(null);
        } else if (status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          setError(new Error('Realtime channel error'));
        } else if (status === 'TIMED_OUT') {
          setIsConnected(false);
          setError(new Error('Realtime connection timed out'));
        }
      });

    channelRef.current = channel;

    function handleTelemetryChange() {
      const last = lastMutationInvalidationAtRef.current;
      if (last !== null && Date.now() - last < DEBOUNCE_WINDOW_MS) {
        // Mutation-side already invalidated; skip to avoid double-refetch.
        return;
      }
      setLastUpdate(new Date());
      queryClient.invalidateQueries({
        queryKey: shiftDashboardKeys.summary.scope,
      });
      queryClient.invalidateQueries({
        queryKey: shiftDashboardKeys.tableMetrics.scope,
      });
    }

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [casinoId, enabled, queryClient]);

  return { isConnected, error, lastUpdate };
}

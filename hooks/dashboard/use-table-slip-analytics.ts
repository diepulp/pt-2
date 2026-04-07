/**
 * Table Slip Analytics Hook
 *
 * Fetches closed rating slips for a selected table on a gaming day,
 * then derives hourly activity buckets and session breakdown by player segment.
 *
 * Direct Supabase query (no RPC) — RLS casino-scoped via auth context.
 * Joins through visit for authoritative gaming_day filter.
 *
 * @see analytics-panel-pre-wiring-report.md — Stubs 2 & 3
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';

import { dashboardKeys } from './keys';

// === Types ===

export interface HourlyBucket {
  /** Hour of day (0-23) */
  hour: number;
  /** Number of closed slips that started in this hour */
  count: number;
}

export interface PlayerSegment {
  label: string;
  count: number;
  /** Total computed theo in cents for the segment */
  theoCents: number;
  color: string;
}

export interface TableSlipAnalytics {
  hourlyActivity: HourlyBucket[];
  sessionBreakdown: PlayerSegment[];
}

// === Segment Classification ===

/** Classify player by average bet (dollars). */
function classifySegment(
  averageBet: number | null,
): 'high' | 'regular' | 'casual' {
  if (averageBet === null || averageBet < 25) return 'casual';
  if (averageBet >= 100) return 'high';
  return 'regular';
}

const SEGMENT_CONFIG = {
  high: { label: 'High Rollers', color: 'bg-violet-500' },
  regular: { label: 'Regular Players', color: 'bg-cyan-500' },
  casual: { label: 'Casual Players', color: 'bg-emerald-500' },
} as const;

// === Derivation ===

function deriveAnalytics(
  rows: {
    start_time: string;
    average_bet: number | null;
    computed_theo_cents: number | null;
  }[],
): TableSlipAnalytics {
  // Hourly buckets (0-23)
  const hourCounts = new Map<number, number>();
  const segments = {
    high: { count: 0, theoCents: 0 },
    regular: { count: 0, theoCents: 0 },
    casual: { count: 0, theoCents: 0 },
  };

  for (const row of rows) {
    // Hourly
    const hour = new Date(row.start_time).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);

    // Segments
    const seg = classifySegment(row.average_bet);
    segments[seg].count += 1;
    segments[seg].theoCents += Number(row.computed_theo_cents ?? 0);
  }

  // Build sorted hourly array (only hours with data)
  const hourlyActivity: HourlyBucket[] = Array.from(hourCounts.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);

  // Build segment array (always show all 3, even if count=0)
  const sessionBreakdown: PlayerSegment[] = (
    ['high', 'regular', 'casual'] as const
  ).map((key) => ({
    ...SEGMENT_CONFIG[key],
    count: segments[key].count,
    theoCents: segments[key].theoCents,
  }));

  return { hourlyActivity, sessionBreakdown };
}

// === Hook ===

/**
 * Fetches closed slips for a table on a gaming day and derives analytics.
 *
 * @param tableId - Gaming table UUID (undefined disables query)
 * @param gamingDay - YYYY-MM-DD gaming day (undefined disables query)
 */
export function useTableSlipAnalytics(
  tableId: string | undefined,
  gamingDay: string | undefined | null,
) {
  return useQuery({
    queryKey: dashboardKeys.tableSlipAnalytics(tableId!, gamingDay!),
    queryFn: async (): Promise<TableSlipAnalytics> => {
      const supabase = createBrowserComponentClient();

      const { data, error } = await supabase
        .from('rating_slip')
        .select(
          'start_time, average_bet, computed_theo_cents, visit!inner(gaming_day)',
        )
        .eq('table_id', tableId!)
        .eq('status', 'closed')
        .eq('visit.gaming_day', gamingDay!)
        .order('start_time', { ascending: true });

      if (error) throw error;

      return deriveAnalytics(data ?? []);
    },
    enabled: !!tableId && !!gamingDay,
    staleTime: 30_000,
  });
}

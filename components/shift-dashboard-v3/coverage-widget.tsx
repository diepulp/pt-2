'use client';

/**
 * CoverageWidget — Rating coverage health indicator for shift dashboard.
 *
 * Displays casino-level accounted_ratio with health tier badge,
 * plus worst 5 tables by untracked_ratio.
 *
 * Surface Classification (ADR-041):
 * - Rendering: Hybrid (parent RSC Prefetch; widget client-fetched)
 * - Data Aggregation: Simple Query (single view, single bounded context)
 * - Metric Provenance: MEAS-003 (Derived Operational, Cached 30s)
 *
 * @see PRD-049 WS1 — Shift Dashboard Coverage Widget
 */

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useShiftCoverage } from '@/hooks/measurement/use-shift-coverage';
import { cn } from '@/lib/utils';
import type { Database } from '@/types/database.types';

type RatingCoverageRow =
  Database['public']['Views']['measurement_rating_coverage_v']['Row'];

// === Health Tier Logic ===

type HealthTier = 'healthy' | 'warning' | 'critical';

const TIER_CONFIG: Record<HealthTier, { label: string; color: string }> = {
  healthy: {
    label: 'HEALTHY',
    color: 'text-emerald-400 border-emerald-500/40',
  },
  warning: { label: 'WARNING', color: 'text-amber-400 border-amber-500/40' },
  critical: { label: 'CRITICAL', color: 'text-red-400 border-red-500/40' },
};

function getHealthTier(ratio: number): HealthTier {
  if (ratio >= 0.75) return 'healthy';
  if (ratio >= 0.5) return 'warning';
  return 'critical';
}

// === Pure aggregation function (exported for testing) ===

/**
 * Compute casino-level weighted average coverage ratio.
 * Returns 0 when total_seconds is 0 (no active sessions).
 */
export function computeWeightedCoverage(rows: RatingCoverageRow[]): number {
  let totalRated = 0;
  let totalOpen = 0;

  for (const row of rows) {
    totalRated += row.rated_seconds ?? 0;
    totalOpen += row.open_seconds ?? 0;
  }

  if (totalOpen === 0) return 0;
  return totalRated / totalOpen;
}

// === Duration formatter ===

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const remainM = m % 60;
  return remainM > 0 ? `${h}h ${remainM}m` : `${h}h`;
}

// === Table ranking ===

interface RankedTable {
  tableId: string;
  untrackedRatio: number;
  ratedRatio: number;
  untrackedSeconds: number;
}

function rankWorstTables(rows: RatingCoverageRow[], limit = 5): RankedTable[] {
  // Aggregate multiple sessions per table (a table can have >1 session per day)
  const byTable = new Map<
    string,
    { openSeconds: number; ratedSeconds: number; untrackedSeconds: number }
  >();
  for (const row of rows) {
    const id = row.gaming_table_id ?? 'unknown';
    const existing = byTable.get(id) ?? {
      openSeconds: 0,
      ratedSeconds: 0,
      untrackedSeconds: 0,
    };
    existing.openSeconds += row.open_seconds ?? 0;
    existing.ratedSeconds += row.rated_seconds ?? 0;
    existing.untrackedSeconds += row.untracked_seconds ?? 0;
    byTable.set(id, existing);
  }

  return Array.from(byTable.entries())
    .map(([tableId, agg]) => ({
      tableId,
      untrackedRatio:
        agg.openSeconds > 0 ? agg.untrackedSeconds / agg.openSeconds : 0,
      ratedRatio: agg.openSeconds > 0 ? agg.ratedSeconds / agg.openSeconds : 0,
      untrackedSeconds: agg.untrackedSeconds,
    }))
    .sort((a, b) => b.untrackedRatio - a.untrackedRatio)
    .slice(0, limit);
}

// === Skeleton ===

function CoverageSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="h-8 w-20" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}

// === Main Component ===

interface CoverageWidgetProps {
  casinoId: string;
  gamingDay?: string;
}

export function CoverageWidget({ casinoId, gamingDay }: CoverageWidgetProps) {
  const { data, isLoading, isError } = useShiftCoverage(casinoId, gamingDay);

  if (isError) {
    // Error handled by parent PanelErrorBoundary
    throw new Error('Coverage data unavailable');
  }

  const rows = data?.rows ?? [];
  const aggregateRatio = computeWeightedCoverage(rows);
  const tier = getHealthTier(aggregateRatio);
  const tierConfig = TIER_CONFIG[tier];
  const worstTables = rankWorstTables(rows);

  return (
    <Card className="min-h-[120px] border-border/50 bg-card p-4">
      {/* Section header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Rating Coverage
        </span>
        {!isLoading && rows.length > 0 && (
          <span
            className={cn(
              'rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider',
              tierConfig.color,
            )}
          >
            {tierConfig.label}
          </span>
        )}
      </div>

      {isLoading ? (
        <CoverageSkeleton />
      ) : rows.length === 0 ? (
        <p className="py-4 text-center font-mono text-xs text-muted-foreground">
          No table sessions for current shift
        </p>
      ) : (
        <>
          {/* Casino-level aggregate */}
          <div className="mb-4">
            <span className="font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground">
              {(aggregateRatio * 100).toFixed(1)}%
            </span>
            <span className="ml-1.5 font-mono text-xs text-muted-foreground">
              accounted
            </span>
          </div>

          {/* Worst tables ranking */}
          {worstTables.length > 0 && (
            <div className="space-y-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Untracked — Worst Tables
              </span>
              {worstTables.map((table) => (
                <div
                  key={table.tableId}
                  className="flex items-center justify-between font-mono text-xs"
                >
                  <span
                    className="truncate text-muted-foreground"
                    title={table.tableId}
                  >
                    {table.tableId.slice(0, 8)}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums text-foreground">
                      {(table.ratedRatio * 100).toFixed(0)}%
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatSeconds(table.untrackedSeconds)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

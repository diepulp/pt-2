/**
 * Rating Coverage Section
 *
 * Rating coverage metrics, active visitors (rated/unrated),
 * theo discrepancy badge (DEC-002).
 *
 * RatingCoverageDto fields:
 *   totalSessions, avgCoverageRatio, ratedSeconds, openSeconds, untrackedSeconds
 *
 * TheoDiscrepancyDto fields:
 *   totalSlips, discrepantSlips, discrepancyRate, totalDiscrepancyCents, avgDiscrepancyPercent
 *
 * @see EXEC-065 WS2
 */

import { Badge } from '@/components/ui/badge';
import type { RatingCoverageSection } from '@/services/reporting/shift-report';

import { formatCents, formatPercent, formatNumber } from '../format';

interface RatingCoverageProps {
  data: RatingCoverageSection;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function RatingCoverage({ data }: RatingCoverageProps) {
  return (
    <section className="mb-8">
      <h3
        className="text-sm font-bold uppercase tracking-widest mb-4 border-b border-border pb-2"
        style={{ fontFamily: 'monospace' }}
      >
        3. Rating Coverage
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Active Visitors */}
        {data.activeVisitors && (
          <div className="border-2 border-border bg-card p-4">
            <div
              className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3"
              style={{ fontFamily: 'monospace' }}
            >
              Active Visitors
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-mono tabular-nums font-semibold">
                  {formatNumber(data.activeVisitors.totalCount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rated</span>
                <span className="font-mono tabular-nums">
                  {formatNumber(data.activeVisitors.ratedCount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unrated</span>
                <span className="font-mono tabular-nums">
                  {formatNumber(data.activeVisitors.unratedCount)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">Rated %</span>
                <span className="font-mono tabular-nums font-semibold">
                  {formatPercent(data.activeVisitors.ratedPercentage)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Rating Coverage Metrics — RatingCoverageDto */}
        {data.ratingCoverage && (
          <div className="border-2 border-border bg-card p-4">
            <div
              className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3"
              style={{ fontFamily: 'monospace' }}
            >
              Rating Coverage Metrics
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Sessions</span>
                <span className="font-mono tabular-nums">
                  {formatNumber(data.ratingCoverage.totalSessions)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Coverage</span>
                <span className="font-mono tabular-nums">
                  {formatPercent(data.ratingCoverage.avgCoverageRatio * 100)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rated Time</span>
                <span className="font-mono tabular-nums">
                  {formatDuration(data.ratingCoverage.ratedSeconds)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Open Time</span>
                <span className="font-mono tabular-nums">
                  {formatDuration(data.ratingCoverage.openSeconds)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Theo Discrepancy Badge (DEC-002) — TheoDiscrepancyDto */}
        {data.theoDiscrepancy && (
          <div className="border-2 border-border bg-card p-4 md:col-span-2">
            <div
              className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3"
              style={{ fontFamily: 'monospace' }}
            >
              Theo Discrepancy (DEC-002)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs">
                  Total Slips
                </span>
                <span className="font-mono tabular-nums">
                  {formatNumber(data.theoDiscrepancy.totalSlips)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">
                  Discrepant
                </span>
                <span className="font-mono tabular-nums">
                  {formatNumber(data.theoDiscrepancy.discrepantSlips)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">
                  Total Discrepancy
                </span>
                <span className="font-mono tabular-nums">
                  {formatCents(data.theoDiscrepancy.totalDiscrepancyCents)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">
                  Discrepancy Rate
                </span>
                <Badge
                  variant={
                    data.theoDiscrepancy.discrepancyRate > 20
                      ? 'destructive'
                      : 'secondary'
                  }
                  className="mt-1"
                >
                  {formatPercent(data.theoDiscrepancy.discrepancyRate)}
                </Badge>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {!data.activeVisitors &&
        !data.ratingCoverage &&
        !data.theoDiscrepancy && (
          <p className="text-sm text-muted-foreground italic">
            No rating coverage data available for this shift.
          </p>
        )}
    </section>
  );
}

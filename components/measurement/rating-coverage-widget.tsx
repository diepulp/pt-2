/**
 * Rating Coverage Widget (MEAS-003)
 *
 * Displays rating session coverage metrics.
 * Supports pit/table breakdown when filtered.
 *
 * @see EXEC-046 WS5 — Widget Components
 */

'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumber, formatPercentage } from '@/lib/format';
import type { RatingCoverageDto, WidgetError } from '@/services/measurement';

import { MetricWidget } from './metric-widget';

export interface RatingCoverageWidgetProps {
  data: RatingCoverageDto | null;
  error?: WidgetError;
  currentFilter?: { pitId?: string; tableId?: string };
  isLoading?: boolean;
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function RatingCoverageWidget({
  data,
  error,
  currentFilter,
  isLoading,
}: RatingCoverageWidgetProps) {
  return (
    <MetricWidget
      title="Rating Coverage"
      freshness="request-time"
      error={error}
      supportedDimensions={data?.supportedDimensions}
      currentFilter={currentFilter}
      isLoading={isLoading}
    >
      {data ? (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Total Sessions</p>
              <p className="text-lg font-semibold font-mono tabular-nums">
                {formatNumber(data.totalSessions)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Coverage</p>
              <p className="text-lg font-semibold font-mono tabular-nums">
                {formatPercentage(data.avgCoverageRatio, 1)}
              </p>
            </div>
          </div>

          {/* Time breakdown */}
          <div className="border-t pt-3 grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Rated</p>
              <p className="text-sm font-semibold font-mono tabular-nums">
                {formatSeconds(data.ratedSeconds)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Open</p>
              <p className="text-sm font-semibold font-mono tabular-nums">
                {formatSeconds(data.openSeconds)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Untracked</p>
              <p className="text-sm font-semibold font-mono tabular-nums">
                {formatSeconds(data.untrackedSeconds)}
              </p>
            </div>
          </div>

          {/* Breakdown table (when filtered) */}
          {data.breakdown && data.breakdown.length > 0 && (
            <div className="border-t pt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Group</TableHead>
                    <TableHead className="text-xs text-right">
                      Sessions
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      Coverage
                    </TableHead>
                    <TableHead className="text-xs text-right">Rated</TableHead>
                    <TableHead className="text-xs text-right">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.breakdown.map((row) => (
                    <TableRow key={row.groupName}>
                      <TableCell className="text-xs font-medium">
                        {row.groupName}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono tabular-nums">
                        {formatNumber(row.sessionCount)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono tabular-nums">
                        {formatPercentage(row.avgCoverageRatio, 1)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono tabular-nums">
                        {formatSeconds(row.ratedSeconds)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono tabular-nums">
                        {formatSeconds(row.openSeconds)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No data available
        </p>
      )}
    </MetricWidget>
  );
}

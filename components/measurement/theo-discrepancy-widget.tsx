/**
 * Theo Discrepancy Widget (MEAS-001)
 *
 * Displays computed vs. legacy theo discrepancy metrics.
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
import { formatCents, formatNumber, formatPercentage } from '@/lib/format';
import type { TheoDiscrepancyDto, WidgetError } from '@/services/measurement';

import { MetricWidget } from './metric-widget';

export interface TheoDiscrepancyWidgetProps {
  data: TheoDiscrepancyDto | null;
  error?: WidgetError;
  currentFilter?: { pitId?: string; tableId?: string };
  isLoading?: boolean;
}

export function TheoDiscrepancyWidget({
  data,
  error,
  currentFilter,
  isLoading,
}: TheoDiscrepancyWidgetProps) {
  return (
    <MetricWidget
      title="Theo Discrepancy"
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
              <p className="text-xs text-muted-foreground">Total Slips</p>
              <p className="text-lg font-semibold font-mono tabular-nums">
                {formatNumber(data.totalSlips)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Discrepant</p>
              <p className="text-lg font-semibold font-mono tabular-nums">
                {formatNumber(data.discrepantSlips)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Discrepancy Rate</p>
              <p className="text-lg font-semibold font-mono tabular-nums">
                {formatPercentage(data.discrepancyRate, 1)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Discrepancy</p>
              <p className="text-lg font-semibold font-mono tabular-nums">
                {formatCents(data.totalDiscrepancyCents)}
              </p>
            </div>
          </div>

          {/* Avg discrepancy */}
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground">Avg Discrepancy %</p>
            <p className="text-sm font-semibold font-mono tabular-nums">
              {formatPercentage(data.avgDiscrepancyPercent, 2)}
            </p>
          </div>

          {/* Breakdown table (when filtered) */}
          {data.breakdown && data.breakdown.length > 0 && (
            <div className="border-t pt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Group</TableHead>
                    <TableHead className="text-xs text-right">Slips</TableHead>
                    <TableHead className="text-xs text-right">
                      Discrepant
                    </TableHead>
                    <TableHead className="text-xs text-right">Rate</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.breakdown.map((row) => (
                    <TableRow key={row.groupName}>
                      <TableCell className="text-xs font-medium">
                        {row.groupName}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono tabular-nums">
                        {formatNumber(row.slipCount)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono tabular-nums">
                        {formatNumber(row.discrepantCount)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono tabular-nums">
                        {formatPercentage(row.discrepancyRate, 1)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono tabular-nums">
                        {formatCents(row.totalDiscrepancyCents)}
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

/**
 * Table Metrics Table
 *
 * Displays per-table shift metrics in a detailed data table.
 * Part of the Casino → Pit → Table lens navigation.
 *
 * @see ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md §3.6
 */

'use client';

import { AlertTriangleIcon, CheckCircleIcon, InfoIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ShiftTableMetricsDTO } from '@/services/table-context/shift-metrics/dtos';

export interface TableMetricsTableProps {
  data: ShiftTableMetricsDTO[] | undefined;
  isLoading?: boolean;
  pitFilter?: string;
}

/**
 * Format cents to currency string.
 */
function formatCurrency(cents: number | null | undefined): string {
  if (cents == null) return '—';
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

/**
 * Skeleton rows for loading state.
 */
function TableSkeleton() {
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-12" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

/**
 * Telemetry quality badge.
 */
function TelemetryBadge({
  quality,
}: {
  quality: 'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE';
}) {
  switch (quality) {
    case 'GOOD_COVERAGE':
      return (
        <Badge className="bg-emerald-500/10 text-emerald-500 text-[10px]">
          Good
        </Badge>
      );
    case 'LOW_COVERAGE':
      return (
        <Badge className="bg-amber-500/10 text-amber-500 text-[10px]">
          Low
        </Badge>
      );
    case 'NONE':
      return (
        <Badge className="bg-muted text-muted-foreground text-[10px]">
          None
        </Badge>
      );
  }
}

/**
 * Metric grade badge.
 */
function GradeBadge({ grade }: { grade: 'ESTIMATE' | 'AUTHORITATIVE' }) {
  if (grade === 'AUTHORITATIVE') {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-500 text-[10px]">
        <CheckCircleIcon className="mr-1 h-3 w-3" />
        Auth
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/10 text-amber-500 text-[10px]">Est</Badge>
  );
}

/**
 * Exception indicator for missing snapshots.
 */
function ExceptionIndicator({
  missingOpening,
  missingClosing,
}: {
  missingOpening: boolean;
  missingClosing: boolean;
}) {
  if (!missingOpening && !missingClosing) {
    return null;
  }

  const messages = [];
  if (missingOpening) messages.push('Missing opening snapshot');
  if (missingClosing) messages.push('Missing closing snapshot');

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertTriangleIcon className="h-4 w-4 text-amber-500 inline ml-1" />
        </TooltipTrigger>
        <TooltipContent>
          <ul className="text-xs">
            {messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function TableMetricsTable({
  data,
  isLoading,
  pitFilter,
}: TableMetricsTableProps) {
  // Apply pit filter if provided
  const filteredData = pitFilter
    ? data?.filter((t) => t.pit_id === pitFilter)
    : data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium">Table Metrics</CardTitle>
          {pitFilter && (
            <Badge variant="outline" className="text-[10px]">
              Pit: {pitFilter}
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {filteredData?.length ?? 0} tables
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Table</TableHead>
                <TableHead className="text-xs">Pit</TableHead>
                <TableHead className="text-xs text-right">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1 ml-auto">
                        Opening
                        <InfoIcon className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          Opening bankroll from snapshot
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead className="text-xs text-right">Closing</TableHead>
                <TableHead className="text-xs text-right">Fills</TableHead>
                <TableHead className="text-xs text-right">Credits</TableHead>
                <TableHead className="text-xs text-right">Win/Loss</TableHead>
                <TableHead className="text-xs text-center">Quality</TableHead>
                <TableHead className="text-xs text-center">Grade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton />
              ) : !filteredData || filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    <p className="text-sm text-muted-foreground">
                      {pitFilter
                        ? `No tables in pit ${pitFilter}`
                        : 'No table data'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((table) => (
                  <TableRow key={table.table_id}>
                    <TableCell>
                      <div className="flex items-center">
                        <span className="font-medium">{table.table_label}</span>
                        <ExceptionIndicator
                          missingOpening={table.missing_opening_snapshot}
                          missingClosing={table.missing_closing_snapshot}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {table.pit_id ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatCurrency(table.opening_bankroll_total_cents)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatCurrency(table.closing_bankroll_total_cents)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatCurrency(table.fills_total_cents)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatCurrency(table.credits_total_cents)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {table.metric_grade === 'AUTHORITATIVE'
                        ? formatCurrency(table.win_loss_inventory_cents)
                        : formatCurrency(table.win_loss_estimated_cents)}
                    </TableCell>
                    <TableCell className="text-center">
                      <TelemetryBadge quality={table.telemetry_quality} />
                    </TableCell>
                    <TableCell className="text-center">
                      <GradeBadge grade={table.metric_grade} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * MTL Gaming Day Summary Component
 *
 * Displays the COMPLIANCE AUTHORITY surface - aggregates per patron per gaming day.
 * This is the authoritative compliance trigger view per 31 CFR § 1021.311.
 *
 * Features:
 * - Per-patron daily aggregates
 * - Tier 2 aggregate badges (agg_badge_in, agg_badge_out)
 * - Separate cash-in and cash-out totals
 * - Click to drill down to entries
 * - CTR highlight when threshold exceeded
 *
 * @see hooks/mtl/use-gaming-day-summary.ts - Data fetching
 * @see services/mtl/dtos.ts - DTOs
 * @see PRD-005 MTL Service
 */

'use client';

import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Loader2,
  User,
} from 'lucide-react';
import { useCallback } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGamingDaySummary } from '@/hooks/mtl/use-gaming-day-summary';
import { cn } from '@/lib/utils';
import type { MtlGamingDaySummaryDTO } from '@/services/mtl/dtos';

import { AggBadgePair } from './agg-badge';

export interface GamingDaySummaryProps {
  /** Casino ID (required) */
  casinoId: string;
  /** Gaming day to display (required) */
  gamingDay: string;
  /** Callback when row is clicked (drilldown to entries) */
  onPatronClick?: (summary: MtlGamingDaySummaryDTO) => void;
  /** Number of items per page */
  pageSize?: number;
  className?: string;
}

/**
 * Format currency for display
 * @param amountCents - Amount in cents (from database)
 * @returns Formatted currency string in dollars
 */
function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountCents / 100); // Convert cents to dollars
}

/**
 * Gaming Day Summary Table
 *
 * @example
 * // Basic usage
 * <GamingDaySummary
 *   casinoId={casinoId}
 *   gamingDay="2026-01-03"
 * />
 *
 * @example
 * // With drilldown
 * <GamingDaySummary
 *   casinoId={casinoId}
 *   gamingDay={selectedDay}
 *   onPatronClick={(summary) => {
 *     setSelectedPatron(summary.patron_uuid);
 *   }}
 * />
 */
export function GamingDaySummary({
  casinoId,
  gamingDay,
  onPatronClick,
  pageSize = 20,
  className,
}: GamingDaySummaryProps) {
  const { data, isLoading, isFetching, error, refetch } = useGamingDaySummary({
    casinoId,
    gamingDay,
    limit: pageSize,
  });

  const handleRowClick = useCallback(
    (summary: MtlGamingDaySummaryDTO) => {
      onPatronClick?.(summary);
    },
    [onPatronClick],
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('space-y-2', className)}>
        <GamingDaySummarySkeleton rows={5} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className={cn(
          'rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center',
          className,
        )}
      >
        <p className="text-sm text-destructive">
          Failed to load summary: {error.message}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="mt-2"
        >
          Retry
        </Button>
      </div>
    );
  }

  const summaries = data?.items ?? [];

  // Empty state
  if (summaries.length === 0) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed p-8 text-center',
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">
          No transactions recorded for {gamingDay}
        </p>
      </div>
    );
  }

  // MTL count: Every patron in the list has an MTL-eligible transaction (>= $3k single transaction)
  // This is the primary metric for this compliance view
  const mtlPatronCount = summaries.length;

  // CTR count: Patrons with aggregate totals > $10k (federal reporting requirement)
  const ctrInCount = summaries.filter(
    (s) => s.agg_badge_in === 'agg_ctr_met',
  ).length;
  const ctrOutCount = summaries.filter(
    (s) => s.agg_badge_out === 'agg_ctr_met',
  ).length;
  const totalCtr = ctrInCount + ctrOutCount;

  return (
    <div className={cn('space-y-2', className)}>
      {/* MTL Summary Banner - Always shown when patrons exist */}
      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50 p-3 flex items-center gap-3">
        <Badge
          variant="outline"
          className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 text-xs px-2 py-0.5 shrink-0"
        >
          MTL
        </Badge>
        <div className="text-sm">
          <span className="font-semibold text-amber-700 dark:text-amber-300">
            {mtlPatronCount} Patron{mtlPatronCount !== 1 ? 's' : ''} with MTL
            Threshold Met
          </span>
          <span className="text-amber-600 dark:text-amber-400 ml-2">
            (single transaction &ge; $3,000)
          </span>
        </div>
      </div>

      {/* CTR Alert Banner - Only shown when CTR threshold exceeded */}
      {totalCtr > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/50 p-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
          <div className="text-sm">
            <span className="font-semibold text-red-700 dark:text-red-300">
              {totalCtr} CTR Trigger{totalCtr !== 1 ? 's' : ''}
            </span>
            <span className="text-red-600 dark:text-red-400 ml-2">
              ({ctrInCount} cash-in, {ctrOutCount} cash-out exceed $10,000
              aggregate)
            </span>
          </div>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patron</TableHead>
              <TableHead className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <ArrowDownLeft className="h-4 w-4 text-green-600" />
                  Cash In
                </div>
              </TableHead>
              <TableHead className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <ArrowUpRight className="h-4 w-4 text-red-600" />
                  Cash Out
                </div>
              </TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Entries</TableHead>
              {onPatronClick && <TableHead className="w-[40px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {summaries.map((summary) => {
              const hasCtrMet =
                summary.agg_badge_in === 'agg_ctr_met' ||
                summary.agg_badge_out === 'agg_ctr_met';

              return (
                <TableRow
                  key={`${summary.patron_uuid}-${summary.gaming_day}`}
                  className={cn(
                    onPatronClick && 'cursor-pointer hover:bg-accent/50',
                    hasCtrMet && 'bg-red-50/50 dark:bg-red-950/20',
                  )}
                  onClick={() => handleRowClick(summary)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium truncate max-w-[150px]">
                          {summary.patron_first_name && summary.patron_last_name
                            ? `${summary.patron_first_name} ${summary.patron_last_name}`
                            : 'Unknown Player'}
                        </span>
                        {summary.patron_date_of_birth && (
                          <span className="text-xs text-muted-foreground">
                            DOB:{' '}
                            {format(
                              new Date(summary.patron_date_of_birth),
                              'MM/dd/yyyy',
                            )}
                          </span>
                        )}
                        <span className="font-mono text-xs text-muted-foreground">
                          {summary.patron_uuid.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="space-y-0.5">
                      <div
                        className={cn(
                          'font-mono tabular-nums font-medium',
                          'text-green-600 dark:text-green-400',
                        )}
                      >
                        {formatCurrency(summary.total_in)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {summary.count_in} txn
                        {summary.count_in !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="space-y-0.5">
                      <div
                        className={cn(
                          'font-mono tabular-nums font-medium',
                          'text-red-600 dark:text-red-400',
                        )}
                      >
                        {formatCurrency(summary.total_out)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {summary.count_out} txn
                        {summary.count_out !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-center gap-1">
                      <Badge
                        variant="outline"
                        className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 text-[10px] px-1.5 py-0"
                      >
                        MTL
                      </Badge>
                      <AggBadgePair
                        badgeIn={summary.agg_badge_in}
                        badgeOut={summary.agg_badge_out}
                        size="sm"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {summary.entry_count}
                  </TableCell>
                  {onPatronClick && (
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Load More / Pagination */}
      {data?.next_cursor && (
        <div className="flex justify-center pt-2">
          <Button variant="ghost" size="sm" disabled={isFetching}>
            {isFetching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      )}

      {/* Fetching indicator */}
      {isFetching && !isLoading && (
        <div className="flex justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

/**
 * Skeleton loader for gaming day summary
 */
function GamingDaySummarySkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Patron</TableHead>
            <TableHead className="text-right">Cash In</TableHead>
            <TableHead className="text-right">Cash Out</TableHead>
            <TableHead className="text-center">Badges</TableHead>
            <TableHead className="text-right">Entries</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-4 w-16" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-4 w-16" />
              </TableCell>
              <TableCell className="text-center">
                <Skeleton className="mx-auto h-5 w-20" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-4 w-8" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export { GamingDaySummarySkeleton };

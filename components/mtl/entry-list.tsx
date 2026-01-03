/**
 * MTL Entry List Component
 *
 * Displays a paginated table of MTL entries with entry badges.
 * Used by pit boss and admin to view AML/CTR transaction history.
 *
 * Features:
 * - Entry badge (Tier 1) per row
 * - Cursor-based pagination
 * - Click-to-detail navigation
 * - Responsive design
 *
 * @see hooks/mtl/use-mtl-entries.ts - Data fetching
 * @see services/mtl/dtos.ts - DTOs
 * @see PRD-005 MTL Service
 */

"use client";

import { format } from "date-fns";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMtlEntries } from "@/hooks/mtl/use-mtl-entries";
import { cn } from "@/lib/utils";
import type { MtlEntryDTO, MtlEntryFilters } from "@/services/mtl/dtos";

import { EntryBadge } from "./entry-badge";

export interface EntryListProps {
  /** Casino ID (required) */
  casinoId: string;
  /** Optional patron filter */
  patronId?: string;
  /** Optional gaming day filter */
  gamingDay?: string;
  /** Callback when entry row is clicked */
  onEntryClick?: (entry: MtlEntryDTO) => void;
  /** Number of items per page */
  pageSize?: number;
  className?: string;
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format datetime for display
 */
function formatDateTime(isoString: string): string {
  return format(new Date(isoString), "MMM d, h:mm a");
}

/**
 * Transaction type display labels
 */
const TXN_TYPE_LABELS: Record<string, string> = {
  buy_in: "Buy-in",
  cash_out: "Cash Out",
  marker: "Marker",
  front_money: "Front Money",
  chip_fill: "Chip Fill",
};

/**
 * Source display labels
 */
const SOURCE_LABELS: Record<string, string> = {
  table: "Table",
  cage: "Cage",
  kiosk: "Kiosk",
  other: "Other",
};

/**
 * MTL Entry List Table
 *
 * @example
 * // Basic usage
 * <EntryList casinoId={casinoId} />
 *
 * @example
 * // With filters and click handler
 * <EntryList
 *   casinoId={casinoId}
 *   patronId={playerId}
 *   gamingDay="2026-01-03"
 *   onEntryClick={(entry) => setSelectedEntry(entry.id)}
 * />
 */
export function EntryList({
  casinoId,
  patronId,
  gamingDay,
  onEntryClick,
  pageSize = 20,
  className,
}: EntryListProps) {
  const { data, isLoading, isFetching, error, refetch } = useMtlEntries({
    casinoId,
    patronId,
    gamingDay,
    limit: pageSize,
  });

  const handleRowClick = useCallback(
    (entry: MtlEntryDTO) => {
      onEntryClick?.(entry);
    },
    [onEntryClick],
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        <EntryListSkeleton rows={5} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className={cn(
          "rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center",
          className,
        )}
      >
        <p className="text-sm text-destructive">
          Failed to load entries: {error.message}
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

  const entries = data?.items ?? [];

  // Empty state
  if (entries.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed p-8 text-center",
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">
          No entries found
          {gamingDay && ` for ${gamingDay}`}
          {patronId && ` for this patron`}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Time</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-[80px]">Badge</TableHead>
              {onEntryClick && <TableHead className="w-[40px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow
                key={entry.id}
                className={cn(
                  onEntryClick && "cursor-pointer hover:bg-accent/50",
                )}
                onClick={() => handleRowClick(entry)}
              >
                <TableCell className="font-mono text-xs">
                  {formatDateTime(entry.occurred_at)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {entry.direction === "in" ? (
                      <ArrowDownLeft className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-red-600 dark:text-red-400" />
                    )}
                    <span className="text-sm">
                      {TXN_TYPE_LABELS[entry.txn_type] ?? entry.txn_type}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {SOURCE_LABELS[entry.source] ?? entry.source}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono tabular-nums",
                    entry.direction === "in"
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400",
                  )}
                >
                  {entry.direction === "in" ? "+" : "-"}
                  {formatCurrency(entry.amount)}
                </TableCell>
                <TableCell>
                  <EntryBadge badge={entry.entry_badge} size="sm" />
                </TableCell>
                {onEntryClick && (
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination / Load More indicator */}
      {data?.next_cursor && (
        <div className="flex justify-center pt-2">
          <Button variant="ghost" size="sm" disabled={isFetching}>
            {isFetching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Load More"
            )}
          </Button>
        </div>
      )}

      {/* Fetching indicator for background refetch */}
      {isFetching && !isLoading && (
        <div className="flex justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

/**
 * Skeleton loader for entry list
 */
function EntryListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Time</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="w-[80px]">Badge</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-12" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-4 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-12" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export { EntryListSkeleton };

/**
 * Pit Metrics Table
 *
 * Displays pit-level aggregated metrics in a data table.
 * Part of the Casino → Pit → Table lens navigation.
 *
 * @see ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md §3.6
 */

"use client";

import { ChevronRightIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ShiftPitMetricsDTO } from "@/services/table-context/shift-metrics/dtos";

export interface PitMetricsTableProps {
  data: ShiftPitMetricsDTO[] | undefined;
  isLoading?: boolean;
  onPitSelect?: (pitId: string) => void;
}

/**
 * Format cents to currency string.
 */
function formatCurrency(cents: number | null | undefined): string {
  if (cents == null) return "$0";
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
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
      {[1, 2, 3].map((i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-8" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
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
            <Skeleton className="h-6 w-6" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

/**
 * Coverage badge based on tables with good coverage.
 */
function CoverageBadge({
  goodCoverage,
  totalTables,
}: {
  goodCoverage: number;
  totalTables: number;
}) {
  const percentage =
    totalTables > 0 ? Math.round((goodCoverage / totalTables) * 100) : 0;

  if (percentage >= 80) {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-500 text-[10px]">
        {percentage}%
      </Badge>
    );
  } else if (percentage >= 50) {
    return (
      <Badge className="bg-amber-500/10 text-amber-500 text-[10px]">
        {percentage}%
      </Badge>
    );
  } else {
    return (
      <Badge className="bg-red-500/10 text-red-500 text-[10px]">
        {percentage}%
      </Badge>
    );
  }
}

export function PitMetricsTable({
  data,
  isLoading,
  onPitSelect,
}: PitMetricsTableProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Pit Metrics</CardTitle>
        <span className="text-xs text-muted-foreground">
          {data?.length ?? 0} pits
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Pit</TableHead>
              <TableHead className="text-xs text-center">Tables</TableHead>
              <TableHead className="text-xs text-right">
                Win/Loss (Inv)
              </TableHead>
              <TableHead className="text-xs text-right">
                Win/Loss (Est)
              </TableHead>
              <TableHead className="text-xs text-right">Fills</TableHead>
              <TableHead className="text-xs text-right">Credits</TableHead>
              <TableHead className="text-xs text-center">Coverage</TableHead>
              <TableHead className="text-xs w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : !data || data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <p className="text-sm text-muted-foreground">No pit data</p>
                </TableCell>
              </TableRow>
            ) : (
              data.map((pit) => (
                <TableRow
                  key={pit.pit_id}
                  className="group cursor-pointer hover:bg-muted/50"
                  onClick={() => onPitSelect?.(pit.pit_id)}
                >
                  <TableCell>
                    <span className="font-medium">{pit.pit_id}</span>
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs">
                    {pit.tables_count}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {formatCurrency(pit.win_loss_inventory_total_cents)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {formatCurrency(pit.win_loss_estimated_total_cents)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {formatCurrency(pit.fills_total_cents)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {formatCurrency(pit.credits_total_cents)}
                  </TableCell>
                  <TableCell className="text-center">
                    <CoverageBadge
                      goodCoverage={pit.tables_good_coverage_count}
                      totalTables={pit.tables_count}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      aria-label={`View details for pit ${pit.pit_id}`}
                    >
                      <ChevronRightIcon className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

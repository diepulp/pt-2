/**
 * Metrics Table
 *
 * Combined pit/table metrics view with tabs and drill-down capability.
 * Simplified columns focused on essentials with visual quality indicators.
 *
 * @see IMPLEMENTATION_STRATEGY.md §3.2 Zone E
 */

'use client';

import { ChevronRightIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PitTable } from '@/components/shift-dashboard-v3/center/pit-table';
import {
  MetricGradeBadge,
  TelemetryQualityIndicator,
} from '@/components/shift-dashboard-v3/trust';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCents } from '@/lib/format';
import type {
  ShiftPitMetricsDTO,
  ShiftTableMetricsDTO,
} from '@/services/table-context/shift-metrics/dtos';

export interface MetricsTableProps {
  /** Casino summary (optional) for tab display */
  casinoData?: {
    pits_count: number;
    tables_count: number;
  };
  /** Pit metrics data */
  pitsData: ShiftPitMetricsDTO[] | undefined;
  /** Table metrics data */
  tablesData: ShiftTableMetricsDTO[] | undefined;
  /** Loading state */
  isLoading?: boolean;
  /** Callback when drilling down to a pit */
  onPitSelect?: (pitId: string) => void;
  /** Callback when drilling down to a table */
  onTableSelect?: (tableId: string, pitId: string | null) => void;
}

/**
 * Status badge for table status.
 */
function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        isActive
          ? 'border-emerald-500/50 text-emerald-500 text-[10px]'
          : 'border-slate-500/50 text-slate-500 text-[10px]'
      }
    >
      {isActive ? 'Active' : 'Inactive'}
    </Badge>
  );
}

/**
 * Table metrics row.
 */
function TableRow({
  table,
  onSelect,
}: {
  table: ShiftTableMetricsDTO;
  onSelect?: () => void;
}) {
  const isActive =
    !table.missing_opening_snapshot || !table.missing_closing_snapshot;

  return (
    <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors">
      <td className="py-3 px-4">
        <button
          type="button"
          onClick={onSelect}
          className="flex items-center gap-2 font-mono text-sm hover:text-emerald-500 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
        >
          {table.table_label}
          <ChevronRightIcon className="h-3 w-3" />
        </button>
      </td>
      <td className="py-3 px-4 text-right font-mono tabular-nums">
        {formatCents(table.win_loss_estimated_cents)}
      </td>
      <td className="py-3 px-4 text-right font-mono tabular-nums">
        {formatCents(table.fills_total_cents)}
      </td>
      <td className="py-3 px-4 text-right font-mono tabular-nums">
        {formatCents(table.credits_total_cents)}
      </td>
      <td className="py-3 px-4 text-center">
        <TelemetryQualityIndicator
          quality={table.telemetry_quality}
          showLabel
        />
      </td>
      <td className="py-3 px-4 text-center">
        <MetricGradeBadge grade={table.metric_grade} size="sm" />
      </td>
      <td className="py-3 px-4 text-right">
        <StatusBadge isActive={isActive} />
      </td>
    </tr>
  );
}

/**
 * Loading skeleton for table.
 */
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex gap-4 py-3 px-4">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20 ml-auto" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function MetricsTable({
  casinoData,
  pitsData,
  tablesData,
  isLoading,
  onPitSelect,
  onTableSelect,
}: MetricsTableProps) {
  const [activeTab, setActiveTab] = useState<'casino' | 'pit' | 'table'>(
    'casino',
  );
  const [selectedPitId, setSelectedPitId] = useState<string | null>(null);

  const handlePitSelect = (pitId: string) => {
    setSelectedPitId(pitId);
    setActiveTab('table');
    onPitSelect?.(pitId);
  };

  const handleBackToCasino = () => {
    setSelectedPitId(null);
    setActiveTab('casino');
  };

  // Filter tables by selected pit (memoized to avoid re-filtering on re-render)
  const filteredTables = useMemo(
    () =>
      selectedPitId
        ? tablesData?.filter((t) => t.pit_id === selectedPitId)
        : tablesData,
    [tablesData, selectedPitId],
  );

  return (
    <Card className="overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'casino' | 'pit' | 'table')}
      >
        {/* Tab header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <TabsList className="bg-transparent h-auto p-0 gap-1">
            <TabsTrigger
              value="casino"
              className="data-[state=active]:bg-muted px-3 py-1.5 text-xs"
            >
              Casino
              {casinoData && (
                <span className="ml-1 text-muted-foreground">
                  ({casinoData.pits_count})
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="pit"
              className="data-[state=active]:bg-muted px-3 py-1.5 text-xs"
            >
              By Pit
            </TabsTrigger>
            <TabsTrigger
              value="table"
              className="data-[state=active]:bg-muted px-3 py-1.5 text-xs"
            >
              By Table
              {selectedPitId && (
                <span className="ml-1 text-muted-foreground">
                  ({selectedPitId})
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {selectedPitId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToCasino}
              className="text-xs h-auto py-1"
            >
              ← All Pits
            </Button>
          )}
        </div>

        {/* Casino view (shows pits) */}
        <TabsContent value="casino" className="m-0">
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <PitTable
              pitsData={pitsData}
              onPitSelect={handlePitSelect}
              caption="Casino pit metrics overview"
            />
          )}
        </TabsContent>

        {/* Pit view (same as casino) */}
        <TabsContent value="pit" className="m-0">
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <PitTable
              pitsData={pitsData}
              onPitSelect={handlePitSelect}
              caption="Pit-level metrics breakdown"
            />
          )}
        </TabsContent>

        {/* Table view */}
        <TabsContent value="table" className="m-0">
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <caption className="sr-only">
                  Table-level metrics
                  {selectedPitId ? ` for pit ${selectedPitId}` : ''}
                </caption>
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th
                      scope="col"
                      className="py-2 px-4 text-left text-xs font-medium text-muted-foreground"
                    >
                      Table
                    </th>
                    <th
                      scope="col"
                      className="py-2 px-4 text-right text-xs font-medium text-muted-foreground"
                    >
                      Win/Loss
                    </th>
                    <th
                      scope="col"
                      className="py-2 px-4 text-right text-xs font-medium text-muted-foreground"
                    >
                      Fills
                    </th>
                    <th
                      scope="col"
                      className="py-2 px-4 text-right text-xs font-medium text-muted-foreground"
                    >
                      Credits
                    </th>
                    <th
                      scope="col"
                      className="py-2 px-4 text-center text-xs font-medium text-muted-foreground"
                    >
                      Quality
                    </th>
                    <th
                      scope="col"
                      className="py-2 px-4 text-center text-xs font-medium text-muted-foreground"
                    >
                      Grade
                    </th>
                    <th
                      scope="col"
                      className="py-2 px-4 text-right text-xs font-medium text-muted-foreground"
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTables?.map((table) => (
                    <TableRow
                      key={table.table_id}
                      table={table}
                      onSelect={() =>
                        onTableSelect?.(table.table_id, table.pit_id)
                      }
                    />
                  ))}
                  {(!filteredTables || filteredTables.length === 0) && (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No table data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}

/**
 * Pit Table
 *
 * Reusable pit metrics table used by MetricsTable in both
 * "casino" and "pit" tab views.
 *
 * @see IMPLEMENTATION_STRATEGY.md §3.2 Zone E
 */

'use client';

import { ChevronRightIcon } from 'lucide-react';

import { CoverageBar } from '@/components/shift-dashboard-v3/trust';
import { formatCents } from '@/lib/format';
import type { ShiftPitMetricsDTO } from '@/services/table-context/shift-metrics/dtos';

export interface PitTableProps {
  /** Pit metrics data */
  pitsData: ShiftPitMetricsDTO[] | undefined;
  /** Callback when drilling down to a pit */
  onPitSelect?: (pitId: string) => void;
  /** Table caption for accessibility */
  caption: string;
}

/**
 * Pit metrics row.
 */
function PitRow({
  pit,
  onSelect,
}: {
  pit: ShiftPitMetricsDTO;
  onSelect?: () => void;
}) {
  return (
    <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors">
      <td className="py-3 px-4">
        <button
          type="button"
          onClick={onSelect}
          className="flex items-center gap-2 font-mono text-sm hover:text-emerald-500 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
        >
          {pit.pit_id}
          <ChevronRightIcon className="h-3 w-3" />
        </button>
      </td>
      <td className="py-3 px-4 text-right font-mono tabular-nums">
        {formatCents(pit.win_loss_estimated_total_cents)}
      </td>
      <td className="py-3 px-4 text-right font-mono tabular-nums">
        {formatCents(pit.fills_total_cents)}
      </td>
      <td className="py-3 px-4 text-right font-mono tabular-nums">
        {formatCents(pit.credits_total_cents)}
      </td>
      <td className="py-3 px-4">
        <CoverageBar
          ratio={pit.snapshot_coverage_ratio}
          tier={pit.coverage_tier}
          size="sm"
        />
      </td>
      <td className="py-3 px-4 text-right">
        <span className="text-xs text-muted-foreground">
          {pit.tables_count} tables
        </span>
      </td>
    </tr>
  );
}

export function PitTable({ pitsData, onPitSelect, caption }: PitTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th
              scope="col"
              className="py-2 px-4 text-left text-xs font-medium text-muted-foreground"
            >
              Pit
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
              Coverage
            </th>
            <th
              scope="col"
              className="py-2 px-4 text-right text-xs font-medium text-muted-foreground"
            >
              Tables
            </th>
          </tr>
        </thead>
        <tbody>
          {pitsData?.map((pit) => (
            <PitRow
              key={pit.pit_id}
              pit={pit}
              onSelect={() => onPitSelect?.(pit.pit_id)}
            />
          ))}
          {(!pitsData || pitsData.length === 0) && (
            <tr>
              <td
                colSpan={6}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                No pit data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

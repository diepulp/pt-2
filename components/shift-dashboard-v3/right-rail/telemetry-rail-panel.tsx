'use client';

import { ChevronDownIcon, ChevronRightIcon, EyeIcon } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/format';
import type {
  CashObsCasinoRollupDTO,
  CashObsPitRollupDTO,
  CashObsTableRollupDTO,
} from '@/services/table-context/dtos';

export interface TelemetryRailPanelProps {
  casinoData: CashObsCasinoRollupDTO | undefined;
  pitsData: CashObsPitRollupDTO[] | undefined;
  tablesData: CashObsTableRollupDTO[] | undefined;
  isLoading?: boolean;
}

/**
 * Rail-native telemetry panel. Always visible when right rail is expanded.
 * Casino totals always shown, pit breakdown collapsible, top 5 tables.
 */
export function TelemetryRailPanel({
  casinoData,
  pitsData,
  tablesData,
  isLoading,
}: TelemetryRailPanelProps) {
  const [isPitsExpanded, setIsPitsExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3 border-dashed border-amber-500/30 bg-amber-50/5 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const hasData = casinoData || pitsData?.length || tablesData?.length;

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-amber-500/30 bg-amber-50/5 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <EyeIcon className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs font-medium">Telemetry</span>
        <Badge
          variant="outline"
          className="border-amber-500/50 text-amber-600 text-[9px] px-1.5 py-0"
        >
          TELEMETRY
        </Badge>
      </div>

      {!hasData ? (
        <p className="text-xs text-muted-foreground text-center py-2">
          No observations
        </p>
      ) : (
        <>
          {/* Casino Totals (always shown) */}
          {casinoData && (
            <div className="rounded bg-muted/30 p-2 space-y-1.5">
              <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                Casino Totals
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[9px] text-muted-foreground">Estimated</p>
                  <p className="font-mono tabular-nums text-amber-500">
                    {formatCurrency(
                      casinoData.cash_out_observed_estimate_total,
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground">Confirmed</p>
                  <p className="font-mono tabular-nums">
                    {formatCurrency(
                      casinoData.cash_out_observed_confirmed_total,
                    )}
                  </p>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground">
                {casinoData.cash_out_observation_count} observations
              </p>
            </div>
          )}

          {/* Pit Breakdown (collapsible accordion) */}
          {pitsData && pitsData.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setIsPitsExpanded(!isPitsExpanded)}
                className="flex w-full items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
              >
                {isPitsExpanded ? (
                  <ChevronDownIcon className="h-3 w-3" />
                ) : (
                  <ChevronRightIcon className="h-3 w-3" />
                )}
                By Pit ({pitsData.length})
              </button>
              {isPitsExpanded && (
                <div className="mt-1.5 space-y-1">
                  {pitsData.map((pit) => (
                    <div
                      key={pit.pit}
                      className="flex items-center justify-between rounded bg-muted/20 px-2 py-1 text-[10px]"
                    >
                      <span className="font-mono">{pit.pit}</span>
                      <span className="font-mono text-amber-500">
                        {formatCurrency(pit.cash_out_observed_estimate_total)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Top 5 Tables */}
          {tablesData && tablesData.length > 0 && (
            <div>
              <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                Top Tables
              </p>
              <div className="mt-1 space-y-0.5">
                {[...tablesData]
                  .sort(
                    (a, b) =>
                      b.cash_out_observation_count -
                      a.cash_out_observation_count,
                  )
                  .slice(0, 5)
                  .map((table) => (
                    <div
                      key={table.table_id}
                      className="flex items-center justify-between px-1 py-0.5 text-[10px]"
                    >
                      <span className="font-mono">{table.table_label}</span>
                      <span className="font-mono text-amber-500">
                        {table.cash_out_observation_count} obs
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

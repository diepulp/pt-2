/**
 * Telemetry Drawer
 *
 * Collapsible section for advanced cash observations data.
 * Progressive disclosure per Nielsen's Heuristic #3 (User Control).
 *
 * @see IMPLEMENTATION_STRATEGY.md §3.2 Zone F
 */

"use client";

import { ChevronDownIcon, ChevronUpIcon, EyeIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  CashObsCasinoRollupDTO,
  CashObsPitRollupDTO,
  CashObsTableRollupDTO,
} from "@/services/table-context/dtos";

import { formatCurrency } from "../lib/format";

export interface TelemetryDrawerProps {
  /** Casino-level cash observations */
  casinoData: CashObsCasinoRollupDTO | undefined;
  /** Pit-level cash observations */
  pitsData: CashObsPitRollupDTO[] | undefined;
  /** Table-level cash observations */
  tablesData: CashObsTableRollupDTO[] | undefined;
  /** Loading state */
  isLoading?: boolean;
  /** Default expanded state */
  defaultExpanded?: boolean;
}

export function TelemetryDrawer({
  casinoData,
  pitsData,
  tablesData,
  isLoading,
  defaultExpanded = false,
}: TelemetryDrawerProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (isLoading) {
    return (
      <Card className="p-4 border-dashed border-amber-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-36" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      </Card>
    );
  }

  const hasData = casinoData || pitsData?.length || tablesData?.length;

  return (
    <Card className="border-dashed border-amber-500/30 bg-amber-50/5">
      {/* Header - always visible */}
      <Button
        variant="ghost"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 h-auto hover:bg-transparent"
      >
        <div className="flex items-center gap-2">
          <EyeIcon className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium">
            Advanced: Telemetry Details
          </span>
          <Badge
            variant="outline"
            className="border-amber-500/50 text-amber-600 text-[10px]"
          >
            TELEMETRY
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {!isExpanded && casinoData && (
            <span className="text-xs text-muted-foreground font-mono">
              {formatCurrency(casinoData.cash_out_observed_estimate_total)}{" "}
              observed
            </span>
          )}
          {isExpanded ? (
            <ChevronUpIcon className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </Button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {!hasData ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No telemetry observations in this time window
            </p>
          ) : (
            <>
              {/* Casino Summary */}
              {casinoData && (
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    Casino Totals
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-muted-foreground">
                        Cash Out (Estimated)
                      </p>
                      <p className="font-mono text-sm tabular-nums text-amber-500">
                        {formatCurrency(
                          casinoData.cash_out_observed_estimate_total,
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">
                        Cash Out (Confirmed)
                      </p>
                      <p className="font-mono text-sm tabular-nums">
                        {formatCurrency(
                          casinoData.cash_out_observed_confirmed_total,
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">
                        Observation Count
                      </p>
                      <p className="font-mono text-sm tabular-nums">
                        {casinoData.cash_out_observation_count}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Pit breakdown */}
              {pitsData && pitsData.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    By Pit
                  </p>
                  <div className="space-y-2">
                    {pitsData.map((pit) => (
                      <div
                        key={pit.pit}
                        className="flex items-center justify-between rounded-lg bg-muted/20 px-3 py-2"
                      >
                        <span className="font-mono text-sm">{pit.pit}</span>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-muted-foreground">
                            Est:{" "}
                            <span className="font-mono text-amber-500">
                              {formatCurrency(
                                pit.cash_out_observed_estimate_total,
                              )}
                            </span>
                          </span>
                          <span className="text-muted-foreground">
                            {pit.cash_out_observation_count} obs
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top tables by observations */}
              {tablesData && tablesData.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    Top Tables (by Observations)
                  </p>
                  <div className="space-y-1">
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
                          className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-muted/30"
                        >
                          <span className="font-mono">{table.table_label}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-amber-500 font-mono">
                              {formatCurrency(
                                table.cash_out_observed_estimate_total,
                              )}
                            </span>
                            <span className="text-muted-foreground">
                              {table.cash_out_observation_count} obs
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

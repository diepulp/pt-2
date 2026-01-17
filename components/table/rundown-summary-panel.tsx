"use client";

import { TrendingDown, TrendingUp, Minus, Loader2 } from "lucide-react";
import * as React from "react";

import {
  calculateChipsetTotal,
  useInventorySnapshots,
} from "@/hooks/table-context/use-inventory-snapshots";
import { cn } from "@/lib/utils";

interface RundownSummaryPanelProps {
  tableId: string;
  casinoId: string;
}

interface MetricRowProps {
  label: string;
  value: number | null;
  isLoading?: boolean;
  prefix?: string;
  highlight?: boolean;
  variant?: "positive" | "negative" | "neutral";
}

function MetricRow({
  label,
  value,
  isLoading = false,
  prefix = "$",
  highlight = false,
  variant = "neutral",
}: MetricRowProps) {
  const Icon =
    variant === "positive"
      ? TrendingUp
      : variant === "negative"
        ? TrendingDown
        : Minus;
  const colorClass =
    variant === "positive"
      ? "text-emerald-500"
      : variant === "negative"
        ? "text-red-500"
        : "text-muted-foreground";

  return (
    <div
      className={cn(
        "flex items-center justify-between py-2",
        highlight && "border-t pt-3 mt-1 font-semibold",
      )}
    >
      <span className={cn("text-sm", highlight && "font-medium")}>{label}</span>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : value !== null ? (
        <div className={cn("flex items-center gap-1", highlight && colorClass)}>
          {highlight && variant !== "neutral" && <Icon className="h-4 w-4" />}
          <span className={cn("font-mono", highlight && "text-lg")}>
            {prefix}
            {Math.abs(value).toLocaleString()}
          </span>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}

/**
 * RundownSummaryPanel
 *
 * Displays computed win/loss summary from inventory snapshots.
 * Shows opening, closing, fills, credits, and computed result.
 *
 * @see GAP-TABLE-ROLLOVER-UI WS6
 */
export function RundownSummaryPanel({
  tableId,
  casinoId,
}: RundownSummaryPanelProps) {
  const { data: snapshots = [], isLoading } = useInventorySnapshots(
    tableId,
    casinoId,
    10, // Get last 10 snapshots to find open/close
  );

  // Find the most recent opening and closing snapshots
  const openingSnapshot = React.useMemo(() => {
    return snapshots.find((s) => s.snapshot_type === "open");
  }, [snapshots]);

  const closingSnapshot = React.useMemo(() => {
    return snapshots.find((s) => s.snapshot_type === "close");
  }, [snapshots]);

  // Calculate values
  const openingBankroll = openingSnapshot
    ? calculateChipsetTotal(openingSnapshot.chipset)
    : null;

  const closingBankroll = closingSnapshot
    ? calculateChipsetTotal(closingSnapshot.chipset)
    : null;

  // TODO: Integrate with table_fill and table_credit queries when available
  const totalFills = 0; // Placeholder - will be computed from table_fill table
  const totalCredits = 0; // Placeholder - will be computed from table_credit table

  // Compute win/loss: closing - opening + fills - credits
  // Positive = table win (house won), Negative = table loss (house lost)
  const computedWinLoss = React.useMemo(() => {
    if (openingBankroll === null || closingBankroll === null) {
      return null;
    }
    return closingBankroll - openingBankroll + totalFills - totalCredits;
  }, [openingBankroll, closingBankroll, totalFills, totalCredits]);

  const winLossVariant: "positive" | "negative" | "neutral" =
    computedWinLoss === null
      ? "neutral"
      : computedWinLoss > 0
        ? "positive"
        : computedWinLoss < 0
          ? "negative"
          : "neutral";

  return (
    <div className="rounded-lg border p-4 space-y-1">
      <h3 className="text-sm font-semibold mb-3">Rundown Summary</h3>

      <MetricRow
        label="Opening Bankroll"
        value={openingBankroll}
        isLoading={isLoading}
      />

      <MetricRow
        label="Closing Bankroll"
        value={closingBankroll}
        isLoading={isLoading}
      />

      {(totalFills > 0 || totalCredits > 0) && (
        <>
          <MetricRow label="Total Fills" value={totalFills} prefix="+$" />
          <MetricRow label="Total Credits" value={totalCredits} prefix="-$" />
        </>
      )}

      <MetricRow
        label={
          winLossVariant === "positive"
            ? "Table Win"
            : winLossVariant === "negative"
              ? "Table Loss"
              : "Win/Loss"
        }
        value={computedWinLoss}
        isLoading={isLoading}
        highlight
        variant={winLossVariant}
      />

      {/* Status indicator */}
      {!isLoading && (
        <div className="pt-2 text-xs text-muted-foreground">
          {!openingSnapshot && !closingSnapshot && (
            <span>No inventory snapshots recorded</span>
          )}
          {openingSnapshot && !closingSnapshot && (
            <span>Awaiting closing snapshot</span>
          )}
          {!openingSnapshot && closingSnapshot && (
            <span>Missing opening snapshot</span>
          )}
          {openingSnapshot && closingSnapshot && (
            <span>
              Computed from{" "}
              {new Date(openingSnapshot.created_at).toLocaleTimeString(
                "en-US",
                {
                  hour: "numeric",
                  minute: "2-digit",
                },
              )}{" "}
              →{" "}
              {new Date(closingSnapshot.created_at).toLocaleTimeString(
                "en-US",
                {
                  hour: "numeric",
                  minute: "2-digit",
                },
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { DollarSign, Loader2, Undo2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatCentsToDollars,
  useGrindBuyinTotal,
  useLogGrindBuyin,
  useUndoGrindBuyin,
} from "@/hooks/table-context/use-buyin-telemetry";
import { cn } from "@/lib/utils";

interface GrindBuyinPanelProps {
  tableId: string;
  casinoId: string;
  /** Shift window for totals */
  shiftWindow: { startTs: string; endTs: string };
}

// Quick-tap amounts matching US cash denominations (in cents)
const QUICK_TAP_AMOUNTS = [
  { label: "+$5", cents: 500 },
  { label: "+$10", cents: 1000 },
  { label: "+$20", cents: 2000 },
  { label: "+$50", cents: 5000 },
  { label: "+$100", cents: 10000 },
] as const;

/**
 * GrindBuyinPanel
 *
 * Quick-tap interface for logging anonymous (grind) buy-ins.
 * Designed for fast pit boss input during high-volume periods.
 *
 * @see GAP-TABLE-ROLLOVER-UI WS5
 */
export function GrindBuyinPanel({
  tableId,
  casinoId,
  shiftWindow,
}: GrindBuyinPanelProps) {
  // Custom amount state
  const [customAmount, setCustomAmount] = React.useState("");
  const [lastLoggedAmount, setLastLoggedAmount] = React.useState<number | null>(
    null,
  );

  // Queries and mutations
  const { data: grindTotal, isLoading: isLoadingTotal } = useGrindBuyinTotal(
    tableId,
    casinoId,
    shiftWindow,
  );

  const logMutation = useLogGrindBuyin(tableId, casinoId);
  const undoMutation = useUndoGrindBuyin(tableId, casinoId);

  const handleQuickTap = async (cents: number) => {
    try {
      await logMutation.mutateAsync({ amountCents: cents });
      setLastLoggedAmount(cents);
      toast.success("Buy-in logged", {
        description: formatCentsToDollars(cents),
      });
    } catch (error) {
      toast.error("Failed to log buy-in", {
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
    }
  };

  const handleCustomSubmit = async () => {
    const dollars = parseFloat(customAmount);
    if (isNaN(dollars) || dollars <= 0) {
      toast.error("Invalid amount", {
        description: "Please enter a valid dollar amount",
      });
      return;
    }

    const cents = Math.round(dollars * 100);
    try {
      await logMutation.mutateAsync({ amountCents: cents });
      setLastLoggedAmount(cents);
      setCustomAmount("");
      toast.success("Buy-in logged", {
        description: formatCentsToDollars(cents),
      });
    } catch (error) {
      toast.error("Failed to log buy-in", {
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
    }
  };

  const handleUndo = async () => {
    if (!lastLoggedAmount) return;

    try {
      await undoMutation.mutateAsync(lastLoggedAmount);
      toast.success("Undo successful", {
        description: `Reversed ${formatCentsToDollars(lastLoggedAmount)}`,
      });
      setLastLoggedAmount(null);
    } catch (error) {
      toast.error("Failed to undo", {
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
    }
  };

  const isPending = logMutation.isPending || undoMutation.isPending;

  return (
    <div className="space-y-4 rounded-lg border p-4">
      {/* Header with running total */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Grind Buy-ins</h3>
          <p className="text-xs text-muted-foreground">
            Anonymous cash buy-ins for shift telemetry
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            Shift Total
          </div>
          {isLoadingTotal ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="text-lg font-bold text-accent">
              {formatCentsToDollars(grindTotal?.totalCents ?? 0)}
            </div>
          )}
          {grindTotal && grindTotal.count > 0 && (
            <div className="text-xs text-muted-foreground">
              {grindTotal.count} buy-in{grindTotal.count !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

      {/* Quick-tap buttons */}
      <div className="grid grid-cols-5 gap-2">
        {QUICK_TAP_AMOUNTS.map(({ label, cents }) => (
          <Button
            key={cents}
            variant="outline"
            size="sm"
            className={cn(
              "font-mono font-semibold",
              "hover:bg-accent hover:text-accent-foreground",
            )}
            onClick={() => handleQuickTap(cents)}
            disabled={isPending}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Custom amount input */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <Input
            type="number"
            min="0"
            step="1"
            placeholder="Custom amount"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="pl-7"
            disabled={isPending}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCustomSubmit();
              }
            }}
          />
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={handleCustomSubmit}
          disabled={isPending || !customAmount}
        >
          {logMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <DollarSign className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Undo button (shown when there's a recent action to undo) */}
      {lastLoggedAmount && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={handleUndo}
          disabled={undoMutation.isPending}
        >
          {undoMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Undo2 className="mr-2 h-4 w-4" />
          )}
          Undo last ({formatCentsToDollars(lastLoggedAmount)})
        </Button>
      )}
    </div>
  );
}

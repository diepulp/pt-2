"use client";

import { Calculator, Loader2, Package } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  calculateChipsetTotal,
  createEmptyChipset,
  STANDARD_DENOMINATIONS,
  useLogInventorySnapshot,
  type ChipsetPayload,
  type SnapshotType,
} from "@/hooks/table-context/use-inventory-snapshots";
import { cn } from "@/lib/utils";

interface ChipCountCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  casinoId: string;
  /** Default snapshot type (opening, closing, rundown) */
  defaultSnapshotType?: SnapshotType;
  /** Callback with the created snapshot ID */
  onSuccess?: (snapshotId: string) => void;
}

// Chip colors for visual distinction
const CHIP_COLORS: Record<number, string> = {
  1: "bg-slate-200 text-slate-800 border-slate-300",
  5: "bg-red-500 text-white border-red-600",
  25: "bg-green-500 text-white border-green-600",
  100: "bg-gray-900 text-white border-gray-950",
  500: "bg-purple-600 text-white border-purple-700",
};

/**
 * ChipCountCaptureDialog
 *
 * Modal for capturing chip inventory with denomination breakdown.
 * Used for opening, closing, and mid-shift rundown snapshots.
 *
 * @see GAP-TABLE-ROLLOVER-UI WS1
 */
export function ChipCountCaptureDialog({
  open,
  onOpenChange,
  tableId,
  casinoId,
  defaultSnapshotType = "close",
  onSuccess,
}: ChipCountCaptureDialogProps) {
  // Form state
  const [snapshotType, setSnapshotType] =
    React.useState<SnapshotType>(defaultSnapshotType);
  const [chipset, setChipset] =
    React.useState<ChipsetPayload>(createEmptyChipset);
  const [verifiedBy, setVerifiedBy] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Mutation
  const logMutation = useLogInventorySnapshot(tableId, casinoId);

  // Computed total
  const total = calculateChipsetTotal(chipset);

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setSnapshotType(defaultSnapshotType);
      setChipset(createEmptyChipset());
      setVerifiedBy("");
      setNotes("");
    }
  }, [open, defaultSnapshotType]);

  const handleQuantityChange = (denom: number, value: string) => {
    const qty = value === "" ? 0 : parseInt(value, 10);
    if (!isNaN(qty) && qty >= 0) {
      setChipset((prev) => ({
        ...prev,
        [String(denom)]: qty,
      }));
    }
  };

  const handleQuickIncrement = (denom: number, amount: number) => {
    setChipset((prev) => ({
      ...prev,
      [String(denom)]: Math.max(0, (prev[String(denom)] ?? 0) + amount),
    }));
  };

  const handleSubmit = async () => {
    try {
      const result = await logMutation.mutateAsync({
        snapshotType,
        chipset,
        verifiedBy: verifiedBy.trim() || undefined,
        note: notes.trim() || undefined,
      });

      toast.success("Chip count recorded", {
        description: `${snapshotType.charAt(0).toUpperCase() + snapshotType.slice(1)} snapshot saved: $${total.toLocaleString()}`,
      });

      onSuccess?.(result.id);
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to record chip count", {
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="size-5 text-accent" />
            Chip Count
          </DialogTitle>
          <DialogDescription>
            Record the chip inventory for this table. Enter the quantity for
            each denomination.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Snapshot Type Selector */}
          <div className="space-y-2">
            <Label htmlFor="snapshot-type">Snapshot Type</Label>
            <Select
              value={snapshotType}
              onValueChange={(v) => setSnapshotType(v as SnapshotType)}
            >
              <SelectTrigger id="snapshot-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Opening</SelectItem>
                <SelectItem value="close">Closing</SelectItem>
                <SelectItem value="rundown">Rundown</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Denomination Grid */}
          <div className="space-y-3">
            <Label>Chip Counts</Label>
            <div className="grid gap-3">
              {STANDARD_DENOMINATIONS.map((denom) => (
                <div
                  key={denom}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  {/* Chip Badge */}
                  <div
                    className={cn(
                      "flex h-10 w-16 items-center justify-center rounded-full border-2 font-bold",
                      CHIP_COLORS[denom],
                    )}
                  >
                    ${denom}
                  </div>

                  {/* Quantity Input */}
                  <div className="flex flex-1 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleQuickIncrement(denom, -10)}
                      disabled={logMutation.isPending}
                    >
                      -10
                    </Button>
                    <Input
                      type="number"
                      min="0"
                      value={chipset[String(denom)] || ""}
                      onChange={(e) =>
                        handleQuantityChange(denom, e.target.value)
                      }
                      className="w-24 text-center"
                      placeholder="0"
                      disabled={logMutation.isPending}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleQuickIncrement(denom, 10)}
                      disabled={logMutation.isPending}
                    >
                      +10
                    </Button>
                  </div>

                  {/* Value Display */}
                  <div className="w-24 text-right text-sm text-muted-foreground">
                    ${((chipset[String(denom)] ?? 0) * denom).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total Display */}
          <div className="flex items-center justify-between rounded-lg bg-accent/10 p-4">
            <div className="flex items-center gap-2">
              <Package className="size-5 text-accent" />
              <span className="font-semibold">Total Bankroll</span>
            </div>
            <span className="text-2xl font-bold text-accent">
              ${total.toLocaleString()}
            </span>
          </div>

          {/* Verified By (optional) */}
          <div className="space-y-2">
            <Label htmlFor="verified-by">Verified By (optional)</Label>
            <Input
              id="verified-by"
              placeholder="Name of verifying staff member"
              value={verifiedBy}
              onChange={(e) => setVerifiedBy(e.target.value)}
              disabled={logMutation.isPending}
            />
          </div>

          {/* Notes (optional) */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes about this chip count..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={1000}
              disabled={logMutation.isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={logMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={logMutation.isPending || total === 0}
          >
            {logMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Chip Count"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

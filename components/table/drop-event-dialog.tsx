"use client";

import { Box, Loader2, ShieldCheck } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  getNextSeqNo,
  useDropEvents,
  useLogDropEvent,
} from "@/hooks/table-context/use-drop-events";

interface DropEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  casinoId: string;
  /** Current staff user ID (auto-filled as removed_by) */
  currentStaffId: string;
  /** Current gaming day (auto-derived) */
  gamingDay?: string;
  /** Callback with the created drop event ID */
  onSuccess?: (dropEventId: string) => void;
}

/**
 * DropEventDialog
 *
 * Modal for logging drop box custody events.
 * Captures seal number, witnesses, and custody chain information.
 *
 * @see GAP-TABLE-ROLLOVER-UI WS3
 */
export function DropEventDialog({
  open,
  onOpenChange,
  tableId,
  casinoId,
  currentStaffId,
  gamingDay,
  onSuccess,
}: DropEventDialogProps) {
  // Form state
  const [dropBoxId, setDropBoxId] = React.useState("");
  const [sealNo, setSealNo] = React.useState("");
  const [witnessedBy, setWitnessedBy] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Queries and mutations
  const { data: existingDrops = [] } = useDropEvents(
    tableId,
    casinoId,
    gamingDay,
  );
  const logMutation = useLogDropEvent(tableId, casinoId);

  // Computed next sequence number
  const nextSeqNo = getNextSeqNo(existingDrops);

  // Validation
  const isValid = sealNo.trim().length > 0;

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setDropBoxId("");
      setSealNo("");
      setWitnessedBy("");
      setNotes("");
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!isValid) return;

    try {
      const result = await logMutation.mutateAsync({
        dropBoxId: dropBoxId.trim() || `DROP-${nextSeqNo}`,
        sealNo: sealNo.trim(),
        witnessedBy: witnessedBy.trim() || currentStaffId,
        gamingDay,
        seqNo: nextSeqNo,
        note: notes.trim() || undefined,
      });

      toast.success("Drop event recorded", {
        description: `Drop #${nextSeqNo} logged with seal #${sealNo.trim()}`,
      });

      onSuccess?.(result.id);
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to record drop event", {
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Box className="size-5 text-accent" />
            Log Drop Event
          </DialogTitle>
          <DialogDescription>
            Record a drop box removal for custody chain documentation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Sequence Info Banner */}
          <div className="flex items-center gap-3 rounded-lg bg-accent/10 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground font-bold">
              #{nextSeqNo}
            </div>
            <div>
              <p className="text-sm font-medium">Drop Sequence</p>
              <p className="text-xs text-muted-foreground">
                {gamingDay
                  ? `Gaming Day: ${new Date(gamingDay).toLocaleDateString()}`
                  : "Current gaming day"}
              </p>
            </div>
          </div>

          {/* Drop Box ID (optional) */}
          <div className="space-y-2">
            <Label htmlFor="drop-box-id">Drop Box ID (optional)</Label>
            <Input
              id="drop-box-id"
              placeholder={`e.g., DROP-${nextSeqNo}`}
              value={dropBoxId}
              onChange={(e) => setDropBoxId(e.target.value)}
              disabled={logMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to auto-generate
            </p>
          </div>

          {/* Seal Number (required) */}
          <div className="space-y-2">
            <Label htmlFor="seal-no" className="flex items-center gap-1">
              Seal Number
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="seal-no"
              placeholder="Enter seal number"
              value={sealNo}
              onChange={(e) => setSealNo(e.target.value)}
              disabled={logMutation.isPending}
              aria-required="true"
            />
          </div>

          {/* Witnessed By */}
          <div className="space-y-2">
            <Label htmlFor="witnessed-by">Witnessed By</Label>
            <Input
              id="witnessed-by"
              placeholder="Name or ID of witness (optional)"
              value={witnessedBy}
              onChange={(e) => setWitnessedBy(e.target.value)}
              disabled={logMutation.isPending}
            />
          </div>

          {/* Custody Chain Info */}
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" />
            <span>
              Removed by current user at{" "}
              {new Date().toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* Notes (optional) */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes about this drop..."
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
            disabled={logMutation.isPending || !isValid}
          >
            {logMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Log Drop Event"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

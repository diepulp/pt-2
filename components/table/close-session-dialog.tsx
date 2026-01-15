'use client';

import { AlertTriangle, Loader2, Package, Receipt } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  type TableSessionDTO,
  useCloseTableSession,
} from '@/hooks/table-context/use-table-session';
import { cn } from '@/lib/utils';

interface CloseSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: TableSessionDTO | null;
  tableId: string;
  /** Optional pre-selected drop event ID */
  dropEventId?: string;
  /** Optional pre-selected closing inventory snapshot ID */
  closingInventorySnapshotId?: string;
}

/**
 * Close Session Dialog
 *
 * Modal for closing a table session with required artifacts.
 * At least one artifact (drop_event_id or closing_inventory_snapshot_id) is required.
 *
 * @see PRD-TABLE-SESSION-LIFECYCLE-MVP
 */
export function CloseSessionDialog({
  open,
  onOpenChange,
  session,
  tableId,
  dropEventId: preselectedDropEventId,
  closingInventorySnapshotId: preselectedSnapshotId,
}: CloseSessionDialogProps) {
  // Form state
  const [useDropEvent, setUseDropEvent] = React.useState(
    !!preselectedDropEventId,
  );
  const [useInventorySnapshot, setUseInventorySnapshot] = React.useState(
    !!preselectedSnapshotId,
  );
  const [dropEventId, setDropEventId] = React.useState(
    preselectedDropEventId ?? '',
  );
  const [closingInventorySnapshotId, setClosingInventorySnapshotId] =
    React.useState(preselectedSnapshotId ?? '');
  const [notes, setNotes] = React.useState('');

  // Mutation
  const closeMutation = useCloseTableSession(session?.id ?? '', tableId);

  // Validation
  const hasAtLeastOneArtifact =
    (useDropEvent && dropEventId) ||
    (useInventorySnapshot && closingInventorySnapshotId);
  const isValid = hasAtLeastOneArtifact && session;

  // Reset form when dialog closes
  React.useEffect(() => {
    if (!open) {
      setUseDropEvent(!!preselectedDropEventId);
      setUseInventorySnapshot(!!preselectedSnapshotId);
      setDropEventId(preselectedDropEventId ?? '');
      setClosingInventorySnapshotId(preselectedSnapshotId ?? '');
      setNotes('');
    }
  }, [open, preselectedDropEventId, preselectedSnapshotId]);

  const handleClose = React.useCallback(async () => {
    if (!isValid) return;

    try {
      await closeMutation.mutateAsync({
        drop_event_id: useDropEvent && dropEventId ? dropEventId : undefined,
        closing_inventory_snapshot_id:
          useInventorySnapshot && closingInventorySnapshotId
            ? closingInventorySnapshotId
            : undefined,
        notes: notes.trim() || undefined,
      });

      toast.success('Session closed', {
        description: 'Table session has been closed successfully',
      });

      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to close session', {
        description:
          error instanceof Error ? error.message : 'An error occurred',
      });
    }
  }, [
    isValid,
    closeMutation,
    useDropEvent,
    dropEventId,
    useInventorySnapshot,
    closingInventorySnapshotId,
    notes,
    onOpenChange,
  ]);

  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            Close Table Session
          </DialogTitle>
          <DialogDescription>
            Close the current session for this table. At least one closing
            artifact is required.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Warning if in ACTIVE state (shortcut close) */}
          {session.status === 'ACTIVE' && (
            <Alert>
              <AlertTriangle className="size-4 text-amber-500" />
              <AlertDescription>
                Session is in ACTIVE state. Consider starting rundown first for
                proper closing procedures.
              </AlertDescription>
            </Alert>
          )}

          {/* Closing Artifacts Section */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">
              Closing Artifacts{' '}
              <span className="text-muted-foreground">
                (at least one required)
              </span>
            </h4>

            {/* Drop Event Option */}
            <div
              className={cn(
                'rounded-lg border p-4 transition-colors',
                useDropEvent ? 'border-primary bg-primary/5' : 'border-border',
              )}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  id="use-drop-event"
                  checked={useDropEvent}
                  onCheckedChange={(checked) =>
                    setUseDropEvent(checked === true)
                  }
                />
                <div className="flex-1 space-y-2">
                  <Label
                    htmlFor="use-drop-event"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Receipt className="size-4" />
                    Drop Event
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Link this session to a recorded cash drop event.
                  </p>
                  {useDropEvent && (
                    <div className="pt-2">
                      <Label htmlFor="drop-event-id" className="sr-only">
                        Drop Event ID
                      </Label>
                      <input
                        id="drop-event-id"
                        type="text"
                        placeholder="Enter drop event UUID"
                        value={dropEventId}
                        onChange={(e) => setDropEventId(e.target.value)}
                        className={cn(
                          'flex h-9 w-full rounded-md border border-input',
                          'bg-transparent px-3 py-1 text-sm shadow-sm',
                          'transition-colors file:border-0 file:bg-transparent',
                          'file:text-sm file:font-medium placeholder:text-muted-foreground',
                          'focus-visible:outline-none focus-visible:ring-1',
                          'focus-visible:ring-ring disabled:cursor-not-allowed',
                          'disabled:opacity-50',
                        )}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Inventory Snapshot Option */}
            <div
              className={cn(
                'rounded-lg border p-4 transition-colors',
                useInventorySnapshot
                  ? 'border-primary bg-primary/5'
                  : 'border-border',
              )}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  id="use-inventory-snapshot"
                  checked={useInventorySnapshot}
                  onCheckedChange={(checked) =>
                    setUseInventorySnapshot(checked === true)
                  }
                />
                <div className="flex-1 space-y-2">
                  <Label
                    htmlFor="use-inventory-snapshot"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Package className="size-4" />
                    Closing Inventory Snapshot
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Link this session to a closing chip inventory snapshot.
                  </p>
                  {useInventorySnapshot && (
                    <div className="pt-2">
                      <Label
                        htmlFor="inventory-snapshot-id"
                        className="sr-only"
                      >
                        Inventory Snapshot ID
                      </Label>
                      <input
                        id="inventory-snapshot-id"
                        type="text"
                        placeholder="Enter inventory snapshot UUID"
                        value={closingInventorySnapshotId}
                        onChange={(e) =>
                          setClosingInventorySnapshotId(e.target.value)
                        }
                        className={cn(
                          'flex h-9 w-full rounded-md border border-input',
                          'bg-transparent px-3 py-1 text-sm shadow-sm',
                          'transition-colors file:border-0 file:bg-transparent',
                          'file:text-sm file:font-medium placeholder:text-muted-foreground',
                          'focus-visible:outline-none focus-visible:ring-1',
                          'focus-visible:ring-ring disabled:cursor-not-allowed',
                          'disabled:opacity-50',
                        )}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any closing notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {notes.length}/2000
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={closeMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleClose}
            disabled={!isValid || closeMutation.isPending}
          >
            {closeMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Closing...
              </>
            ) : (
              'Close Session'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

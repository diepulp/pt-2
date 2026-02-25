'use client';

import { AlertTriangle, Loader2, Package, Receipt } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
  formatDropEventLabel,
  useDropEvents,
  type TableDropEventDTO,
} from '@/hooks/table-context/use-drop-events';
import {
  calculateChipsetTotal,
  useInventorySnapshots,
  type TableInventorySnapshotDTO,
} from '@/hooks/table-context/use-inventory-snapshots';
import {
  type TableSessionDTO,
  useCloseTableSession,
} from '@/hooks/table-context/use-table-session';

import { ArtifactPicker } from './artifact-picker';
import { ChipCountCaptureDialog } from './chip-count-capture-dialog';
import { DropEventDialog } from './drop-event-dialog';

interface CloseSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: TableSessionDTO | null;
  tableId: string;
  casinoId: string;
  /** Current staff user ID */
  currentStaffId: string;
  /** Current gaming day */
  gamingDay?: string;
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
 * Enhanced version with artifact pickers instead of manual UUID entry.
 *
 * @see PRD-TABLE-SESSION-LIFECYCLE-MVP
 * @see GAP-TABLE-ROLLOVER-UI WS2
 */
export function CloseSessionDialog({
  open,
  onOpenChange,
  session,
  tableId,
  casinoId,
  currentStaffId,
  gamingDay,
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
  const [dropEventId, setDropEventId] = React.useState<string | null>(
    preselectedDropEventId ?? null,
  );
  const [closingInventorySnapshotId, setClosingInventorySnapshotId] =
    React.useState<string | null>(preselectedSnapshotId ?? null);
  const [notes, setNotes] = React.useState('');

  // Child dialog states
  const [showChipCountDialog, setShowChipCountDialog] = React.useState(false);
  const [showDropEventDialog, setShowDropEventDialog] = React.useState(false);

  // Queries for artifact data
  const { data: inventorySnapshots = [], isLoading: isLoadingSnapshots } =
    useInventorySnapshots(tableId, casinoId);
  const { data: dropEvents = [], isLoading: isLoadingDrops } = useDropEvents(
    tableId,
    casinoId,
    gamingDay,
  );

  // Mutation
  const closeMutation = useCloseTableSession(session?.id ?? '', tableId);

  // Validation
  const hasAtLeastOneArtifact =
    (useDropEvent && dropEventId) ||
    (useInventorySnapshot && closingInventorySnapshotId);
  const isValid = hasAtLeastOneArtifact && session;

  // Reset form when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      setUseDropEvent(!!preselectedDropEventId);
      setUseInventorySnapshot(!!preselectedSnapshotId);
      setDropEventId(preselectedDropEventId ?? null);
      setClosingInventorySnapshotId(preselectedSnapshotId ?? null);
      setNotes('');
    }
  }, [open, preselectedDropEventId, preselectedSnapshotId]);

  // Handle chip count creation callback
  const handleChipCountCreated = React.useCallback((snapshotId: string) => {
    setClosingInventorySnapshotId(snapshotId);
    setUseInventorySnapshot(true);
    setShowChipCountDialog(false);
  }, []);

  // Handle drop event creation callback
  const handleDropEventCreated = React.useCallback((dropId: string) => {
    setDropEventId(dropId);
    setUseDropEvent(true);
    setShowDropEventDialog(false);
  }, []);

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
        close_reason: 'end_of_shift',
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

  // Render functions for artifact pickers
  const renderSnapshotItem = React.useCallback(
    (snapshot: TableInventorySnapshotDTO) => {
      const total = calculateChipsetTotal(snapshot.chipset);
      const time = new Date(snapshot.created_at).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      return {
        label: `${snapshot.snapshot_type.charAt(0).toUpperCase() + snapshot.snapshot_type.slice(1)} - $${total.toLocaleString()}`,
        description: `${time}${snapshot.counted_by ? ` • ${snapshot.counted_by}` : ''}`,
      };
    },
    [],
  );

  const renderDropItem = React.useCallback((drop: TableDropEventDTO) => {
    return {
      label: formatDropEventLabel(drop),
      description: drop.drop_box_id,
    };
  }, []);

  if (!session) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[540px]">
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
                  Session is in ACTIVE state. Consider starting rundown first
                  for proper closing procedures.
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

              {/* Drop Event Picker */}
              <ArtifactPicker
                label="Drop Event"
                enabled={useDropEvent}
                onEnabledChange={(enabled) => {
                  setUseDropEvent(enabled);
                  if (!enabled) setDropEventId(null);
                }}
                items={dropEvents}
                isLoading={isLoadingDrops}
                selectedId={dropEventId}
                onSelect={setDropEventId}
                onCreate={() => setShowDropEventDialog(true)}
                createLabel="Log New Drop Event"
                renderItem={renderDropItem}
                icon={<Receipt className="size-4" />}
                emptyMessage="No drop events for this gaming day"
              />

              {/* Inventory Snapshot Picker */}
              <ArtifactPicker
                label="Closing Inventory Snapshot"
                enabled={useInventorySnapshot}
                onEnabledChange={(enabled) => {
                  setUseInventorySnapshot(enabled);
                  if (!enabled) setClosingInventorySnapshotId(null);
                }}
                items={inventorySnapshots}
                isLoading={isLoadingSnapshots}
                selectedId={closingInventorySnapshotId}
                onSelect={setClosingInventorySnapshotId}
                onCreate={() => setShowChipCountDialog(true)}
                createLabel="Take New Chip Count"
                renderItem={renderSnapshotItem}
                icon={<Package className="size-4" />}
                emptyMessage="No inventory snapshots for this table"
              />
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

      {/* Child Dialogs */}
      <ChipCountCaptureDialog
        open={showChipCountDialog}
        onOpenChange={setShowChipCountDialog}
        tableId={tableId}
        casinoId={casinoId}
        defaultSnapshotType="close"
        onSuccess={handleChipCountCreated}
      />

      <DropEventDialog
        open={showDropEventDialog}
        onOpenChange={setShowDropEventDialog}
        tableId={tableId}
        casinoId={casinoId}
        currentStaffId={currentStaffId}
        gamingDay={gamingDay}
        onSuccess={handleDropEventCreated}
      />
    </>
  );
}

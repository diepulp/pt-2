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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { isFetchError } from '@/lib/errors/error-utils';
import type { CloseReasonType } from '@/services/table-context/dtos';
import { CLOSE_REASON_OPTIONS } from '@/services/table-context/labels';

import { ArtifactPicker } from './artifact-picker';
import { ChipCountCaptureDialog } from './chip-count-capture-dialog';
import { DropEventDialog } from './drop-event-dialog';

/** Error code → user-legible message mapping (EXEC-038A error matrix) */
const ERROR_MESSAGES: Record<string, string> = {
  UNRESOLVED_LIABILITIES:
    'Session has unresolved items that must be reconciled before closing.',
  TABLE_HAS_OPEN_SLIPS:
    'Open or paused rating slips must be closed before closing the session.',
  ALREADY_CLOSED: 'Session already closed.',
  CLOSE_NOTE_REQUIRED: "Please add a note when selecting 'Other'.",
  VALIDATION_ERROR: 'Invalid request. Check your inputs.',
};

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
 * Modal for closing a table session with required artifacts and close reason.
 *
 * @see PRD-038A Table Lifecycle Audit Patch
 * @see EXEC-038A Close Guardrails
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
  // Form state — artifacts
  // PRD-059: Inventory snapshot defaults ON — custody chain requires it.
  // If snapshots exist for this table, auto-enable and auto-select the most recent.
  const [useDropEvent, setUseDropEvent] = React.useState(
    !!preselectedDropEventId,
  );
  const [useInventorySnapshot, setUseInventorySnapshot] = React.useState(true);
  const [dropEventId, setDropEventId] = React.useState<string | null>(
    preselectedDropEventId ?? null,
  );
  const [closingInventorySnapshotId, setClosingInventorySnapshotId] =
    React.useState<string | null>(preselectedSnapshotId ?? null);
  const [notes, setNotes] = React.useState('');

  // Form state — close reason (PRD-038A)
  const [closeReason, setCloseReason] = React.useState<CloseReasonType | null>(
    null,
  );
  const [closeNote, setCloseNote] = React.useState('');

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

  // Mutations
  const closeMutation = useCloseTableSession(session?.id ?? '', tableId);

  // Derived state
  const hasAtLeastOneArtifact =
    (useDropEvent && dropEventId) ||
    (useInventorySnapshot && closingInventorySnapshotId);
  const closeNoteValid = closeReason !== 'other' || closeNote.trim().length > 0;
  const isPending = closeMutation.isPending;

  // Standard close validation
  const isStandardCloseValid =
    !!closeReason && closeNoteValid && hasAtLeastOneArtifact && session;

  // Reset form when dialog opens/closes
  // PRD-059: Inventory snapshot defaults ON for custody chain continuity.
  React.useEffect(() => {
    if (open) {
      setUseDropEvent(!!preselectedDropEventId);
      setUseInventorySnapshot(true);
      setDropEventId(preselectedDropEventId ?? null);
      setClosingInventorySnapshotId(preselectedSnapshotId ?? null);
      setNotes('');
      setCloseReason(null);
      setCloseNote('');
    }
  }, [open, preselectedDropEventId, preselectedSnapshotId]);

  // PRD-059: Auto-select the most recent inventory snapshot when dialog opens
  // and no snapshot is preselected. This ensures the custody chain is populated
  // without requiring the pit boss to manually toggle the picker.
  React.useEffect(() => {
    if (open && !closingInventorySnapshotId && inventorySnapshots.length > 0) {
      setClosingInventorySnapshotId(inventorySnapshots[0].id);
    }
  }, [open, closingInventorySnapshotId, inventorySnapshots]);

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

  /** Error handler for close mutation (EXEC-038A error matrix) */
  const handleMutationError = React.useCallback(
    (error: unknown) => {
      if (isFetchError(error)) {
        const message =
          ERROR_MESSAGES[error.code] ?? error.message ?? 'An error occurred';
        toast.error('Close failed', { description: message });

        // Close dialog for terminal states
        if (error.code === 'ALREADY_CLOSED' || error.status === 404) {
          onOpenChange(false);
        }
      } else {
        toast.error('Network error. Please try again.');
      }
    },
    [onOpenChange],
  );

  const handleClose = React.useCallback(async () => {
    if (!isStandardCloseValid) return;

    try {
      await closeMutation.mutateAsync({
        drop_event_id: useDropEvent && dropEventId ? dropEventId : undefined,
        closing_inventory_snapshot_id:
          useInventorySnapshot && closingInventorySnapshotId
            ? closingInventorySnapshotId
            : undefined,
        notes: notes.trim() || undefined,
        close_reason: closeReason!,
        close_note: closeNote.trim() || undefined,
      });

      toast.success('Session closed', {
        description: 'Table session has been closed successfully',
      });

      onOpenChange(false);
    } catch (error) {
      handleMutationError(error);
    }
  }, [
    isStandardCloseValid,
    closeMutation,
    useDropEvent,
    dropEventId,
    useInventorySnapshot,
    closingInventorySnapshotId,
    notes,
    closeReason,
    closeNote,
    onOpenChange,
    handleMutationError,
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
              Close the current session for this table. Select a close reason
              and at least one closing artifact.
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

            {/* Close Reason Select (PRD-038A) */}
            <div className="space-y-2">
              <Label htmlFor="close-reason">Close Reason</Label>
              <Select
                value={closeReason ?? ''}
                onValueChange={(value) =>
                  setCloseReason(value as CloseReasonType)
                }
              >
                <SelectTrigger id="close-reason">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {CLOSE_REASON_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Close Note Textarea — visible only for 'other' (PRD-038A) */}
            {closeReason === 'other' && (
              <div className="space-y-2">
                <Label htmlFor="close-note">
                  Note (required for &apos;Other&apos;)
                </Label>
                <Textarea
                  id="close-note"
                  placeholder="Describe the reason for closing..."
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  rows={2}
                  maxLength={2000}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {closeNote.length}/2000
                </p>
              </div>
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

            {/* Session Notes (freeform — distinct from close_note governance field) */}
            <div className="space-y-2">
              <Label htmlFor="notes">Session Notes (optional)</Label>
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

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>

            {/* Close Session */}
            <Button
              variant="destructive"
              onClick={handleClose}
              disabled={!isStandardCloseValid || isPending}
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

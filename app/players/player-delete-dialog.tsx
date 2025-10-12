"use client";

/**
 * PlayerDeleteDialog Component
 * Confirmation dialog for player deletion with error handling
 *
 * Features:
 * - Confirmation dialog with player name
 * - Loading state during deletion
 * - Error handling (especially FK violations)
 * - Accessible dialog markup (role, aria labels)
 *
 * Wave 3: Player Management UI Components
 */

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useDeletePlayer } from "@/hooks/player/use-delete-player";
import { usePlayer } from "@/hooks/player/use-player";

export interface PlayerDeleteDialogProps {
  playerId: string | null; // null when dialog is closed
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function PlayerDeleteDialog({
  playerId,
  open,
  onOpenChange,
  onSuccess,
}: PlayerDeleteDialogProps) {
  const { data: player, isLoading: isLoadingPlayer } = usePlayer(
    playerId || undefined,
  );
  const deletePlayerMutation = useDeletePlayer(playerId || "");

  const isDeleting = deletePlayerMutation.isPending;
  const deleteError = deletePlayerMutation.error;

  // Reset mutation state when dialog closes
  useEffect(() => {
    if (!open) {
      deletePlayerMutation.reset();
    }
  }, [open, deletePlayerMutation]);

  // Handle successful deletion
  useEffect(() => {
    if (deletePlayerMutation.isSuccess) {
      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    }
  }, [deletePlayerMutation.isSuccess, onOpenChange, onSuccess]);

  const handleDelete = () => {
    if (!playerId) return;
    deletePlayerMutation.mutate();
  };

  const handleCancel = () => {
    if (!isDeleting) {
      onOpenChange(false);
    }
  };

  // Determine if this is a foreign key violation error
  const isForeignKeyError =
    deleteError?.message?.toLowerCase().includes("foreign key") ||
    deleteError?.message?.toLowerCase().includes("related records") ||
    deleteError?.message?.toLowerCase().includes("constraint");

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-card p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
          aria-describedby="delete-dialog-description"
        >
          <AlertDialog.Title className="text-lg font-semibold">
            Delete Player
          </AlertDialog.Title>

          <AlertDialog.Description
            id="delete-dialog-description"
            className="mt-2 text-sm text-muted-foreground"
          >
            {isLoadingPlayer ? (
              <span>Loading player information...</span>
            ) : player ? (
              <span>
                Are you sure you want to delete{" "}
                <strong className="text-foreground">
                  {player.firstName} {player.lastName}
                </strong>{" "}
                ({player.email})?
              </span>
            ) : (
              <span>Are you sure you want to delete this player?</span>
            )}
          </AlertDialog.Description>

          <div className="mt-2 text-sm text-muted-foreground">
            This action cannot be undone. This will permanently delete the
            player record.
          </div>

          {/* Error Message */}
          {deleteError && (
            <div className="mt-4 rounded-lg bg-destructive/10 border border-destructive p-3">
              <p className="text-sm font-semibold text-destructive">
                {isForeignKeyError ? "Cannot Delete Player" : "Deletion Failed"}
              </p>
              <p className="text-sm text-destructive mt-1">
                {isForeignKeyError ? (
                  <>
                    This player has related records (such as visits, rating
                    slips, or transactions) and cannot be deleted. Please remove
                    or reassign these records first.
                  </>
                ) : (
                  deleteError.message
                )}
              </p>
            </div>
          )}

          {/* Loading State */}
          {isDeleting && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>Deleting player...</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isDeleting}
                aria-label="Cancel deletion"
              >
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting || isLoadingPlayer}
                aria-label={
                  player
                    ? `Confirm delete ${player.firstName} ${player.lastName}`
                    : "Confirm delete player"
                }
              >
                {isDeleting ? "Deleting..." : "Delete Player"}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

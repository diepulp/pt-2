"use client";

/**
 * VisitDeleteDialog Component
 * Confirmation dialog for visit deletion with error handling
 *
 * Features:
 * - Radix UI AlertDialog component
 * - Confirmation message with visit details
 * - Loading state during deletion (spinner)
 * - Special error handling for FK violations
 * - Accessible markup (role, aria-describedby, aria-label)
 * - Auto-close on success
 * - Smooth animations
 *
 * Wave 3B: Visit Management UI Components
 */

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

// Mock data until hooks are available
const MOCK_VISIT = {
  id: "1",
  player_id: "p1",
  casino_id: "c1",
  check_in_date: "2025-10-12T10:00:00Z",
  check_out_date: null,
  status: "ONGOING",
  mode: "RATED",
  player: { firstName: "John", lastName: "Doe", email: "john@example.com" },
  casino: { name: "Casino Royale" },
};

export interface VisitDeleteDialogProps {
  visitId: string | null; // null when dialog is closed
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function VisitDeleteDialog({
  visitId,
  open,
  onOpenChange,
  onSuccess,
}: VisitDeleteDialogProps) {
  // TODO: Replace with real hooks when available
  // const { data: visit, isLoading: isLoadingVisit } = useVisit(visitId || undefined);
  // const deleteVisitMutation = useDeleteVisit(visitId || "");

  // Mock hooks for now
  const visit = visitId ? MOCK_VISIT : null;
  const isLoadingVisit = false;

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<Error | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  // Mock delete mutation
  const deleteVisitMutation = {
    mutate: () => {
      setIsDeleting(true);
      setDeleteError(null);
      // Simulate deletion
      setTimeout(() => {
        setIsDeleting(false);
        setDeleteSuccess(true);
      }, 1000);
    },
    reset: () => {
      setIsDeleting(false);
      setDeleteError(null);
      setDeleteSuccess(false);
    },
  };

  // Reset mutation state when dialog closes
  useEffect(() => {
    if (!open) {
      deleteVisitMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Handle successful deletion
  useEffect(() => {
    if (deleteSuccess) {
      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    }
  }, [deleteSuccess, onOpenChange, onSuccess]);

  const handleDelete = () => {
    if (!visitId) return;
    deleteVisitMutation.mutate();
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
            Delete Visit
          </AlertDialog.Title>

          <AlertDialog.Description
            id="delete-dialog-description"
            className="mt-2 text-sm text-muted-foreground"
          >
            {isLoadingVisit ? (
              <span>Loading visit information...</span>
            ) : visit ? (
              <div>
                <p>
                  Are you sure you want to delete the visit for{" "}
                  <strong className="text-foreground">
                    {visit.player.firstName} {visit.player.lastName}
                  </strong>{" "}
                  at{" "}
                  <strong className="text-foreground">
                    {visit.casino.name}
                  </strong>
                  ?
                </p>
                <p className="mt-2">
                  Check-in:{" "}
                  {new Date(visit.check_in_date).toLocaleString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ) : (
              <span>Are you sure you want to delete this visit?</span>
            )}
          </AlertDialog.Description>

          <div className="mt-2 text-sm text-muted-foreground">
            This action cannot be undone. This will permanently delete the visit
            record.
          </div>

          {/* Error Message */}
          {deleteError && (
            <div className="mt-4 rounded-lg bg-destructive/10 border border-destructive p-3">
              <p className="text-sm font-semibold text-destructive">
                {isForeignKeyError ? "Cannot Delete Visit" : "Deletion Failed"}
              </p>
              <p className="text-sm text-destructive mt-1">
                {isForeignKeyError ? (
                  <>
                    This visit has related records (such as rating slips,
                    rewards, or transactions) and cannot be deleted. Please
                    remove or reassign these records first.
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
              <span>Deleting visit...</span>
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
                disabled={isDeleting || isLoadingVisit}
                aria-label={
                  visit
                    ? `Confirm delete visit for ${visit.player.firstName} ${visit.player.lastName}`
                    : "Confirm delete visit"
                }
              >
                {isDeleting ? "Deleting..." : "Delete Visit"}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

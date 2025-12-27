"use client";

import { RefreshCw, X } from "lucide-react";
import React, { useEffect, useRef, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRatingSlipModalData } from "@/hooks/rating-slip-modal";
import { useRatingSlipModal } from "@/hooks/ui/use-rating-slip-modal";

import { FormSectionAverageBet } from "./form-section-average-bet";
import { FormSectionCashIn } from "./form-section-cash-in";
import { FormSectionChipsTaken } from "./form-section-chips-taken";
import { FormSectionMovePlayer } from "./form-section-move-player";
import { FormSectionStartTime } from "./form-section-start-time";
import { RatingSlipModalSkeleton } from "./rating-slip-modal-skeleton";

/**
 * Converts an ISO timestamp to datetime-local format in the user's local timezone.
 * Handles both UTC (Z suffix) and offset-based timestamps.
 *
 * @param isoTimestamp - ISO 8601 timestamp (e.g., "2025-12-27T00:04:00.000Z")
 * @returns datetime-local format string (YYYY-MM-DDTHH:mm) in local timezone
 */
function toLocalDateTimeString(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (isNaN(date.getTime())) {
    // Fallback: if parsing fails, try using the first 16 chars as-is
    return isoTimestamp.slice(0, 16);
  }

  // Format as local datetime-local string
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Form state type for action handlers.
 * Zustand store manages form state internally via useRatingSlipModal hook.
 */
export interface FormState {
  averageBet: string;
  startTime: string;
  cashIn: string; // Maps from newBuyIn for backward compatibility
  newBuyIn?: string;
  newTableId: string;
  newSeatNumber: string;
  chipsTaken: string;
}

// Legacy DTO types for backward compatibility with preview page
// TODO: Remove once all consumers are updated to use service layer
export interface RatingSlipDto {
  id: string;
  playerName?: string;
  averageBet: number;
  cashIn: number;
  startTime: string;
  gameTableId: string;
  seatNumber: number;
  points?: number;
}

export interface RatingSlipTableDto {
  gaming_table_id: string;
  name: string;
  seats_available: number;
}

interface RatingSlipModalProps {
  /** Rating slip ID to load (null disables query) */
  slipId: string | null;

  /** Modal open state */
  isOpen: boolean;

  /** Close handler */
  onClose: () => void;

  /** Save changes handler - wrapped in useTransition internally */
  onSave: (formState: FormState) => void;

  /** Close session handler - wrapped in useTransition internally */
  onCloseSession: (formState: FormState) => void;

  /** Move player handler - called directly (parent handles async) */
  onMovePlayer: (formState: FormState) => void;

  /** Move player mutation pending state from parent */
  isMovePlayerPending?: boolean;

  /** Error message to display */
  error?: string | null;

  // Legacy props for backward compatibility (ignored if slipId is provided)
  /** @deprecated Use slipId instead */
  ratingSlip?: RatingSlipDto;
  /** @deprecated Loaded from service layer */
  tables?: RatingSlipTableDto[];
  /** @deprecated Managed by TanStack Query */
  isLoading?: boolean;
}

/**
 * Rating Slip Modal Component
 *
 * Integrated with service layer via TanStack Query.
 * Uses Zustand store for form state management (eliminates prop drilling).
 *
 * Data aggregated from 5 bounded contexts:
 * - Rating slip details
 * - Player identity
 * - Loyalty balance and suggestion
 * - Financial summary
 * - Available tables
 *
 * React 19 Patterns:
 * - useTransition for non-blocking async operations (no isSaving/isClosing props)
 * - Zustand store via useRatingSlipModal hook for form state
 * - Key-based reset pattern for store initialization
 *
 * @see PRD-008 WS4 Modal Service Integration
 * @see ZUSTAND-RSM for Zustand integration spec
 * @see useRatingSlipModalData hook for data fetching
 * @see useRatingSlipModal hook for form state
 *
 * @example
 * ```tsx
 * <RatingSlipModal
 *   slipId={selectedSlipId}
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onSave={handleSave}
 *   onCloseSession={handleClose}
 *   onMovePlayer={handleMove}
 * />
 * ```
 */
export function RatingSlipModal({
  slipId,
  isOpen,
  onClose,
  onSave,
  onCloseSession,
  onMovePlayer,
  isMovePlayerPending = false,
  error = null,
  // Legacy props (ignored if slipId is provided)
  ratingSlip: legacyRatingSlip,
  tables: legacyTables,
  isLoading: legacyIsLoading,
}: RatingSlipModalProps) {
  // React 19: Use useTransition for non-blocking UI during async operations
  const [isPending, startTransition] = useTransition();

  // Fetch modal data from service layer (only when modal is open)
  const {
    data: modalData,
    isLoading,
    isFetching,
    error: fetchError,
    refetch,
  } = useRatingSlipModalData(isOpen ? slipId : null);

  // Zustand store for form state management (replaces useModalFormState)
  const { formState, originalState, initializeForm } = useRatingSlipModal();

  // Track which slipId we've initialized to prevent re-initialization on refetch
  // This preserves form state when user clicks "Refresh points balance"
  const initializedSlipIdRef = useRef<string | null>(null);

  // Initialize store ONLY when slip ID changes (not on refetch)
  // Bug fix: Previously reinitializing on every modalData change reset form state
  useEffect(() => {
    if (modalData && modalData.slip.id !== initializedSlipIdRef.current) {
      // New slip opened - initialize form with server data
      initializedSlipIdRef.current = modalData.slip.id;
      initializeForm({
        averageBet: modalData.slip.averageBet.toString(),
        startTime: toLocalDateTimeString(modalData.slip.startTime),
        newBuyIn: "0",
        newTableId: modalData.slip.tableId,
        newSeatNumber: modalData.slip.seatNumber || "",
        chipsTaken: "0",
      });
    }
  }, [modalData, initializeForm]);

  // Reset ref when modal closes to allow re-initialization on next open
  useEffect(() => {
    if (!isOpen) {
      initializedSlipIdRef.current = null;
    }
  }, [isOpen]);

  // Compute dirty state (derived, not stored)
  const isDirty = JSON.stringify(formState) !== JSON.stringify(originalState);

  // Loading skeleton - mirrors actual modal structure
  if (isLoading || legacyIsLoading) {
    return <RatingSlipModalSkeleton isOpen={isOpen} onClose={onClose} />;
  }

  // Error state
  if (fetchError && !modalData) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Error Loading Rating Slip</DialogTitle>
            <DialogDescription className="sr-only">
              An error occurred while loading the rating slip data.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
            {fetchError.message || "Failed to load rating slip data"}
          </div>
          <Button onClick={onClose}>Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  // No data state (shouldn't happen but handle gracefully)
  if (!modalData && !legacyRatingSlip) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Data Available</DialogTitle>
            <DialogDescription className="sr-only">
              Rating slip data could not be loaded.
            </DialogDescription>
          </DialogHeader>
          <p className="text-muted-foreground">
            Rating slip data is not available.
          </p>
          <Button onClick={onClose}>Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  // Legacy mode: use props if modalData not available
  // TODO: Remove once all consumers are updated
  const isLegacyMode = !modalData && legacyRatingSlip;

  // Extract data from service layer or legacy props
  const playerName = modalData
    ? modalData.player
      ? `${modalData.player.firstName} ${modalData.player.lastName}`
      : "Ghost Visit"
    : legacyRatingSlip?.playerName || "Unknown Player";

  const tables = modalData
    ? modalData.tables.map((t) => ({
        gaming_table_id: t.id,
        name: t.label,
        seats_available: 12, // Not critical for UI, placeholder
      }))
    : legacyTables || [];

  const selectedTable =
    tables.find((t) => t.gaming_table_id === formState.newTableId) || null;

  // Get loyalty data
  const currentBalance = modalData?.loyalty?.currentBalance ?? 0;
  const suggestedPoints = modalData?.loyalty?.suggestion?.suggestedPoints;

  // Get financial data for display (in cents, convert to dollars)
  // Derive computed values from server data + form state (React 19 pattern: no useEffect sync)
  const totalCashIn = modalData ? modalData.financial.totalCashIn / 100 : 0;

  // Chips Taken from form is in dollars, server data is in cents
  // computedChipsOut = server chips out + pending chips taken
  const pendingChipsTaken = Number(formState.chipsTaken) || 0;
  const computedChipsOut = modalData
    ? (modalData.financial.totalChipsOut + pendingChipsTaken * 100) / 100
    : 0;

  // Net Position = Cash In - Chips Out (using computed chips out for reactivity)
  const computedNetPosition = totalCashIn - computedChipsOut;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            Rating Slip - {playerName}
            {modalData?.player?.cardNumber && (
              <span className="text-sm text-muted-foreground ml-2">
                (Card: {modalData.player.cardNumber})
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Edit rating slip details including average bet, buy-in, and session
            time. Use form fields to make changes and save when ready.
          </DialogDescription>
        </DialogHeader>

        {/* Key by slip ID to force form state reset on slip change (React 19 pattern) */}
        <div
          key={modalData?.slip.id}
          className="flex-1 overflow-y-auto space-y-6 pr-2"
        >
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              {error}
            </div>
          )}

          {isLegacyMode && (
            <div className="p-3 bg-yellow-500/10 text-yellow-600 rounded-lg text-sm">
              Legacy Mode: Using prop data instead of service layer
            </div>
          )}

          <FormSectionAverageBet />

          <FormSectionCashIn totalCashIn={totalCashIn} />

          <FormSectionStartTime />

          <FormSectionMovePlayer
            tables={tables}
            selectedTable={selectedTable}
            seatError=""
            onMovePlayer={() => {
              // Call handler directly - parent manages async and modal close
              onMovePlayer({
                ...formState,
                cashIn: formState.newBuyIn,
              } as FormState);
            }}
            isUpdating={isMovePlayerPending}
            disabled={
              isMovePlayerPending ||
              !formState.newTableId ||
              !formState.newSeatNumber
            }
          />

          <FormSectionChipsTaken />

          {/* Financial Summary (if available from service layer) */}
          {/* Uses computed values for reactive binding with Chips Taken input */}
          {modalData && (
            <div className="p-4 bg-card border border-border rounded-lg">
              <h3 className="text-sm font-semibold mb-3">Financial Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cash In:</span>
                  <span className="font-mono">${totalCashIn.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Chips Out:</span>
                  <span className="font-mono">
                    ${computedChipsOut.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-semibold">Net Position:</span>
                  <span
                    className={`font-mono font-semibold ${
                      computedNetPosition >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    ${computedNetPosition.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Loyalty Points Display */}
          <div className="p-4 bg-card border border-border rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Current Points Balance
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-primary">
                  {currentBalance.toLocaleString()}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={isFetching}
                  onClick={() => {
                    startTransition(async () => {
                      await refetch();
                    });
                  }}
                  aria-label="Refresh points balance"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>
            </div>

            {/* Session Reward Suggestion (for open slips) */}
            {modalData?.slip.status === "open" && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Session Reward Estimate
                  </span>
                  <span className="text-lg font-semibold text-green-600">
                    {suggestedPoints != null
                      ? `+${suggestedPoints.toLocaleString()} pts`
                      : "--"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Based on current session activity
                </p>
              </div>
            )}

            {/* Player Tier (if available) */}
            {modalData?.loyalty?.tier && (
              <div className="mt-2 text-xs text-muted-foreground">
                Tier:{" "}
                <span className="uppercase font-semibold">
                  {modalData.loyalty.tier}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons - Fixed at bottom */}
        <div className="flex gap-2 flex-shrink-0 pt-4 border-t border-border">
          <Button
            type="button"
            className="flex-1"
            onClick={() =>
              startTransition(() => {
                onSave({
                  ...formState,
                  cashIn: formState.newBuyIn,
                } as FormState);
              })
            }
            disabled={isPending || !isDirty}
          >
            {isPending ? "Saving..." : isDirty ? "Save Changes" : "No Changes"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="flex-1"
            onClick={() =>
              startTransition(() => {
                onCloseSession({
                  ...formState,
                  cashIn: formState.newBuyIn,
                } as FormState);
              })
            }
            disabled={isPending || !!error}
          >
            {isPending ? (
              "Closing..."
            ) : (
              <>
                <X className="h-4 w-4 mr-2" />
                Close Session
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

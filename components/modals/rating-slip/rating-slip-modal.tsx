"use client";

import { X } from "lucide-react";
import React, { useEffect, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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

  /** Move player handler - wrapped in useTransition internally */
  onMovePlayer: (formState: FormState) => void;

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
    error: fetchError,
  } = useRatingSlipModalData(isOpen ? slipId : null);

  // Zustand store for form state management (replaces useModalFormState)
  const { formState, originalState, initializeForm } = useRatingSlipModal();

  // Initialize store when modal data changes
  useEffect(() => {
    if (modalData) {
      initializeForm({
        averageBet: modalData.slip.averageBet.toString(),
        startTime: modalData.slip.startTime.slice(0, 16),
        newBuyIn: "0",
        newTableId: modalData.slip.tableId,
        newSeatNumber: modalData.slip.seatNumber || "",
        chipsTaken: "0",
      });
    }
  }, [modalData, initializeForm]);

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
  const currentBalance = modalData?.loyalty?.currentBalance || 0;
  const suggestedPoints = modalData?.loyalty?.suggestion?.suggestedPoints;
  const hasLoyaltySuggestion =
    modalData?.slip.status === "open" && suggestedPoints !== undefined;

  // Get financial data for display (in cents, convert to dollars)
  const totalCashIn = modalData ? modalData.financial.totalCashIn / 100 : 0;
  const totalChipsOut = modalData ? modalData.financial.totalChipsOut / 100 : 0;
  const netPosition = modalData ? modalData.financial.netPosition / 100 : 0;

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
            onMovePlayer={() =>
              startTransition(() => {
                onMovePlayer({
                  ...formState,
                  cashIn: formState.newBuyIn,
                } as FormState);
              })
            }
            isUpdating={isPending}
            disabled={
              isPending || !formState.newTableId || !formState.newSeatNumber
            }
          />

          <FormSectionChipsTaken />

          {/* Financial Summary (if available from service layer) */}
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
                  <span className="font-mono">${totalChipsOut.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-semibold">Net Position:</span>
                  <span
                    className={`font-mono font-semibold ${
                      netPosition >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    ${netPosition.toFixed(2)}
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
              <span className="text-xl font-bold text-primary">
                {currentBalance.toLocaleString()}
              </span>
            </div>

            {/* Session Reward Suggestion (for open slips) */}
            {hasLoyaltySuggestion && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Session Reward Estimate
                  </span>
                  <span className="text-lg font-semibold text-green-600">
                    +{suggestedPoints.toLocaleString()} pts
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

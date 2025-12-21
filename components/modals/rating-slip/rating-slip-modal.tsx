"use client";

import { X } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRatingSlipModalData } from "@/hooks/rating-slip-modal";

import { FormSectionAverageBet } from "./form-section-average-bet";
import { FormSectionCashIn } from "./form-section-cash-in";
import { FormSectionChipsTaken } from "./form-section-chips-taken";
import { FormSectionMovePlayer } from "./form-section-move-player";
import { FormSectionStartTime } from "./form-section-start-time";
import { RatingSlipModalSkeleton } from "./rating-slip-modal-skeleton";
import { useModalFormState, type ModalFormState } from "./use-modal-form-state";

/**
 * Legacy form state type for backward compatibility with parent components.
 * @deprecated Use ModalFormState from use-modal-form-state.ts instead
 */
export interface FormState {
  averageBet: string;
  startTime: string;
  cashIn: string; // Keep for backward compatibility
  newBuyIn?: string; // New field
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

  /** Save changes handler */
  onSave: (formState: FormState) => void;

  /** Close session handler */
  onCloseSession: (formState: FormState) => void;

  /** Move player handler */
  onMovePlayer: (formState: FormState) => void;

  /** Save in progress flag */
  isSaving?: boolean;

  /** Close session in progress flag */
  isClosing?: boolean;

  /** Move player in progress flag */
  isMoving?: boolean;

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
 * Fetches aggregated data from 5 bounded contexts:
 * - Rating slip details
 * - Player identity
 * - Loyalty balance and suggestion
 * - Financial summary
 * - Available tables
 *
 * @see PRD-008 WS4 Modal Service Integration
 * @see useRatingSlipModalData hook for data fetching
 * @see useModalFormState hook for form state management
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
 *   isSaving={isSaving}
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
  isSaving = false,
  isClosing = false,
  isMoving = false,
  error = null,
  // Legacy props (ignored if slipId is provided)
  ratingSlip: legacyRatingSlip,
  tables: legacyTables,
  isLoading: legacyIsLoading,
}: RatingSlipModalProps) {
  // Fetch modal data from service layer (only when modal is open)
  const {
    data: modalData,
    isLoading,
    error: fetchError,
  } = useRatingSlipModalData(isOpen ? slipId : null);

  // Manage form state
  const {
    formState,
    isDirty,
    updateField,
    resetField,
    incrementField,
    decrementField,
    adjustStartTime,
  } = useModalFormState(modalData);

  // Static increment button configuration
  const incrementButtons = [
    { amount: 5, label: "+5" },
    { amount: 25, label: "+25" },
    { amount: 100, label: "+100" },
    { amount: 500, label: "+500" },
    { amount: 1000, label: "+1000" },
  ];

  // Increment handlers for each field
  const incrementAverageBet = (amount: number) =>
    incrementField("averageBet", amount);
  const incrementNewBuyIn = (amount: number) =>
    incrementField("newBuyIn", amount);
  const incrementChipsTaken = (amount: number) =>
    incrementField("chipsTaken", amount);

  // Decrement handlers
  const decrementAverageBet = () => decrementField("averageBet");
  const decrementNewBuyIn = () => decrementField("newBuyIn");
  const decrementChipsTaken = () => decrementField("chipsTaken");

  // Reset handlers
  const resetAverageBet = () => resetField("averageBet");
  const resetNewBuyIn = () => resetField("newBuyIn");
  const resetStartTime = () => resetField("startTime");

  // Start time adjustment handler
  const handleStartTimeChange = (
    action: "add" | "subtract",
    minutes: number,
  ) => {
    adjustStartTime(action, minutes);
  };

  // Table change handlers
  const handleTableChange = (tableId: string) => {
    updateField("newTableId", tableId);
  };

  const handleSeatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateField("newSeatNumber", e.target.value);
  };

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

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
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

          <FormSectionAverageBet
            value={formState.averageBet}
            onChange={(v) => updateField("averageBet", v)}
            onReset={resetAverageBet}
            incrementHandlers={{ averageBet: incrementAverageBet }}
            decrementHandler={decrementAverageBet}
            incrementButtons={incrementButtons}
            totalChange={0}
          />

          <FormSectionCashIn
            value={formState.newBuyIn}
            totalCashIn={totalCashIn}
            onChange={(v) => updateField("newBuyIn", v)}
            onReset={resetNewBuyIn}
            incrementHandlers={{ newBuyIn: incrementNewBuyIn }}
            decrementHandler={decrementNewBuyIn}
            incrementButtons={incrementButtons}
            totalChange={0}
          />

          <FormSectionStartTime
            value={formState.startTime}
            onChange={(v) => updateField("startTime", v)}
            onReset={resetStartTime}
            handleStartTimeChange={handleStartTimeChange}
            totalChange={0}
          />

          <FormSectionMovePlayer
            tables={tables}
            value={formState.newTableId}
            seatValue={formState.newSeatNumber}
            onTableChange={handleTableChange}
            onSeatChange={handleSeatChange}
            selectedTable={selectedTable}
            seatError=""
            onMovePlayer={() =>
              onMovePlayer({
                ...formState,
                cashIn: formState.newBuyIn,
              } as FormState)
            }
            isUpdating={isMoving}
            disabled={
              isMoving || !formState.newTableId || !formState.newSeatNumber
            }
          />

          <FormSectionChipsTaken
            value={formState.chipsTaken}
            onChange={(v) => updateField("chipsTaken", v)}
            incrementHandlers={{ chipsTaken: incrementChipsTaken }}
            decrementHandler={decrementChipsTaken}
            incrementButtons={incrementButtons}
          />

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
              onSave({
                ...formState,
                cashIn: formState.newBuyIn,
              } as FormState)
            }
            disabled={isSaving || !isDirty}
          >
            {isSaving ? "Saving..." : isDirty ? "Save Changes" : "No Changes"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="flex-1"
            onClick={() =>
              onCloseSession({
                ...formState,
                cashIn: formState.newBuyIn,
              } as FormState)
            }
            disabled={isClosing || !!error}
          >
            {isClosing ? (
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

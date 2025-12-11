"use client";

import { X } from "lucide-react";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

import { FormSectionAverageBet } from "./form-section-average-bet";
import { FormSectionCashIn } from "./form-section-cash-in";
import { FormSectionChipsTaken } from "./form-section-chips-taken";
import { FormSectionMovePlayer } from "./form-section-move-player";
import { FormSectionStartTime } from "./form-section-start-time";

// Placeholder types - replace with actual service types
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

export interface FormState {
  averageBet: string;
  startTime: string;
  cashIn: string;
  newTableId: string;
  newSeatNumber: string;
  chipsTaken: string;
}

interface RatingSlipModalProps {
  ratingSlip: RatingSlipDto;
  isOpen: boolean;
  onClose: () => void;
  onSave: (formState: FormState) => void;
  onCloseSession: (formState: FormState) => void;
  onMovePlayer: (formState: FormState) => void;
  tables: RatingSlipTableDto[];
  isLoading?: boolean;
  isSaving?: boolean;
  isClosing?: boolean;
  isMoving?: boolean;
  error?: string | null;
}

export function RatingSlipModal({
  ratingSlip,
  isOpen,
  onClose,
  onSave,
  onCloseSession,
  onMovePlayer,
  tables,
  isLoading = false,
  isSaving = false,
  isClosing = false,
  isMoving = false,
  error = null,
}: RatingSlipModalProps) {
  // Static increment button configuration
  const incrementButtons = [
    { amount: 5, label: "+5" },
    { amount: 25, label: "+25" },
    { amount: 100, label: "+100" },
    { amount: 500, label: "+500" },
    { amount: 1000, label: "+1000" },
  ];

  // Form state
  const [formState, setFormState] = useState<FormState>(() => ({
    averageBet: ratingSlip.averageBet.toString(),
    startTime: ratingSlip.startTime || "",
    cashIn: ratingSlip.cashIn?.toString() || "0",
    newTableId: ratingSlip.gameTableId || "",
    newSeatNumber: ratingSlip.seatNumber?.toString() || "",
    chipsTaken: "",
  }));

  // Direct increment handlers
  const incrementAverageBet = (amount: number) => {
    const newValue = (Number(formState.averageBet) + amount).toString();
    setFormState((prev) => ({ ...prev, averageBet: newValue }));
  };

  const incrementCashIn = (amount: number) => {
    const newValue = (Number(formState.cashIn) + amount).toString();
    setFormState((prev) => ({ ...prev, cashIn: newValue }));
  };

  const incrementChipsTaken = (amount: number) => {
    const newValue = (Number(formState.chipsTaken) + amount).toString();
    setFormState((prev) => ({ ...prev, chipsTaken: newValue }));
  };

  const decrementAverageBet = () => {
    const newValue = Math.max(0, Number(formState.averageBet) - 1).toString();
    setFormState((prev) => ({ ...prev, averageBet: newValue }));
  };

  const decrementCashIn = () => {
    const newValue = Math.max(0, Number(formState.cashIn) - 1).toString();
    setFormState((prev) => ({ ...prev, cashIn: newValue }));
  };

  const decrementChipsTaken = () => {
    const newValue = Math.max(0, Number(formState.chipsTaken) - 1).toString();
    setFormState((prev) => ({ ...prev, chipsTaken: newValue }));
  };

  // Reset handlers
  const resetAverageBet = () => {
    setFormState((prev) => ({
      ...prev,
      averageBet: ratingSlip.averageBet.toString(),
    }));
  };

  const resetCashIn = () => {
    setFormState((prev) => ({
      ...prev,
      cashIn: ratingSlip.cashIn?.toString() || "0",
    }));
  };

  const resetStartTime = () => {
    setFormState((prev) => ({
      ...prev,
      startTime: ratingSlip.startTime || "",
    }));
  };

  // Start time change handler
  const handleStartTimeChange = (
    action: "add" | "subtract",
    minutes: number,
  ) => {
    const currentTime = new Date(formState.startTime);
    if (isNaN(currentTime.getTime())) return;

    const newTime = new Date(currentTime);
    if (action === "add") {
      newTime.setMinutes(newTime.getMinutes() + minutes);
    } else {
      newTime.setMinutes(newTime.getMinutes() - minutes);
    }

    const formattedTime = newTime.toISOString().slice(0, 16);
    setFormState((prev) => ({ ...prev, startTime: formattedTime }));
  };

  // Table change handlers
  const handleTableChange = (tableId: string) => {
    setFormState((prev) => ({ ...prev, newTableId: tableId }));
  };

  const handleSeatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormState((prev) => ({ ...prev, newSeatNumber: e.target.value }));
  };

  // Selected table
  const selectedTable =
    tables.find((t) => t.gaming_table_id === formState.newTableId) || null;

  // Get current accrued points
  const currentPoints = ratingSlip.points || 0;

  // Loading skeleton
  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Loading Rating Slip...</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Rating Slip - {ratingSlip.playerName || "Unknown Player"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              {error}
            </div>
          )}

          <FormSectionAverageBet
            value={formState.averageBet}
            onChange={(v) =>
              setFormState((prev) => ({ ...prev, averageBet: v }))
            }
            onReset={resetAverageBet}
            incrementHandlers={{ averageBet: incrementAverageBet }}
            decrementHandler={decrementAverageBet}
            incrementButtons={incrementButtons}
            totalChange={0}
          />

          <FormSectionCashIn
            value={formState.cashIn}
            onChange={(v) => setFormState((prev) => ({ ...prev, cashIn: v }))}
            onReset={resetCashIn}
            incrementHandlers={{ cashIn: incrementCashIn }}
            decrementHandler={decrementCashIn}
            incrementButtons={incrementButtons}
            totalChange={0}
          />

          <FormSectionStartTime
            value={formState.startTime}
            onChange={(v) =>
              setFormState((prev) => ({ ...prev, startTime: v }))
            }
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
            onMovePlayer={() => onMovePlayer(formState)}
            isUpdating={isMoving}
            disabled={
              isMoving || !formState.newTableId || !formState.newSeatNumber
            }
          />

          <FormSectionChipsTaken
            value={formState.chipsTaken}
            onChange={(v) =>
              setFormState((prev) => ({ ...prev, chipsTaken: v }))
            }
            incrementHandlers={{ chipsTaken: incrementChipsTaken }}
            decrementHandler={decrementChipsTaken}
            incrementButtons={incrementButtons}
          />

          <div className="flex gap-2">
            <Button
              type="button"
              className="flex-1"
              onClick={() => onSave(formState)}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              onClick={() => onCloseSession(formState)}
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

          <div className="mt-4 p-4 bg-card border border-border rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Current Points
              </span>
              <span className="text-xl font-bold text-primary">
                {currentPoints.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

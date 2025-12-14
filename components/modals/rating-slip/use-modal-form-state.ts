/**
 * Modal Form State Hook
 *
 * Local form state management for the rating slip modal.
 * Tracks dirty state and provides optimistic updates.
 *
 * @see PRD-008 WS4 Modal Service Integration
 */

import { useEffect, useState } from "react";

import type { RatingSlipModalDTO } from "@/services/rating-slip-modal/dtos";

/**
 * Form state shape matching modal inputs.
 */
export interface ModalFormState {
  /** Average bet amount (string for input binding) */
  averageBet: string;

  /** Session start time (ISO 8601 datetime-local format) */
  startTime: string;

  /** Cash-in amount (string for input binding) */
  cashIn: string;

  /** Target table ID for move player feature */
  newTableId: string;

  /** Target seat number for move player feature */
  newSeatNumber: string;

  /** Chips taken amount (string for input binding) */
  chipsTaken: string;
}

/**
 * Hook for managing rating slip modal form state.
 *
 * Provides:
 * - Form state synchronized with fetched data
 * - Dirty state tracking for unsaved changes
 * - Reset handlers to revert to original values
 * - Increment/decrement helpers for numeric fields
 *
 * @param modalData - Aggregated modal data from BFF endpoint (null while loading)
 * @returns Form state and handlers
 *
 * @example
 * ```tsx
 * function RatingSlipModal({ slipId }: Props) {
 *   const { data, isLoading } = useRatingSlipModalData(slipId);
 *   const {
 *     formState,
 *     isDirty,
 *     updateField,
 *     resetField,
 *     incrementField,
 *     decrementField
 *   } = useModalFormState(data);
 *
 *   return (
 *     <form>
 *       <Input
 *         value={formState.averageBet}
 *         onChange={(e) => updateField('averageBet', e.target.value)}
 *       />
 *       <Button onClick={() => resetField('averageBet')}>Reset</Button>
 *     </form>
 *   );
 * }
 * ```
 */
export function useModalFormState(
  modalData: RatingSlipModalDTO | null | undefined,
) {
  // Initialize form state from modal data
  const [formState, setFormState] = useState<ModalFormState>(() =>
    modalData ? initializeFormState(modalData) : getEmptyFormState(),
  );

  // Track original values for dirty detection
  const [originalState, setOriginalState] = useState<ModalFormState>(() =>
    modalData ? initializeFormState(modalData) : getEmptyFormState(),
  );

  // Sync form state when modal data changes
  useEffect(() => {
    if (modalData) {
      const newState = initializeFormState(modalData);
      setFormState(newState);
      setOriginalState(newState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalData?.slip.id]); // Only reset when slip ID changes, not on every modalData update

  // Check if form has unsaved changes
  const isDirty = JSON.stringify(formState) !== JSON.stringify(originalState);

  // Update a single field
  const updateField = <K extends keyof ModalFormState>(
    field: K,
    value: ModalFormState[K],
  ) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  // Reset a single field to original value
  const resetField = (field: keyof ModalFormState) => {
    setFormState((prev) => ({ ...prev, [field]: originalState[field] }));
  };

  // Reset all fields to original values
  const resetForm = () => {
    setFormState(originalState);
  };

  // Increment numeric field
  const incrementField = (
    field: "averageBet" | "cashIn" | "chipsTaken",
    amount: number,
  ) => {
    setFormState((prev) => {
      const currentValue = Number(prev[field]) || 0;
      return { ...prev, [field]: (currentValue + amount).toString() };
    });
  };

  // Decrement numeric field
  const decrementField = (field: "averageBet" | "cashIn" | "chipsTaken") => {
    setFormState((prev) => {
      const currentValue = Number(prev[field]) || 0;
      return { ...prev, [field]: Math.max(0, currentValue - 1).toString() };
    });
  };

  // Adjust start time by minutes
  const adjustStartTime = (action: "add" | "subtract", minutes: number) => {
    const currentTime = new Date(formState.startTime);
    if (isNaN(currentTime.getTime())) return;

    const newTime = new Date(currentTime);
    if (action === "add") {
      newTime.setMinutes(newTime.getMinutes() + minutes);
    } else {
      newTime.setMinutes(newTime.getMinutes() - minutes);
    }

    const formattedTime = newTime.toISOString().slice(0, 16);
    updateField("startTime", formattedTime);
  };

  return {
    formState,
    isDirty,
    updateField,
    resetField,
    resetForm,
    incrementField,
    decrementField,
    adjustStartTime,
  };
}

/**
 * Initialize form state from modal data.
 */
function initializeFormState(data: RatingSlipModalDTO): ModalFormState {
  return {
    averageBet: data.slip.averageBet.toString(),
    startTime: data.slip.startTime.slice(0, 16), // Convert to datetime-local format
    cashIn: data.financial.totalCashIn.toString(),
    newTableId: data.slip.tableId,
    newSeatNumber: data.slip.seatNumber || "",
    chipsTaken: "0",
  };
}

/**
 * Get empty form state for loading state.
 */
function getEmptyFormState(): ModalFormState {
  return {
    averageBet: "0",
    startTime: "",
    cashIn: "0",
    newTableId: "",
    newSeatNumber: "",
    chipsTaken: "0",
  };
}

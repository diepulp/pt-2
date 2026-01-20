'use client';

import { useShallow } from 'zustand/react/shallow';

import { useRatingSlipModalStore } from '@/store/rating-slip-modal-store';

/**
 * Full selector hook for RatingSlipModalStore with all state and actions.
 * Use field-specific selectors for optimized re-renders in form sections.
 *
 * @returns Complete store interface with all state and actions
 *
 * @example
 * // In modal container - access all state
 * const { slipId, formState, initializeForm, resetForm } = useRatingSlipModal();
 *
 * @see useAverageBetField for field-specific selector
 * @see ZUSTAND_INTEGRATION.md for migration guide
 */
export function useRatingSlipModal() {
  return useRatingSlipModalStore(
    useShallow((state) => ({
      // State
      slipId: state.slipId,
      formState: state.formState,
      originalState: state.originalState,

      // Actions
      setSlipId: state.setSlipId,
      initializeForm: state.initializeForm,
      updateField: state.updateField,
      resetField: state.resetField,
      resetForm: state.resetForm,
      incrementField: state.incrementField,
      decrementField: state.decrementField,
      adjustStartTime: state.adjustStartTime,
    })),
  );
}

/**
 * Field-specific selector for Average Bet form section.
 * Only subscribes to averageBet slice, minimizing re-renders.
 *
 * @returns averageBet value, original value, and related actions
 *
 * @example
 * // In FormSectionAverageBet
 * const { value, originalValue, updateField, resetField, incrementField, decrementField } = useAverageBetField();
 *
 * <Input
 *   value={value}
 *   onChange={(e) => updateField("averageBet", e.target.value)}
 * />
 */
export function useAverageBetField() {
  return useRatingSlipModalStore(
    useShallow((state) => ({
      value: state.formState.averageBet,
      originalValue: state.originalState.averageBet,
      updateField: state.updateField,
      resetField: state.resetField,
      incrementField: state.incrementField,
      decrementField: state.decrementField,
    })),
  );
}

/**
 * Field-specific selector for New Buy-In form section.
 * Only subscribes to newBuyIn slice, minimizing re-renders.
 *
 * @returns newBuyIn value, original value, and related actions
 *
 * @example
 * // In FormSectionCashIn
 * const { value, originalValue, updateField, resetField, incrementField, decrementField } = useNewBuyInField();
 *
 * <Input
 *   value={value}
 *   onChange={(e) => updateField("newBuyIn", e.target.value)}
 * />
 */
export function useNewBuyInField() {
  return useRatingSlipModalStore(
    useShallow((state) => ({
      value: state.formState.newBuyIn,
      originalValue: state.originalState.newBuyIn,
      updateField: state.updateField,
      resetField: state.resetField,
      incrementField: state.incrementField,
      decrementField: state.decrementField,
    })),
  );
}

/**
 * Field-specific selector for Start Time form section.
 * Only subscribes to startTime slice, minimizing re-renders.
 *
 * @returns startTime value, original value, and related actions
 *
 * @example
 * // In FormSectionStartTime
 * const { value, originalValue, updateField, resetField, adjustStartTime } = useStartTimeField();
 *
 * <Input
 *   type="datetime-local"
 *   value={value}
 *   onChange={(e) => updateField("startTime", e.target.value)}
 * />
 */
export function useStartTimeField() {
  return useRatingSlipModalStore(
    useShallow((state) => ({
      value: state.formState.startTime,
      originalValue: state.originalState.startTime,
      updateField: state.updateField,
      resetField: state.resetField,
      adjustStartTime: state.adjustStartTime,
    })),
  );
}

/**
 * Field-specific selector for Move Player form section.
 * Only subscribes to newTableId and newSeatNumber, minimizing re-renders.
 *
 * @returns table and seat values with updateField action
 *
 * @example
 * // In FormSectionMovePlayer
 * const { tableId, seatNumber, updateField } = useMovePlayerFields();
 *
 * <Select
 *   value={tableId}
 *   onValueChange={(value) => updateField("newTableId", value)}
 * />
 */
export function useMovePlayerFields() {
  return useRatingSlipModalStore(
    useShallow((state) => ({
      tableId: state.formState.newTableId,
      seatNumber: state.formState.newSeatNumber,
      updateField: state.updateField,
    })),
  );
}

/**
 * Field-specific selector for Chips Taken form section.
 * Only subscribes to chipsTaken slice, minimizing re-renders.
 *
 * @returns chipsTaken value and related actions
 *
 * @example
 * // In FormSectionChipsTaken
 * const { value, updateField, incrementField, decrementField } = useChipsTakenField();
 *
 * <Input
 *   value={value}
 *   onChange={(e) => updateField("chipsTaken", e.target.value)}
 * />
 */
export function useChipsTakenField() {
  return useRatingSlipModalStore(
    useShallow((state) => ({
      value: state.formState.chipsTaken,
      updateField: state.updateField,
      incrementField: state.incrementField,
      decrementField: state.decrementField,
    })),
  );
}

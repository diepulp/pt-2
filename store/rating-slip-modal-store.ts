'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

/**
 * Modal form state shape for rating slip editing.
 * String values are used for controlled form inputs.
 */
export interface ModalFormState {
  averageBet: string;
  startTime: string;
  newBuyIn: string;
  newTableId: string;
  newSeatNumber: string;
  chipsTaken: string;
}

/**
 * Zustand store interface for Rating Slip Modal.
 * Eliminates prop drilling through 5 form sections.
 *
 * @see ZUSTAND_INTEGRATION.md for migration context
 * @see ADR-003 for state management patterns
 */
export interface RatingSlipModalStore {
  // Identity
  slipId: string | null;

  // State
  formState: ModalFormState;
  originalState: ModalFormState;

  // Actions
  setSlipId: (id: string | null) => void;
  initializeForm: (data: ModalFormState) => void;
  updateField: <K extends keyof ModalFormState>(
    field: K,
    value: ModalFormState[K],
  ) => void;
  resetField: (field: keyof ModalFormState) => void;
  resetForm: () => void;
  incrementField: (
    field: 'averageBet' | 'newBuyIn' | 'chipsTaken',
    amount: number,
  ) => void;
  decrementField: (field: 'averageBet' | 'newBuyIn' | 'chipsTaken') => void;
  adjustStartTime: (action: 'add' | 'subtract', minutes: number) => void;
}

const emptyFormState: ModalFormState = {
  averageBet: '0',
  startTime: '',
  newBuyIn: '0',
  newTableId: '',
  newSeatNumber: '',
  chipsTaken: '0',
};

export const useRatingSlipModalStore = create<RatingSlipModalStore>()(
  devtools(
    (set) => ({
      slipId: null,
      formState: emptyFormState,
      originalState: emptyFormState,

      setSlipId: (id) =>
        set({ slipId: id }, undefined, 'ratingSlipModal/setSlipId'),

      initializeForm: (data) =>
        set(
          { formState: data, originalState: data },
          undefined,
          'ratingSlipModal/initializeForm',
        ),

      updateField: (field, value) =>
        set(
          (state) => ({ formState: { ...state.formState, [field]: value } }),
          undefined,
          `ratingSlipModal/updateField:${String(field)}`,
        ),

      resetField: (field) =>
        set(
          (state) => ({
            formState: {
              ...state.formState,
              [field]: state.originalState[field],
            },
          }),
          undefined,
          `ratingSlipModal/resetField:${String(field)}`,
        ),

      resetForm: () =>
        set(
          (state) => ({ formState: state.originalState }),
          undefined,
          'ratingSlipModal/resetForm',
        ),

      incrementField: (field, amount) =>
        set(
          (state) => {
            const currentValue = Number(state.formState[field]) || 0;
            return {
              formState: {
                ...state.formState,
                [field]: (currentValue + amount).toString(),
              },
            };
          },
          undefined,
          `ratingSlipModal/incrementField:${field}:${amount}`,
        ),

      decrementField: (field) =>
        set(
          (state) => {
            const currentValue = Number(state.formState[field]) || 0;
            return {
              formState: {
                ...state.formState,
                [field]: Math.max(0, currentValue - 1).toString(),
              },
            };
          },
          undefined,
          `ratingSlipModal/decrementField:${field}`,
        ),

      adjustStartTime: (action, minutes) =>
        set(
          (state) => {
            const currentTime = new Date(state.formState.startTime);
            if (isNaN(currentTime.getTime())) return state;

            const newTime = new Date(currentTime);
            if (action === 'add') {
              newTime.setMinutes(newTime.getMinutes() + minutes);
            } else {
              newTime.setMinutes(newTime.getMinutes() - minutes);
            }

            return {
              formState: {
                ...state.formState,
                startTime: newTime.toISOString().slice(0, 16),
              },
            };
          },
          undefined,
          `ratingSlipModal/adjustStartTime:${action}:${minutes}`,
        ),
    }),
    { name: 'RatingSlipModalStore' },
  ),
);

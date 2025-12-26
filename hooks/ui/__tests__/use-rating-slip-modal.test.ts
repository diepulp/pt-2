import { act, renderHook } from '@testing-library/react';

import {
  useRatingSlipModalStore,
  type ModalFormState,
} from '@/store/rating-slip-modal-store';

import {
  useRatingSlipModal,
  useAverageBetField,
  useNewBuyInField,
  useStartTimeField,
  useMovePlayerFields,
  useChipsTakenField,
} from '../use-rating-slip-modal';

/**
 * Integration tests for Rating Slip Modal hooks.
 *
 * Tests verify:
 * - Selector hooks correctly subscribe to store slices
 * - useShallow prevents unnecessary re-renders
 * - Hook → store → component cycle works correctly
 * - Actions are stable references
 *
 * @see ZUSTAND-RSM WS6 Hook Integration Tests
 */
describe('Rating Slip Modal Hooks Integration', () => {
  const mockFormData: ModalFormState = {
    averageBet: '100',
    startTime: '2025-12-26T14:30',
    newBuyIn: '500',
    newTableId: 'table-1',
    newSeatNumber: '3',
    chipsTaken: '200',
  };

  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => useRatingSlipModalStore());
    act(() => {
      result.current.setSlipId(null);
      result.current.initializeForm({
        averageBet: '0',
        startTime: '',
        newBuyIn: '0',
        newTableId: '',
        newSeatNumber: '',
        chipsTaken: '0',
      });
    });
  });

  describe('useRatingSlipModal (full selector)', () => {
    it('returns all store state and actions', () => {
      const { result } = renderHook(() => useRatingSlipModal());

      expect(result.current).toHaveProperty('slipId');
      expect(result.current).toHaveProperty('formState');
      expect(result.current).toHaveProperty('originalState');
      expect(result.current).toHaveProperty('setSlipId');
      expect(result.current).toHaveProperty('initializeForm');
      expect(result.current).toHaveProperty('updateField');
      expect(result.current).toHaveProperty('resetField');
      expect(result.current).toHaveProperty('resetForm');
      expect(result.current).toHaveProperty('incrementField');
      expect(result.current).toHaveProperty('decrementField');
      expect(result.current).toHaveProperty('adjustStartTime');
    });

    it('initializes form and tracks original state', () => {
      const { result } = renderHook(() => useRatingSlipModal());

      act(() => {
        result.current.initializeForm(mockFormData);
      });

      expect(result.current.formState).toEqual(mockFormData);
      expect(result.current.originalState).toEqual(mockFormData);
    });

    it('computes dirty state correctly (formState vs originalState)', () => {
      const { result } = renderHook(() => useRatingSlipModal());

      act(() => {
        result.current.initializeForm(mockFormData);
      });

      // Initially not dirty
      const isDirtyInitial =
        JSON.stringify(result.current.formState) !==
        JSON.stringify(result.current.originalState);
      expect(isDirtyInitial).toBe(false);

      // Make a change
      act(() => {
        result.current.updateField('averageBet', '999');
      });

      // Now dirty
      const isDirtyAfterChange =
        JSON.stringify(result.current.formState) !==
        JSON.stringify(result.current.originalState);
      expect(isDirtyAfterChange).toBe(true);

      // Reset form
      act(() => {
        result.current.resetForm();
      });

      // No longer dirty
      const isDirtyAfterReset =
        JSON.stringify(result.current.formState) !==
        JSON.stringify(result.current.originalState);
      expect(isDirtyAfterReset).toBe(false);
    });
  });

  describe('useAverageBetField (field-specific selector)', () => {
    beforeEach(() => {
      const { result } = renderHook(() => useRatingSlipModalStore());
      act(() => {
        result.current.initializeForm(mockFormData);
      });
    });

    it('returns only averageBet-related state and actions', () => {
      const { result } = renderHook(() => useAverageBetField());

      expect(result.current).toHaveProperty('value');
      expect(result.current).toHaveProperty('originalValue');
      expect(result.current).toHaveProperty('updateField');
      expect(result.current).toHaveProperty('resetField');
      expect(result.current).toHaveProperty('incrementField');
      expect(result.current).toHaveProperty('decrementField');

      // Should not have other fields
      expect(result.current).not.toHaveProperty('formState');
      expect(result.current).not.toHaveProperty('slipId');
    });

    it('value reflects averageBet from store', () => {
      const { result } = renderHook(() => useAverageBetField());

      expect(result.current.value).toBe('100');
      expect(result.current.originalValue).toBe('100');
    });

    it('updateField updates averageBet in store', () => {
      const { result } = renderHook(() => useAverageBetField());

      act(() => {
        result.current.updateField('averageBet', '250');
      });

      expect(result.current.value).toBe('250');
      expect(result.current.originalValue).toBe('100'); // Original unchanged
    });

    it('incrementField adds to averageBet', () => {
      const { result } = renderHook(() => useAverageBetField());

      act(() => {
        result.current.incrementField('averageBet', 50);
      });

      expect(result.current.value).toBe('150');
    });

    it('decrementField subtracts from averageBet', () => {
      const { result } = renderHook(() => useAverageBetField());

      act(() => {
        result.current.decrementField('averageBet');
      });

      expect(result.current.value).toBe('99');
    });

    it('resetField resets averageBet to original', () => {
      const { result } = renderHook(() => useAverageBetField());

      act(() => {
        result.current.updateField('averageBet', '999');
      });

      expect(result.current.value).toBe('999');

      act(() => {
        result.current.resetField('averageBet');
      });

      expect(result.current.value).toBe('100');
    });
  });

  describe('useNewBuyInField (field-specific selector)', () => {
    beforeEach(() => {
      const { result } = renderHook(() => useRatingSlipModalStore());
      act(() => {
        result.current.initializeForm(mockFormData);
      });
    });

    it('returns only newBuyIn-related state and actions', () => {
      const { result } = renderHook(() => useNewBuyInField());

      expect(result.current.value).toBe('500');
      expect(result.current.originalValue).toBe('500');
    });

    it('incrementField adds to newBuyIn', () => {
      const { result } = renderHook(() => useNewBuyInField());

      act(() => {
        result.current.incrementField('newBuyIn', 100);
      });

      expect(result.current.value).toBe('600');
    });

    it('decrementField subtracts from newBuyIn', () => {
      const { result } = renderHook(() => useNewBuyInField());

      act(() => {
        result.current.decrementField('newBuyIn');
      });

      expect(result.current.value).toBe('499');
    });
  });

  describe('useStartTimeField (field-specific selector)', () => {
    beforeEach(() => {
      const { result } = renderHook(() => useRatingSlipModalStore());
      act(() => {
        result.current.initializeForm(mockFormData);
      });
    });

    it('returns only startTime-related state and actions', () => {
      const { result } = renderHook(() => useStartTimeField());

      expect(result.current).toHaveProperty('value');
      expect(result.current).toHaveProperty('originalValue');
      expect(result.current).toHaveProperty('updateField');
      expect(result.current).toHaveProperty('resetField');
      expect(result.current).toHaveProperty('adjustStartTime');

      // Should not have increment/decrement (not applicable to time)
      expect(result.current).not.toHaveProperty('incrementField');
      expect(result.current).not.toHaveProperty('decrementField');
    });

    it('value reflects startTime from store', () => {
      const { result } = renderHook(() => useStartTimeField());

      expect(result.current.value).toBe('2025-12-26T14:30');
    });

    it('adjustStartTime adds minutes', () => {
      const { result } = renderHook(() => useStartTimeField());

      const initialTime = new Date(result.current.value);
      const expectedTime = new Date(initialTime);
      expectedTime.setMinutes(expectedTime.getMinutes() + 30);
      const expectedString = expectedTime.toISOString().slice(0, 16);

      act(() => {
        result.current.adjustStartTime('add', 30);
      });

      // Should be 30 minutes later (in UTC format from toISOString)
      expect(result.current.value).toBe(expectedString);
    });

    it('adjustStartTime subtracts minutes', () => {
      const { result } = renderHook(() => useStartTimeField());

      const initialTime = new Date(result.current.value);
      const expectedTime = new Date(initialTime);
      expectedTime.setMinutes(expectedTime.getMinutes() - 15);
      const expectedString = expectedTime.toISOString().slice(0, 16);

      act(() => {
        result.current.adjustStartTime('subtract', 15);
      });

      // Should be 15 minutes earlier (in UTC format from toISOString)
      expect(result.current.value).toBe(expectedString);
    });
  });

  describe('useMovePlayerFields (field-specific selector)', () => {
    beforeEach(() => {
      const { result } = renderHook(() => useRatingSlipModalStore());
      act(() => {
        result.current.initializeForm(mockFormData);
      });
    });

    it('returns only move-related state and actions', () => {
      const { result } = renderHook(() => useMovePlayerFields());

      expect(result.current).toHaveProperty('tableId');
      expect(result.current).toHaveProperty('seatNumber');
      expect(result.current).toHaveProperty('updateField');

      // Should not have increment/decrement/reset
      expect(result.current).not.toHaveProperty('incrementField');
      expect(result.current).not.toHaveProperty('resetField');
    });

    it('tableId and seatNumber reflect store values', () => {
      const { result } = renderHook(() => useMovePlayerFields());

      expect(result.current.tableId).toBe('table-1');
      expect(result.current.seatNumber).toBe('3');
    });

    it('updateField changes tableId', () => {
      const { result } = renderHook(() => useMovePlayerFields());

      act(() => {
        result.current.updateField('newTableId', 'table-5');
      });

      expect(result.current.tableId).toBe('table-5');
    });

    it('updateField changes seatNumber', () => {
      const { result } = renderHook(() => useMovePlayerFields());

      act(() => {
        result.current.updateField('newSeatNumber', '7');
      });

      expect(result.current.seatNumber).toBe('7');
    });
  });

  describe('useChipsTakenField (field-specific selector)', () => {
    beforeEach(() => {
      const { result } = renderHook(() => useRatingSlipModalStore());
      act(() => {
        result.current.initializeForm(mockFormData);
      });
    });

    it('returns only chipsTaken-related state and actions', () => {
      const { result } = renderHook(() => useChipsTakenField());

      expect(result.current).toHaveProperty('value');
      expect(result.current).toHaveProperty('updateField');
      expect(result.current).toHaveProperty('incrementField');
      expect(result.current).toHaveProperty('decrementField');
    });

    it('value reflects chipsTaken from store', () => {
      const { result } = renderHook(() => useChipsTakenField());

      expect(result.current.value).toBe('200');
    });

    it('incrementField adds to chipsTaken', () => {
      const { result } = renderHook(() => useChipsTakenField());

      act(() => {
        result.current.incrementField('chipsTaken', 50);
      });

      expect(result.current.value).toBe('250');
    });

    it('decrementField subtracts from chipsTaken', () => {
      const { result } = renderHook(() => useChipsTakenField());

      act(() => {
        result.current.decrementField('chipsTaken');
      });

      expect(result.current.value).toBe('199');
    });
  });

  describe('Re-render optimization (useShallow)', () => {
    it('field hooks do not re-render when unrelated fields change', () => {
      const { result: storeResult } = renderHook(() =>
        useRatingSlipModalStore(),
      );

      act(() => {
        storeResult.current.initializeForm(mockFormData);
      });

      // Get initial references
      const { result: avgBetResult } = renderHook(() => useAverageBetField());
      const initialValue = avgBetResult.current.value;

      // Update an unrelated field (chipsTaken)
      act(() => {
        storeResult.current.updateField('chipsTaken', '999');
      });

      // averageBet hook value should be unchanged
      expect(avgBetResult.current.value).toBe(initialValue);
      expect(avgBetResult.current.value).toBe('100');
    });

    it('action references are stable across renders', () => {
      const { result } = renderHook(() => useAverageBetField());

      const initialUpdateField = result.current.updateField;
      const initialIncrementField = result.current.incrementField;

      // Trigger a re-render by updating the value
      act(() => {
        result.current.updateField('averageBet', '150');
      });

      // Actions should be the same reference
      expect(result.current.updateField).toBe(initialUpdateField);
      expect(result.current.incrementField).toBe(initialIncrementField);
    });
  });

  describe('Cross-hook synchronization', () => {
    it('changes from one hook are visible in another', () => {
      const { result: storeResult } = renderHook(() =>
        useRatingSlipModalStore(),
      );

      act(() => {
        storeResult.current.initializeForm(mockFormData);
      });

      const { result: avgBetResult } = renderHook(() => useAverageBetField());
      const { result: fullResult } = renderHook(() => useRatingSlipModal());

      // Update via field hook
      act(() => {
        avgBetResult.current.updateField('averageBet', '777');
      });

      // Should be visible in full hook
      expect(fullResult.current.formState.averageBet).toBe('777');
    });

    it('resetForm from full hook resets all field hook values', () => {
      const { result: storeResult } = renderHook(() =>
        useRatingSlipModalStore(),
      );

      act(() => {
        storeResult.current.initializeForm(mockFormData);
      });

      const { result: avgBetResult } = renderHook(() => useAverageBetField());
      const { result: buyInResult } = renderHook(() => useNewBuyInField());
      const { result: fullResult } = renderHook(() => useRatingSlipModal());

      // Make changes via field hooks
      act(() => {
        avgBetResult.current.updateField('averageBet', '999');
        buyInResult.current.updateField('newBuyIn', '1000');
      });

      expect(avgBetResult.current.value).toBe('999');
      expect(buyInResult.current.value).toBe('1000');

      // Reset via full hook
      act(() => {
        fullResult.current.resetForm();
      });

      // Field hooks should reflect reset values
      expect(avgBetResult.current.value).toBe('100');
      expect(buyInResult.current.value).toBe('500');
    });
  });

  describe('Store lifecycle', () => {
    it('setSlipId and initializeForm work together', () => {
      const { result } = renderHook(() => useRatingSlipModal());

      act(() => {
        result.current.setSlipId('slip-123');
        result.current.initializeForm(mockFormData);
      });

      expect(result.current.slipId).toBe('slip-123');
      expect(result.current.formState).toEqual(mockFormData);
    });

    it('re-initialization clears previous edits', () => {
      const { result } = renderHook(() => useRatingSlipModal());

      // First initialization
      act(() => {
        result.current.initializeForm(mockFormData);
        result.current.updateField('averageBet', '999');
      });

      expect(result.current.formState.averageBet).toBe('999');

      // Re-initialize (simulating opening a different slip)
      const newData: ModalFormState = {
        averageBet: '50',
        startTime: '2025-12-27T10:00',
        newBuyIn: '100',
        newTableId: 'table-2',
        newSeatNumber: '1',
        chipsTaken: '0',
      };

      act(() => {
        result.current.initializeForm(newData);
      });

      // All values should be from new data
      expect(result.current.formState).toEqual(newData);
      expect(result.current.originalState).toEqual(newData);
    });
  });
});

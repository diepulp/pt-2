import { act, renderHook } from '@testing-library/react';

import {
  useRatingSlipModalStore,
  RATING_SLIP_MODAL_INITIAL_STATE,
  type ModalFormState,
} from '@/store/rating-slip-modal-store';

describe('RatingSlipModalStore', () => {
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

  describe('initial state', () => {
    it('initializes with null slipId', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());
      expect(result.current.slipId).toBe(null);
    });

    it('initializes with empty form state', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());
      expect(result.current.formState).toEqual({
        averageBet: '0',
        startTime: '',
        newBuyIn: '0',
        newTableId: '',
        newSeatNumber: '',
        chipsTaken: '0',
      });
    });

    it('initializes with empty original state', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());
      expect(result.current.originalState).toEqual({
        averageBet: '0',
        startTime: '',
        newBuyIn: '0',
        newTableId: '',
        newSeatNumber: '',
        chipsTaken: '0',
      });
    });
  });

  describe('setSlipId action', () => {
    it('sets slip ID to a valid string', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.setSlipId('slip-123');
      });

      expect(result.current.slipId).toBe('slip-123');
    });

    it('clears slip ID when set to null', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      // First set a slip ID
      act(() => {
        result.current.setSlipId('slip-456');
      });

      // Then clear it
      act(() => {
        result.current.setSlipId(null);
      });

      expect(result.current.slipId).toBe(null);
    });

    it('replaces previous slip ID with new one', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.setSlipId('slip-old');
      });

      act(() => {
        result.current.setSlipId('slip-new');
      });

      expect(result.current.slipId).toBe('slip-new');
    });
  });

  describe('initializeForm action', () => {
    it('sets both formState and originalState to provided data', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.initializeForm(mockFormData);
      });

      expect(result.current.formState).toEqual(mockFormData);
      expect(result.current.originalState).toEqual(mockFormData);
    });

    it('overwrites previous form state', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      const firstData: ModalFormState = {
        averageBet: '50',
        startTime: '2025-12-25T10:00',
        newBuyIn: '300',
        newTableId: 'table-2',
        newSeatNumber: '1',
        chipsTaken: '100',
      };

      act(() => {
        result.current.initializeForm(firstData);
      });

      act(() => {
        result.current.initializeForm(mockFormData);
      });

      expect(result.current.formState).toEqual(mockFormData);
      expect(result.current.originalState).toEqual(mockFormData);
    });
  });

  describe('updateField action', () => {
    beforeEach(() => {
      const { result } = renderHook(() => useRatingSlipModalStore());
      act(() => {
        result.current.initializeForm(mockFormData);
      });
    });

    it('updates averageBet field', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.updateField('averageBet', '250');
      });

      expect(result.current.formState.averageBet).toBe('250');
      expect(result.current.originalState.averageBet).toBe('100'); // Original unchanged
    });

    it('updates startTime field', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.updateField('startTime', '2025-12-26T16:00');
      });

      expect(result.current.formState.startTime).toBe('2025-12-26T16:00');
      expect(result.current.originalState.startTime).toBe('2025-12-26T14:30');
    });

    it('updates newBuyIn field', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.updateField('newBuyIn', '1000');
      });

      expect(result.current.formState.newBuyIn).toBe('1000');
      expect(result.current.originalState.newBuyIn).toBe('500');
    });

    it('updates newTableId field', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.updateField('newTableId', 'table-5');
      });

      expect(result.current.formState.newTableId).toBe('table-5');
      expect(result.current.originalState.newTableId).toBe('table-1');
    });

    it('updates newSeatNumber field', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.updateField('newSeatNumber', '7');
      });

      expect(result.current.formState.newSeatNumber).toBe('7');
      expect(result.current.originalState.newSeatNumber).toBe('3');
    });

    it('updates chipsTaken field', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.updateField('chipsTaken', '350');
      });

      expect(result.current.formState.chipsTaken).toBe('350');
      expect(result.current.originalState.chipsTaken).toBe('200');
    });

    it('preserves other fields when updating one field', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.updateField('averageBet', '999');
      });

      expect(result.current.formState.newTableId).toBe('table-1');
      expect(result.current.formState.newSeatNumber).toBe('3');
      expect(result.current.formState.chipsTaken).toBe('200');
    });
  });

  describe('resetField action', () => {
    beforeEach(() => {
      const { result } = renderHook(() => useRatingSlipModalStore());
      act(() => {
        result.current.initializeForm(mockFormData);
        // Make some changes
        result.current.updateField('averageBet', '999');
        result.current.updateField('newTableId', 'table-changed');
        result.current.updateField('chipsTaken', '0');
      });
    });

    it('resets averageBet to original value', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.resetField('averageBet');
      });

      expect(result.current.formState.averageBet).toBe('100');
    });

    it('resets newTableId to original value', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.resetField('newTableId');
      });

      expect(result.current.formState.newTableId).toBe('table-1');
    });

    it('resets chipsTaken to original value', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.resetField('chipsTaken');
      });

      expect(result.current.formState.chipsTaken).toBe('200');
    });

    it('preserves other fields when resetting one field', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.resetField('averageBet');
      });

      expect(result.current.formState.newTableId).toBe('table-changed');
      expect(result.current.formState.chipsTaken).toBe('0');
    });
  });

  describe('resetForm action', () => {
    it('resets entire form to original state', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.initializeForm(mockFormData);
      });

      // Make multiple changes
      act(() => {
        result.current.updateField('averageBet', '999');
        result.current.updateField('newTableId', 'table-changed');
        result.current.updateField('chipsTaken', '0');
        result.current.updateField('startTime', '2025-12-27T10:00');
      });

      // Reset entire form
      act(() => {
        result.current.resetForm();
      });

      expect(result.current.formState).toEqual(mockFormData);
    });

    it('does not modify originalState', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.initializeForm(mockFormData);
        result.current.updateField('averageBet', '999');
        result.current.resetForm();
      });

      expect(result.current.originalState).toEqual(mockFormData);
    });
  });

  describe('incrementField action', () => {
    beforeEach(() => {
      const { result } = renderHook(() => useRatingSlipModalStore());
      act(() => {
        result.current.initializeForm(mockFormData);
      });
    });

    it('increments averageBet by specified amount', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.incrementField('averageBet', 50);
      });

      expect(result.current.formState.averageBet).toBe('150');
    });

    it('increments newBuyIn by specified amount', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.incrementField('newBuyIn', 100);
      });

      expect(result.current.formState.newBuyIn).toBe('600');
    });

    it('increments chipsTaken by specified amount', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.incrementField('chipsTaken', 25);
      });

      expect(result.current.formState.chipsTaken).toBe('225');
    });

    it('handles multiple increments cumulatively', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.incrementField('averageBet', 10);
        result.current.incrementField('averageBet', 20);
        result.current.incrementField('averageBet', 30);
      });

      expect(result.current.formState.averageBet).toBe('160');
    });

    it('handles increment from zero-string value', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.updateField('averageBet', '0');
        result.current.incrementField('averageBet', 75);
      });

      expect(result.current.formState.averageBet).toBe('75');
    });

    it('handles increment from non-numeric string (treats as 0)', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.updateField('averageBet', 'invalid');
        result.current.incrementField('averageBet', 50);
      });

      expect(result.current.formState.averageBet).toBe('50');
    });

    it('preserves other fields when incrementing', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.incrementField('averageBet', 25);
      });

      expect(result.current.formState.newBuyIn).toBe('500');
      expect(result.current.formState.chipsTaken).toBe('200');
    });
  });

  describe('decrementField action', () => {
    beforeEach(() => {
      const { result } = renderHook(() => useRatingSlipModalStore());
      act(() => {
        result.current.initializeForm(mockFormData);
      });
    });

    it('decrements averageBet by 1', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.decrementField('averageBet');
      });

      expect(result.current.formState.averageBet).toBe('99');
    });

    it('decrements newBuyIn by 1', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.decrementField('newBuyIn');
      });

      expect(result.current.formState.newBuyIn).toBe('499');
    });

    it('decrements chipsTaken by 1', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.decrementField('chipsTaken');
      });

      expect(result.current.formState.chipsTaken).toBe('199');
    });

    it('does not decrement below zero (minimum constraint)', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.updateField('averageBet', '0');
        result.current.decrementField('averageBet');
      });

      expect(result.current.formState.averageBet).toBe('0');
    });

    it('handles multiple decrements cumulatively', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.decrementField('averageBet');
        result.current.decrementField('averageBet');
        result.current.decrementField('averageBet');
      });

      expect(result.current.formState.averageBet).toBe('97');
    });

    it('stops at zero when decrementing from 1', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.updateField('chipsTaken', '1');
        result.current.decrementField('chipsTaken');
      });

      expect(result.current.formState.chipsTaken).toBe('0');
    });

    it('handles decrement from non-numeric string (treats as 0)', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.updateField('averageBet', 'invalid');
        result.current.decrementField('averageBet');
      });

      expect(result.current.formState.averageBet).toBe('0');
    });

    it('preserves other fields when decrementing', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.decrementField('averageBet');
      });

      expect(result.current.formState.newBuyIn).toBe('500');
      expect(result.current.formState.chipsTaken).toBe('200');
    });
  });

  describe('adjustStartTime action', () => {
    beforeEach(() => {
      const { result } = renderHook(() => useRatingSlipModalStore());
      act(() => {
        result.current.initializeForm(mockFormData);
      });
    });

    it('adds minutes to start time', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      const initialTime = new Date(mockFormData.startTime);
      const expectedTime = new Date(initialTime);
      expectedTime.setMinutes(expectedTime.getMinutes() + 30);
      const expectedString = expectedTime.toISOString().slice(0, 16);

      act(() => {
        result.current.adjustStartTime('add', 30);
      });

      expect(result.current.formState.startTime).toBe(expectedString);
    });

    it('subtracts minutes from start time', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      const initialTime = new Date(mockFormData.startTime);
      const expectedTime = new Date(initialTime);
      expectedTime.setMinutes(expectedTime.getMinutes() - 15);
      const expectedString = expectedTime.toISOString().slice(0, 16);

      act(() => {
        result.current.adjustStartTime('subtract', 15);
      });

      expect(result.current.formState.startTime).toBe(expectedString);
    });

    it('handles adding multiple hours', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      const initialTime = new Date(mockFormData.startTime);
      const expectedTime = new Date(initialTime);
      expectedTime.setMinutes(expectedTime.getMinutes() + 120); // 2 hours
      const expectedString = expectedTime.toISOString().slice(0, 16);

      act(() => {
        result.current.adjustStartTime('add', 120); // 2 hours
      });

      expect(result.current.formState.startTime).toBe(expectedString);
    });

    it('handles subtracting minutes', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      const testTime = '2025-12-26T00:15';
      const initialTime = new Date(testTime);
      const expectedTime = new Date(initialTime);
      expectedTime.setMinutes(expectedTime.getMinutes() - 30);
      const expectedString = expectedTime.toISOString().slice(0, 16);

      act(() => {
        result.current.updateField('startTime', testTime);
        result.current.adjustStartTime('subtract', 30);
      });

      expect(result.current.formState.startTime).toBe(expectedString);
    });

    it('handles adding minutes across hour boundaries', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      const testTime = '2025-12-26T23:45';
      const initialTime = new Date(testTime);
      const expectedTime = new Date(initialTime);
      expectedTime.setMinutes(expectedTime.getMinutes() + 30);
      const expectedString = expectedTime.toISOString().slice(0, 16);

      act(() => {
        result.current.updateField('startTime', testTime);
        result.current.adjustStartTime('add', 30);
      });

      expect(result.current.formState.startTime).toBe(expectedString);
    });

    it('does nothing when startTime is invalid', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.updateField('startTime', 'invalid-date');
        result.current.adjustStartTime('add', 30);
      });

      expect(result.current.formState.startTime).toBe('invalid-date');
    });

    it('does nothing when startTime is empty', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.updateField('startTime', '');
        result.current.adjustStartTime('add', 30);
      });

      expect(result.current.formState.startTime).toBe('');
    });

    it('handles cumulative time adjustments', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      // Start with a known ISO time
      const baseTime = '2025-12-26T12:00';
      act(() => {
        result.current.updateField('startTime', baseTime);
      });

      // Apply three sequential adjustments
      act(() => {
        result.current.adjustStartTime('add', 15);
      });
      const afterFirst = result.current.formState.startTime;

      act(() => {
        result.current.adjustStartTime('add', 10);
      });
      const afterSecond = result.current.formState.startTime;

      act(() => {
        result.current.adjustStartTime('subtract', 5);
      });
      const final = result.current.formState.startTime;

      // Verify each adjustment changed the value
      expect(afterFirst).not.toBe(baseTime);
      expect(afterSecond).not.toBe(afterFirst);
      expect(final).not.toBe(afterSecond);

      // Verify all results are valid datetime strings
      expect(afterFirst).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      expect(afterSecond).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      expect(final).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

      // Verify the adjustments are working (final should differ from base)
      expect(final).not.toBe(baseTime);
    });

    it('preserves other fields when adjusting time', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.adjustStartTime('add', 30);
      });

      expect(result.current.formState.averageBet).toBe('100');
      expect(result.current.formState.newBuyIn).toBe('500');
      expect(result.current.formState.chipsTaken).toBe('200');
    });
  });

  describe('resetSession()', () => {
    it('should reset slipId, formState, and originalState to RATING_SLIP_MODAL_INITIAL_STATE', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      // Initialize form with mock data and set slipId
      act(() => {
        result.current.setSlipId('slip-dirty-789');
        result.current.initializeForm(mockFormData);
        result.current.updateField('averageBet', '999');
      });

      expect(result.current.slipId).toBe('slip-dirty-789');
      expect(result.current.formState.averageBet).toBe('999');

      // Reset
      act(() => {
        result.current.resetSession();
      });

      // Verify slipId is null
      expect(result.current.slipId).toBe(
        RATING_SLIP_MODAL_INITIAL_STATE.slipId,
      );

      // Verify formState matches emptyFormState
      expect(result.current.formState).toEqual(
        RATING_SLIP_MODAL_INITIAL_STATE.formState,
      );

      // Verify originalState matches emptyFormState
      expect(result.current.originalState).toEqual(
        RATING_SLIP_MODAL_INITIAL_STATE.originalState,
      );
    });

    it('should differ from resetForm() which resets to originalState, not emptyFormState', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      // Initialize with non-empty data and make edits
      act(() => {
        result.current.initializeForm(mockFormData);
        result.current.updateField('averageBet', '999');
      });

      // resetForm() resets formState back to originalState (mockFormData), not empty
      act(() => {
        result.current.resetForm();
      });
      expect(result.current.formState).toEqual(mockFormData);
      expect(result.current.originalState).toEqual(mockFormData);

      // resetSession() resets ALL the way to emptyFormState
      act(() => {
        result.current.resetSession();
      });
      expect(result.current.formState).toEqual(
        RATING_SLIP_MODAL_INITIAL_STATE.formState,
      );
      expect(result.current.originalState).toEqual(
        RATING_SLIP_MODAL_INITIAL_STATE.originalState,
      );
    });
  });

  describe('devtools integration', () => {
    it('store is defined and accessible', () => {
      const store = useRatingSlipModalStore;
      expect(store).toBeDefined();
    });

    it('all actions work correctly', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      const initialTime = new Date(mockFormData.startTime);
      const expectedTime = new Date(initialTime);
      expectedTime.setMinutes(expectedTime.getMinutes() + 15);
      const expectedString = expectedTime.toISOString().slice(0, 16);

      act(() => {
        result.current.setSlipId('slip-test');
        result.current.initializeForm(mockFormData);
        result.current.updateField('averageBet', '150');
        result.current.incrementField('newBuyIn', 100);
        result.current.decrementField('chipsTaken');
        result.current.adjustStartTime('add', 15);
      });

      expect(result.current.slipId).toBe('slip-test');
      expect(result.current.formState.averageBet).toBe('150');
      expect(result.current.formState.newBuyIn).toBe('600');
      expect(result.current.formState.chipsTaken).toBe('199');
      expect(result.current.formState.startTime).toBe(expectedString);
    });
  });

  describe('complex workflows', () => {
    it('handles full edit-and-reset workflow', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      const initialTime = new Date(mockFormData.startTime);
      const expectedTime = new Date(initialTime);
      expectedTime.setMinutes(expectedTime.getMinutes() + 60);
      const expectedString = expectedTime.toISOString().slice(0, 16);

      // Initialize
      act(() => {
        result.current.setSlipId('slip-workflow');
        result.current.initializeForm(mockFormData);
      });

      // Make changes
      act(() => {
        result.current.updateField('averageBet', '999');
        result.current.incrementField('newBuyIn', 500);
        result.current.adjustStartTime('add', 60);
      });

      // Verify changes
      expect(result.current.formState.averageBet).toBe('999');
      expect(result.current.formState.newBuyIn).toBe('1000');
      expect(result.current.formState.startTime).toBe(expectedString);

      // Reset form
      act(() => {
        result.current.resetForm();
      });

      // Verify reset
      expect(result.current.formState).toEqual(mockFormData);
      expect(result.current.slipId).toBe('slip-workflow'); // ID preserved
    });

    it('handles partial field resets', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      act(() => {
        result.current.initializeForm(mockFormData);
        result.current.updateField('averageBet', '999');
        result.current.updateField('newTableId', 'table-changed');
        result.current.updateField('chipsTaken', '0');
      });

      // Reset only one field
      act(() => {
        result.current.resetField('averageBet');
      });

      expect(result.current.formState.averageBet).toBe('100'); // Reset
      expect(result.current.formState.newTableId).toBe('table-changed'); // Unchanged
      expect(result.current.formState.chipsTaken).toBe('0'); // Unchanged
    });

    it('handles re-initialization while editing', () => {
      const { result } = renderHook(() => useRatingSlipModalStore());

      const newData: ModalFormState = {
        averageBet: '200',
        startTime: '2025-12-27T10:00',
        newBuyIn: '750',
        newTableId: 'table-3',
        newSeatNumber: '5',
        chipsTaken: '300',
      };

      // Initial state
      act(() => {
        result.current.initializeForm(mockFormData);
        result.current.updateField('averageBet', '999');
      });

      // Re-initialize (simulating opening a different slip)
      act(() => {
        result.current.initializeForm(newData);
      });

      expect(result.current.formState).toEqual(newData);
      expect(result.current.originalState).toEqual(newData);
    });
  });
});

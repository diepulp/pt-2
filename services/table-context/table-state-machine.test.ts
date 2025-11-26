import {
  createTableStateMachine,
  mapStateToDbStatus,
  mapDbStatusToState,
  isValidTransition,
  getNextStates,
  type TableState,
  type TableEvent,
} from './table-state-machine';

describe('Table State Machine', () => {
  describe('createTableStateMachine', () => {
    it('initializes with the given state', () => {
      const machine = createTableStateMachine('closed');
      expect(machine.currentState).toBe('closed');
    });

    it('transitions from closed to open via OPEN_TABLE', () => {
      const machine = createTableStateMachine('closed');
      const newState = machine.transition({ type: 'OPEN_TABLE' });
      expect(newState).toBe('open');
      expect(machine.currentState).toBe('open');
    });

    it('transitions from closed to reserved via RESERVE', () => {
      const machine = createTableStateMachine('closed');
      const newState = machine.transition({ type: 'RESERVE' });
      expect(newState).toBe('reserved');
    });

    it('transitions from open to break via START_BREAK', () => {
      const machine = createTableStateMachine('open');
      const newState = machine.transition({ type: 'START_BREAK' });
      expect(newState).toBe('break');
    });

    it('transitions from break to open via END_BREAK', () => {
      const machine = createTableStateMachine('break');
      const newState = machine.transition({ type: 'END_BREAK' });
      expect(newState).toBe('open');
    });

    it('transitions from break to closed via CLOSE_TABLE', () => {
      const machine = createTableStateMachine('break');
      const newState = machine.transition({ type: 'CLOSE_TABLE' });
      expect(newState).toBe('closed');
    });

    it('transitions from open to closed via CLOSE_TABLE', () => {
      const machine = createTableStateMachine('open');
      const newState = machine.transition({ type: 'CLOSE_TABLE' });
      expect(newState).toBe('closed');
    });

    it('transitions from reserved to closed via UNRESERVE', () => {
      const machine = createTableStateMachine('reserved');
      const newState = machine.transition({ type: 'UNRESERVE' });
      expect(newState).toBe('closed');
    });

    it('transitions from reserved to open via OPEN_TABLE', () => {
      const machine = createTableStateMachine('reserved');
      const newState = machine.transition({ type: 'OPEN_TABLE' });
      expect(newState).toBe('open');
    });

    it('throws error for invalid transition', () => {
      const machine = createTableStateMachine('closed');
      expect(() => machine.transition({ type: 'CLOSE_TABLE' })).toThrow(
        'Invalid transition: CLOSE_TABLE from state closed'
      );
    });

    it('throws error when trying to START_BREAK from closed', () => {
      const machine = createTableStateMachine('closed');
      expect(() => machine.transition({ type: 'START_BREAK' })).toThrow(
        'Invalid transition: START_BREAK from state closed'
      );
    });

    it('throws error when trying to END_BREAK from open', () => {
      const machine = createTableStateMachine('open');
      expect(() => machine.transition({ type: 'END_BREAK' })).toThrow(
        'Invalid transition: END_BREAK from state open'
      );
    });
  });

  describe('canTransition', () => {
    it('returns true for valid transitions', () => {
      const machine = createTableStateMachine('closed');
      expect(machine.canTransition({ type: 'OPEN_TABLE' })).toBe(true);
      expect(machine.canTransition({ type: 'RESERVE' })).toBe(true);
    });

    it('returns false for invalid transitions', () => {
      const machine = createTableStateMachine('closed');
      expect(machine.canTransition({ type: 'CLOSE_TABLE' })).toBe(false);
      expect(machine.canTransition({ type: 'START_BREAK' })).toBe(false);
      expect(machine.canTransition({ type: 'END_BREAK' })).toBe(false);
    });
  });

  describe('getValidEvents', () => {
    it('returns valid events for closed state', () => {
      const machine = createTableStateMachine('closed');
      const events = machine.getValidEvents();
      expect(events).toContain('OPEN_TABLE');
      expect(events).toContain('RESERVE');
      expect(events).toHaveLength(2);
    });

    it('returns valid events for open state', () => {
      const machine = createTableStateMachine('open');
      const events = machine.getValidEvents();
      expect(events).toContain('CLOSE_TABLE');
      expect(events).toContain('START_BREAK');
      expect(events).toHaveLength(2);
    });

    it('returns valid events for break state', () => {
      const machine = createTableStateMachine('break');
      const events = machine.getValidEvents();
      expect(events).toContain('END_BREAK');
      expect(events).toContain('CLOSE_TABLE');
      expect(events).toHaveLength(2);
    });

    it('returns valid events for reserved state', () => {
      const machine = createTableStateMachine('reserved');
      const events = machine.getValidEvents();
      expect(events).toContain('UNRESERVE');
      expect(events).toContain('OPEN_TABLE');
      expect(events).toHaveLength(2);
    });
  });

  describe('mapStateToDbStatus', () => {
    it('maps open to active', () => {
      expect(mapStateToDbStatus('open')).toBe('active');
    });

    it('maps break to active', () => {
      expect(mapStateToDbStatus('break')).toBe('active');
    });

    it('maps reserved to inactive', () => {
      expect(mapStateToDbStatus('reserved')).toBe('inactive');
    });

    it('maps closed to closed', () => {
      expect(mapStateToDbStatus('closed')).toBe('closed');
    });
  });

  describe('mapDbStatusToState', () => {
    it('maps active to open by default', () => {
      expect(mapDbStatusToState('active')).toBe('open');
    });

    it('maps active to break when onBreak metadata is true', () => {
      expect(mapDbStatusToState('active', { onBreak: true })).toBe('break');
    });

    it('maps inactive to closed by default', () => {
      expect(mapDbStatusToState('inactive')).toBe('closed');
    });

    it('maps inactive to reserved when reserved metadata is true', () => {
      expect(mapDbStatusToState('inactive', { reserved: true })).toBe('reserved');
    });

    it('maps closed to closed', () => {
      expect(mapDbStatusToState('closed')).toBe('closed');
    });
  });

  describe('isValidTransition', () => {
    it('returns true for valid state transitions', () => {
      expect(isValidTransition('closed', 'open')).toBe(true);
      expect(isValidTransition('closed', 'reserved')).toBe(true);
      expect(isValidTransition('open', 'closed')).toBe(true);
      expect(isValidTransition('open', 'break')).toBe(true);
      expect(isValidTransition('break', 'open')).toBe(true);
      expect(isValidTransition('break', 'closed')).toBe(true);
      expect(isValidTransition('reserved', 'closed')).toBe(true);
      expect(isValidTransition('reserved', 'open')).toBe(true);
    });

    it('returns false for invalid state transitions', () => {
      expect(isValidTransition('closed', 'break')).toBe(false);
      expect(isValidTransition('closed', 'closed')).toBe(false);
      expect(isValidTransition('open', 'reserved')).toBe(false);
      expect(isValidTransition('break', 'reserved')).toBe(false);
      expect(isValidTransition('reserved', 'break')).toBe(false);
    });
  });

  describe('getNextStates', () => {
    it('returns correct next states for closed', () => {
      const nextStates = getNextStates('closed');
      expect(nextStates).toContain('open');
      expect(nextStates).toContain('reserved');
      expect(nextStates).toHaveLength(2);
    });

    it('returns correct next states for open', () => {
      const nextStates = getNextStates('open');
      expect(nextStates).toContain('closed');
      expect(nextStates).toContain('break');
      expect(nextStates).toHaveLength(2);
    });

    it('returns correct next states for break', () => {
      const nextStates = getNextStates('break');
      expect(nextStates).toContain('open');
      expect(nextStates).toContain('closed');
      expect(nextStates).toHaveLength(2);
    });

    it('returns correct next states for reserved', () => {
      const nextStates = getNextStates('reserved');
      expect(nextStates).toContain('closed');
      expect(nextStates).toContain('open');
      expect(nextStates).toHaveLength(2);
    });
  });

  describe('full lifecycle scenarios', () => {
    it('completes a full table day: closed -> open -> break -> open -> closed', () => {
      const machine = createTableStateMachine('closed');

      // Open the table for the day
      machine.transition({ type: 'OPEN_TABLE' });
      expect(machine.currentState).toBe('open');

      // Take a break
      machine.transition({ type: 'START_BREAK' });
      expect(machine.currentState).toBe('break');

      // Resume from break
      machine.transition({ type: 'END_BREAK' });
      expect(machine.currentState).toBe('open');

      // Close for the night
      machine.transition({ type: 'CLOSE_TABLE' });
      expect(machine.currentState).toBe('closed');
    });

    it('handles reservation flow: closed -> reserved -> open -> closed', () => {
      const machine = createTableStateMachine('closed');

      // Reserve the table
      machine.transition({ type: 'RESERVE' });
      expect(machine.currentState).toBe('reserved');

      // Open for the reserved party
      machine.transition({ type: 'OPEN_TABLE' });
      expect(machine.currentState).toBe('open');

      // Close after play
      machine.transition({ type: 'CLOSE_TABLE' });
      expect(machine.currentState).toBe('closed');
    });

    it('handles reservation cancellation: closed -> reserved -> closed', () => {
      const machine = createTableStateMachine('closed');

      // Reserve the table
      machine.transition({ type: 'RESERVE' });
      expect(machine.currentState).toBe('reserved');

      // Cancel reservation
      machine.transition({ type: 'UNRESERVE' });
      expect(machine.currentState).toBe('closed');
    });

    it('allows closing directly from break', () => {
      const machine = createTableStateMachine('open');

      machine.transition({ type: 'START_BREAK' });
      expect(machine.currentState).toBe('break');

      // Emergency close during break
      machine.transition({ type: 'CLOSE_TABLE' });
      expect(machine.currentState).toBe('closed');
    });
  });
});

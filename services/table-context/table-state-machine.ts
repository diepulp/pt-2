import type { Database } from '@/types/database.types';

// Extended table states beyond database enum
// Database only has: "inactive" | "active" | "closed"
// We add "break" and "reserved" as logical states
export type TableState = 'closed' | 'open' | 'break' | 'reserved';

// Map logical states to database table_status enum
type DbTableStatus = Database['public']['Enums']['table_status'];

export function mapStateToDbStatus(state: TableState): DbTableStatus {
  switch (state) {
    case 'open':
    case 'break':
      return 'active';
    case 'reserved':
      return 'inactive';
    case 'closed':
      return 'closed';
  }
}

export function mapDbStatusToState(
  dbStatus: DbTableStatus,
  metadata?: { onBreak?: boolean; reserved?: boolean }
): TableState {
  if (dbStatus === 'active') {
    return metadata?.onBreak ? 'break' : 'open';
  }
  if (dbStatus === 'inactive') {
    return metadata?.reserved ? 'reserved' : 'closed';
  }
  return 'closed';
}

export type TableEvent =
  | { type: 'OPEN_TABLE' }
  | { type: 'CLOSE_TABLE' }
  | { type: 'START_BREAK' }
  | { type: 'END_BREAK' }
  | { type: 'RESERVE' }
  | { type: 'UNRESERVE' };

export interface TableStateMachine {
  currentState: TableState;
  canTransition: (event: TableEvent) => boolean;
  transition: (event: TableEvent) => TableState;
  getValidEvents: () => TableEvent['type'][];
}

// State transition rules matrix
const TRANSITIONS: Record<TableState, Partial<Record<TableEvent['type'], TableState>>> = {
  closed: {
    OPEN_TABLE: 'open',
    RESERVE: 'reserved',
  },
  open: {
    CLOSE_TABLE: 'closed',
    START_BREAK: 'break',
  },
  break: {
    END_BREAK: 'open',
    CLOSE_TABLE: 'closed',
  },
  reserved: {
    UNRESERVE: 'closed',
    OPEN_TABLE: 'open',
  },
};

export function createTableStateMachine(initialState: TableState): TableStateMachine {
  let currentState = initialState;

  return {
    get currentState() {
      return currentState;
    },

    canTransition(event: TableEvent): boolean {
      const validTransitions = TRANSITIONS[currentState];
      return event.type in validTransitions;
    },

    transition(event: TableEvent): TableState {
      const validTransitions = TRANSITIONS[currentState];
      const nextState = validTransitions[event.type];

      if (!nextState) {
        throw new Error(
          `Invalid transition: ${event.type} from state ${currentState}`
        );
      }

      currentState = nextState;
      return currentState;
    },

    getValidEvents(): TableEvent['type'][] {
      return Object.keys(TRANSITIONS[currentState]) as TableEvent['type'][];
    },
  };
}

/**
 * Validates if a state transition is allowed
 * @param fromState - Current state
 * @param toState - Desired state
 * @returns true if transition is valid
 */
export function isValidTransition(fromState: TableState, toState: TableState): boolean {
  const validTransitions = TRANSITIONS[fromState];
  return Object.values(validTransitions).includes(toState);
}

/**
 * Gets all possible next states from current state
 * @param state - Current state
 * @returns Array of possible next states
 */
export function getNextStates(state: TableState): TableState[] {
  const validTransitions = TRANSITIONS[state];
  return Object.values(validTransitions);
}

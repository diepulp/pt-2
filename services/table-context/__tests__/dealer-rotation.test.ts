/**
 * Dealer Rotation Unit Tests (STUB)
 *
 * Tests for dealer assignment and rotation management.
 *
 * @see dealer-rotation.ts
 * @see EXECUTION-SPEC-PRD-007.md section 5.2
 *
 * TODO: Implement after WS-2 completes dealer-rotation.ts
 */

describe('Dealer Rotation', () => {
  describe('assignDealer', () => {
    it.todo('assigns a dealer to an active table');
    it.todo('auto-ends previous rotation when assigning new dealer');
    it.todo('throws TABLE_NOT_FOUND if table does not exist');
    it.todo('throws TABLE_NOT_ACTIVE if table is not active');
    it.todo('returns new DealerRotationDTO with started_at set');
  });

  describe('endDealerRotation', () => {
    it.todo('ends the current active rotation');
    it.todo('throws DEALER_ROTATION_NOT_FOUND if no active rotation');
    it.todo('returns updated DealerRotationDTO with ended_at set');
  });

  describe('getCurrentDealer', () => {
    it.todo('returns current dealer rotation for table');
    it.todo('returns null if no active rotation');
    it.todo('throws TABLE_NOT_FOUND if table does not exist');
  });

  describe('Rotation Invariants', () => {
    it.todo('ensures only one active rotation per table at a time');
    it.todo('preserves rotation history for audit');
  });
});

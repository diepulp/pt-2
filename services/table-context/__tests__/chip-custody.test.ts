/**
 * Chip Custody Unit Tests (STUB)
 *
 * Tests for chip custody operations:
 * - Inventory snapshots (open, close, rundown)
 * - Table fills from cage
 * - Table credits to cage
 * - Drop box events
 *
 * @see chip-custody.ts
 * @see EXECUTION-SPEC-PRD-007.md section 5.2
 *
 * TODO: Implement after WS-3 completes chip-custody.ts
 */

describe('Chip Custody', () => {
  describe('logInventorySnapshot', () => {
    it.todo('logs open inventory snapshot');
    it.todo('logs close inventory snapshot');
    it.todo('logs rundown inventory snapshot');
    it.todo('records discrepancy_cents when provided');
    it.todo('handles empty chipset');
    it.todo('returns TableInventorySnapshotDTO');
  });

  describe('requestTableFill', () => {
    it.todo('creates new fill with valid request_id');
    it.todo('returns existing fill for duplicate request_id (idempotent)');
    it.todo('records all staff participants correctly');
    it.todo('returns TableFillDTO with created_at set');
  });

  describe('requestTableCredit', () => {
    it.todo('creates new credit with valid request_id');
    it.todo('returns existing credit for duplicate request_id (idempotent)');
    it.todo('records all staff participants correctly');
    it.todo('returns TableCreditDTO with created_at set');
  });

  describe('logDropEvent', () => {
    it.todo('logs drop event with all required fields');
    it.todo('handles optional fields (gaming_day, seq_no, note)');
    it.todo('records custody chain participants');
    it.todo('returns TableDropEventDTO');
  });

  describe('getInventoryHistory', () => {
    it.todo('returns inventory history for table');
    it.todo('returns empty array if no history');
    it.todo('respects limit parameter');
    it.todo('orders by created_at descending');
  });

  describe('Idempotency', () => {
    it.todo('fill operations are idempotent by request_id');
    it.todo('credit operations are idempotent by request_id');
    it.todo('returns same data for duplicate requests');
  });
});

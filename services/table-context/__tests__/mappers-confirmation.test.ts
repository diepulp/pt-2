/**
 * @jest-environment node
 *
 * PRD-033 Confirmation Mapper Unit Tests
 *
 * Tests type-safe transformations for cashier confirmation operations:
 * - toTableFillDTOFromConfirmRpc
 * - toTableCreditDTOFromConfirmRpc
 * - toTableDropEventDTOFromAcknowledgeRpc
 * - toTableFillDTOFromRow / toTableFillDTOListFromRows
 * - toTableCreditDTOFromRow / toTableCreditDTOListFromRows
 * - toTableDropEventDTOFromRow / toTableDropEventDTOListFromRows
 *
 * @see mappers.ts
 * @see EXECUTION-SPEC-PRD-033.md WS6
 */

import {
  toTableFillDTOFromConfirmRpc,
  toTableCreditDTOFromConfirmRpc,
  toTableDropEventDTOFromAcknowledgeRpc,
  toTableFillDTOFromRow,
  toTableFillDTOListFromRows,
  toTableCreditDTOFromRow,
  toTableCreditDTOListFromRows,
  toTableDropEventDTOFromRow,
  toTableDropEventDTOListFromRows,
} from '../mappers';

// === Mock Data: RPC Confirm Fill Response ===

const mockConfirmFillRpc = {
  id: 'fill-001',
  casino_id: 'casino-abc',
  table_id: 'table-001',
  request_id: 'req-fill-001',
  chipset: { '100': 50, '500': 20 },
  amount_cents: 1500000,
  requested_by: 'staff-pit-001',
  delivered_by: 'staff-runner-001',
  received_by: 'staff-dealer-001',
  slip_no: 'FILL-2026-0001',
  created_at: '2026-02-17T10:00:00Z',
  status: 'confirmed',
  confirmed_at: '2026-02-17T10:15:00Z',
  confirmed_by: 'staff-cashier-001',
  confirmed_amount_cents: 1500000,
  discrepancy_note: null,
};

const mockConfirmFillRpcWithDiscrepancy = {
  ...mockConfirmFillRpc,
  id: 'fill-002',
  confirmed_amount_cents: 1400000,
  discrepancy_note: 'Missing 1x $1000 chip',
};

// === Mock Data: RPC Confirm Credit Response ===

const mockConfirmCreditRpc = {
  id: 'credit-001',
  casino_id: 'casino-abc',
  table_id: 'table-001',
  request_id: 'req-credit-001',
  chipset: { '1000': 10 },
  amount_cents: 1000000,
  authorized_by: 'staff-pit-001',
  sent_by: 'staff-dealer-001',
  received_by: 'staff-runner-001',
  slip_no: 'CREDIT-2026-0001',
  created_at: '2026-02-17T14:00:00Z',
  status: 'confirmed',
  confirmed_at: '2026-02-17T14:20:00Z',
  confirmed_by: 'staff-cashier-001',
  confirmed_amount_cents: 1000000,
  discrepancy_note: null,
};

// === Mock Data: RPC Acknowledge Drop Response ===

const mockAcknowledgeDropRpc = {
  id: 'drop-001',
  casino_id: 'casino-abc',
  table_id: 'table-001',
  drop_box_id: 'box-001',
  seal_no: 'SEAL-2026-0001',
  gaming_day: '2026-02-17',
  seq_no: 1,
  removed_by: 'staff-security-001',
  witnessed_by: 'staff-pit-001',
  removed_at: '2026-02-17T06:00:00Z',
  delivered_at: '2026-02-17T06:30:00Z',
  delivered_scan_at: '2026-02-17T06:35:00Z',
  note: 'Morning collection',
  cage_received_at: '2026-02-17T07:00:00Z',
  cage_received_by: 'staff-cashier-001',
};

const mockAcknowledgeDropRpcNulls = {
  id: 'drop-002',
  casino_id: 'casino-abc',
  table_id: 'table-002',
  drop_box_id: 'box-002',
  seal_no: null,
  gaming_day: null,
  seq_no: null,
  removed_by: null,
  witnessed_by: null,
  removed_at: '2026-02-17T18:00:00Z',
  delivered_at: null,
  delivered_scan_at: null,
  note: null,
  cage_received_at: '2026-02-17T18:30:00Z',
  cage_received_by: 'staff-cashier-002',
};

// === Mock Data: Table Fill Row (direct query) ===

const mockFillRow = {
  id: 'fill-row-001',
  casino_id: 'casino-abc',
  table_id: 'table-001',
  request_id: 'req-fill-row-001',
  chipset: { '100': 30 },
  amount_cents: 300000,
  requested_by: 'staff-pit-001',
  delivered_by: 'staff-runner-001',
  received_by: 'staff-dealer-001',
  slip_no: 'FILL-ROW-001',
  created_at: '2026-02-17T08:00:00Z',
  gaming_day: '2026-02-17',
  status: 'requested',
  confirmed_at: null,
  confirmed_by: null,
  confirmed_amount_cents: null,
  discrepancy_note: null,
};

const mockFillRowConfirmed = {
  ...mockFillRow,
  id: 'fill-row-002',
  status: 'confirmed',
  confirmed_at: '2026-02-17T08:30:00Z',
  confirmed_by: 'staff-cashier-001',
  confirmed_amount_cents: 300000,
};

// === Mock Data: Table Credit Row (direct query) ===

const mockCreditRow = {
  id: 'credit-row-001',
  casino_id: 'casino-abc',
  table_id: 'table-001',
  request_id: 'req-credit-row-001',
  chipset: { '500': 10 },
  amount_cents: 500000,
  authorized_by: 'staff-pit-001',
  sent_by: 'staff-dealer-001',
  received_by: 'staff-runner-001',
  slip_no: 'CREDIT-ROW-001',
  created_at: '2026-02-17T16:00:00Z',
  gaming_day: '2026-02-17',
  status: 'requested',
  confirmed_at: null,
  confirmed_by: null,
  confirmed_amount_cents: null,
  discrepancy_note: null,
};

// === Mock Data: Table Drop Event Row (direct query) ===

const mockDropRow = {
  id: 'drop-row-001',
  casino_id: 'casino-abc',
  table_id: 'table-001',
  drop_box_id: 'box-row-001',
  seal_no: 'SEAL-ROW-001',
  gaming_day: '2026-02-17',
  seq_no: 1,
  removed_by: 'staff-security-001',
  witnessed_by: 'staff-pit-001',
  removed_at: '2026-02-17T06:00:00Z',
  delivered_at: '2026-02-17T06:30:00Z',
  delivered_scan_at: '2026-02-17T06:35:00Z',
  note: null,
  cage_received_at: null,
  cage_received_by: null,
};

const mockDropRowAcknowledged = {
  ...mockDropRow,
  id: 'drop-row-002',
  cage_received_at: '2026-02-17T07:00:00Z',
  cage_received_by: 'staff-cashier-001',
};

// === Tests ===

describe('PRD-033 Confirmation Mappers', () => {
  // === toTableFillDTOFromConfirmRpc ===

  describe('toTableFillDTOFromConfirmRpc', () => {
    it('maps all 16 fields correctly for confirmed fill', () => {
      const dto = toTableFillDTOFromConfirmRpc(mockConfirmFillRpc);

      expect(dto).toEqual({
        id: 'fill-001',
        casino_id: 'casino-abc',
        table_id: 'table-001',
        request_id: 'req-fill-001',
        chipset: { '100': 50, '500': 20 },
        amount_cents: 1500000,
        requested_by: 'staff-pit-001',
        delivered_by: 'staff-runner-001',
        received_by: 'staff-dealer-001',
        slip_no: 'FILL-2026-0001',
        created_at: '2026-02-17T10:00:00Z',
        status: 'confirmed',
        confirmed_at: '2026-02-17T10:15:00Z',
        confirmed_by: 'staff-cashier-001',
        confirmed_amount_cents: 1500000,
        discrepancy_note: null,
      });
    });

    it('maps fill with discrepancy correctly', () => {
      const dto = toTableFillDTOFromConfirmRpc(
        mockConfirmFillRpcWithDiscrepancy,
      );

      expect(dto.confirmed_amount_cents).toBe(1400000);
      expect(dto.discrepancy_note).toBe('Missing 1x $1000 chip');
      expect(dto.amount_cents).toBe(1500000); // Original amount preserved
    });

    it('returns a new object (immutability)', () => {
      const dto = toTableFillDTOFromConfirmRpc(mockConfirmFillRpc);
      expect(dto).not.toBe(mockConfirmFillRpc);
    });

    it('preserves chipset as JSONB payload', () => {
      const dto = toTableFillDTOFromConfirmRpc(mockConfirmFillRpc);
      expect(dto.chipset).toEqual({ '100': 50, '500': 20 });
    });
  });

  // === toTableCreditDTOFromConfirmRpc ===

  describe('toTableCreditDTOFromConfirmRpc', () => {
    it('maps all 16 fields correctly for confirmed credit', () => {
      const dto = toTableCreditDTOFromConfirmRpc(mockConfirmCreditRpc);

      expect(dto).toEqual({
        id: 'credit-001',
        casino_id: 'casino-abc',
        table_id: 'table-001',
        request_id: 'req-credit-001',
        chipset: { '1000': 10 },
        amount_cents: 1000000,
        authorized_by: 'staff-pit-001',
        sent_by: 'staff-dealer-001',
        received_by: 'staff-runner-001',
        slip_no: 'CREDIT-2026-0001',
        created_at: '2026-02-17T14:00:00Z',
        status: 'confirmed',
        confirmed_at: '2026-02-17T14:20:00Z',
        confirmed_by: 'staff-cashier-001',
        confirmed_amount_cents: 1000000,
        discrepancy_note: null,
      });
    });

    it('returns a new object (immutability)', () => {
      const dto = toTableCreditDTOFromConfirmRpc(mockConfirmCreditRpc);
      expect(dto).not.toBe(mockConfirmCreditRpc);
    });
  });

  // === toTableDropEventDTOFromAcknowledgeRpc ===

  describe('toTableDropEventDTOFromAcknowledgeRpc', () => {
    it('maps all 14 fields correctly for acknowledged drop', () => {
      const dto = toTableDropEventDTOFromAcknowledgeRpc(
        mockAcknowledgeDropRpc,
      );

      expect(dto).toEqual({
        id: 'drop-001',
        casino_id: 'casino-abc',
        table_id: 'table-001',
        drop_box_id: 'box-001',
        seal_no: 'SEAL-2026-0001',
        gaming_day: '2026-02-17',
        seq_no: 1,
        removed_by: 'staff-security-001',
        witnessed_by: 'staff-pit-001',
        removed_at: '2026-02-17T06:00:00Z',
        delivered_at: '2026-02-17T06:30:00Z',
        delivered_scan_at: '2026-02-17T06:35:00Z',
        note: 'Morning collection',
        cage_received_at: '2026-02-17T07:00:00Z',
        cage_received_by: 'staff-cashier-001',
      });
    });

    it('handles null optional fields', () => {
      const dto = toTableDropEventDTOFromAcknowledgeRpc(
        mockAcknowledgeDropRpcNulls,
      );

      expect(dto.seal_no).toBeNull();
      expect(dto.gaming_day).toBeNull();
      expect(dto.seq_no).toBeNull();
      expect(dto.removed_by).toBeNull();
      expect(dto.witnessed_by).toBeNull();
      expect(dto.delivered_at).toBeNull();
      expect(dto.delivered_scan_at).toBeNull();
      expect(dto.note).toBeNull();
      // cage_received fields are populated (this is the acknowledge response)
      expect(dto.cage_received_at).toBe('2026-02-17T18:30:00Z');
      expect(dto.cage_received_by).toBe('staff-cashier-002');
    });

    it('returns a new object (immutability)', () => {
      const dto = toTableDropEventDTOFromAcknowledgeRpc(
        mockAcknowledgeDropRpc,
      );
      expect(dto).not.toBe(mockAcknowledgeDropRpc);
    });
  });

  // === Row-based Mappers (Fill) ===

  describe('toTableFillDTOFromRow', () => {
    it('maps requested fill row with null confirmation fields', () => {
      const dto = toTableFillDTOFromRow(mockFillRow);

      expect(dto.id).toBe('fill-row-001');
      expect(dto.status).toBe('requested');
      expect(dto.confirmed_at).toBeNull();
      expect(dto.confirmed_by).toBeNull();
      expect(dto.confirmed_amount_cents).toBeNull();
      expect(dto.discrepancy_note).toBeNull();
    });

    it('maps confirmed fill row with all confirmation fields', () => {
      const dto = toTableFillDTOFromRow(mockFillRowConfirmed);

      expect(dto.status).toBe('confirmed');
      expect(dto.confirmed_at).toBe('2026-02-17T08:30:00Z');
      expect(dto.confirmed_by).toBe('staff-cashier-001');
      expect(dto.confirmed_amount_cents).toBe(300000);
    });

    it('preserves base fields', () => {
      const dto = toTableFillDTOFromRow(mockFillRow);

      expect(dto.casino_id).toBe('casino-abc');
      expect(dto.table_id).toBe('table-001');
      expect(dto.request_id).toBe('req-fill-row-001');
      expect(dto.amount_cents).toBe(300000);
      expect(dto.slip_no).toBe('FILL-ROW-001');
    });

    it('returns a new object (immutability)', () => {
      const dto = toTableFillDTOFromRow(mockFillRow);
      expect(dto).not.toBe(mockFillRow);
    });
  });

  describe('toTableFillDTOListFromRows', () => {
    it('maps empty array', () => {
      const result = toTableFillDTOListFromRows([]);
      expect(result).toEqual([]);
    });

    it('maps multiple rows preserving order', () => {
      const result = toTableFillDTOListFromRows([
        mockFillRow,
        mockFillRowConfirmed,
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('fill-row-001');
      expect(result[0].status).toBe('requested');
      expect(result[1].id).toBe('fill-row-002');
      expect(result[1].status).toBe('confirmed');
    });
  });

  // === Row-based Mappers (Credit) ===

  describe('toTableCreditDTOFromRow', () => {
    it('maps requested credit row with null confirmation fields', () => {
      const dto = toTableCreditDTOFromRow(mockCreditRow);

      expect(dto.id).toBe('credit-row-001');
      expect(dto.status).toBe('requested');
      expect(dto.confirmed_at).toBeNull();
      expect(dto.confirmed_by).toBeNull();
      expect(dto.confirmed_amount_cents).toBeNull();
      expect(dto.discrepancy_note).toBeNull();
    });

    it('preserves credit-specific fields', () => {
      const dto = toTableCreditDTOFromRow(mockCreditRow);

      expect(dto.authorized_by).toBe('staff-pit-001');
      expect(dto.sent_by).toBe('staff-dealer-001');
      expect(dto.received_by).toBe('staff-runner-001');
    });

    it('returns a new object (immutability)', () => {
      const dto = toTableCreditDTOFromRow(mockCreditRow);
      expect(dto).not.toBe(mockCreditRow);
    });
  });

  describe('toTableCreditDTOListFromRows', () => {
    it('maps empty array', () => {
      const result = toTableCreditDTOListFromRows([]);
      expect(result).toEqual([]);
    });

    it('maps single row', () => {
      const result = toTableCreditDTOListFromRows([mockCreditRow]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('credit-row-001');
    });
  });

  // === Row-based Mappers (Drop Event) ===

  describe('toTableDropEventDTOFromRow', () => {
    it('maps unacknowledged drop row', () => {
      const dto = toTableDropEventDTOFromRow(mockDropRow);

      expect(dto.id).toBe('drop-row-001');
      expect(dto.cage_received_at).toBeNull();
      expect(dto.cage_received_by).toBeNull();
    });

    it('maps acknowledged drop row', () => {
      const dto = toTableDropEventDTOFromRow(mockDropRowAcknowledged);

      expect(dto.cage_received_at).toBe('2026-02-17T07:00:00Z');
      expect(dto.cage_received_by).toBe('staff-cashier-001');
    });

    it('preserves custody chain fields', () => {
      const dto = toTableDropEventDTOFromRow(mockDropRow);

      expect(dto.drop_box_id).toBe('box-row-001');
      expect(dto.seal_no).toBe('SEAL-ROW-001');
      expect(dto.removed_by).toBe('staff-security-001');
      expect(dto.witnessed_by).toBe('staff-pit-001');
    });

    it('returns a new object (immutability)', () => {
      const dto = toTableDropEventDTOFromRow(mockDropRow);
      expect(dto).not.toBe(mockDropRow);
    });
  });

  describe('toTableDropEventDTOListFromRows', () => {
    it('maps empty array', () => {
      const result = toTableDropEventDTOListFromRows([]);
      expect(result).toEqual([]);
    });

    it('maps multiple rows preserving order', () => {
      const result = toTableDropEventDTOListFromRows([
        mockDropRow,
        mockDropRowAcknowledged,
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].cage_received_at).toBeNull();
      expect(result[1].cage_received_at).not.toBeNull();
    });
  });
});

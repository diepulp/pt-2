/** @jest-environment node */

/**
 * Chip Custody Unit Tests
 *
 * Tests for chip custody operations:
 * - Inventory snapshots (open, close, rundown)
 * - Table fills from cage
 * - Table credits to cage
 * - Drop box events
 *
 * @see chip-custody.ts
 * @see EXECUTION-SPEC-PRD-007.md section 5.2
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';
import { DomainError } from '@/lib/errors/domain-errors';

import { requestTableFill, requestTableCredit } from '../chip-custody';

function makeSupabase() {
  return {
    rpc: jest.fn(),
    from: jest.fn(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  } as unknown as SupabaseClient<Database>;
}

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

    // PRD-085 Wave 2 Phase 2.2: IDEMPOTENCY_CONFLICT propagation
    it('maps IDEMPOTENCY_CONFLICT: error to TABLE_FILL_REJECTED without 23505 lookup', async () => {
      const supabase = makeSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: {
          message:
            'IDEMPOTENCY_CONFLICT: fill request_id=req-fill-001 already committed with different payload. existing amount_cents=120000, incoming amount_cents=50000',
          code: 'P0001',
        },
      });

      let thrown: unknown;
      try {
        await requestTableFill(supabase, {
          tableId: 'table-1',
          casinoId: 'casino-1',
          requestId: 'req-fill-001',
          chipset: { '25': 4 },
          amountCents: 50000,
          deliveredBy: 'staff-1',
          receivedBy: 'staff-2',
          slipNo: 'FILL-001',
        });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(DomainError);
      const domainErr = thrown as DomainError;
      expect(domainErr.code).toBe('TABLE_FILL_REJECTED');
      expect(domainErr.message).toMatch(/^IDEMPOTENCY_CONFLICT:/);

      // IDEMPOTENCY_CONFLICT path must NOT trigger the 23505 lookup via supabase.from()
      expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
    });

    it('does not attempt finance_outbox fallback insert on fill RPC error', async () => {
      const supabase = makeSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: {
          message: 'FORBIDDEN: role cannot request table fills',
          code: 'P0001',
        },
      });

      await expect(
        requestTableFill(supabase, {
          tableId: 'table-1',
          casinoId: 'casino-1',
          requestId: 'req-fill-001',
          chipset: { '25': 4 },
          amountCents: 120000,
          deliveredBy: 'staff-1',
          receivedBy: 'staff-2',
          slipNo: 'FILL-001',
        }),
      ).rejects.toBeInstanceOf(DomainError);

      // No supabase.from() calls — no TS outbox or lookup fallback
      expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
    });
  });

  describe('requestTableCredit', () => {
    it.todo('creates new credit with valid request_id');
    it.todo('returns existing credit for duplicate request_id (idempotent)');
    it.todo('records all staff participants correctly');
    it.todo('returns TableCreditDTO with created_at set');

    // PRD-085 Wave 2 Phase 2.2: IDEMPOTENCY_CONFLICT propagation
    it('maps IDEMPOTENCY_CONFLICT: error to TABLE_CREDIT_REJECTED without 23505 lookup', async () => {
      const supabase = makeSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: {
          message:
            'IDEMPOTENCY_CONFLICT: credit request_id=req-credit-001 already committed with different payload. existing amount_cents=120000, incoming amount_cents=50000',
          code: 'P0001',
        },
      });

      let thrown: unknown;
      try {
        await requestTableCredit(supabase, {
          tableId: 'table-1',
          casinoId: 'casino-1',
          requestId: 'req-credit-001',
          chipset: { '25': 4 },
          amountCents: 50000,
          sentBy: 'staff-1',
          receivedBy: 'staff-2',
          slipNo: 'CREDIT-001',
        });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(DomainError);
      const domainErr = thrown as DomainError;
      expect(domainErr.code).toBe('TABLE_CREDIT_REJECTED');
      expect(domainErr.message).toMatch(/^IDEMPOTENCY_CONFLICT:/);

      // IDEMPOTENCY_CONFLICT path must NOT trigger the 23505 lookup via supabase.from()
      expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
    });

    it('does not attempt finance_outbox fallback insert on credit RPC error', async () => {
      const supabase = makeSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: {
          message: 'FORBIDDEN: role cannot request table credit',
          code: 'P0001',
        },
      });

      await expect(
        requestTableCredit(supabase, {
          tableId: 'table-1',
          casinoId: 'casino-1',
          requestId: 'req-credit-001',
          chipset: { '25': 4 },
          amountCents: 120000,
          sentBy: 'staff-1',
          receivedBy: 'staff-2',
          slipNo: 'CREDIT-001',
        }),
      ).rejects.toBeInstanceOf(DomainError);

      expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
    });
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

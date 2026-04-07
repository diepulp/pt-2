/** @jest-environment node */
/**
 * EmailService Unit Tests
 *
 * Tests the service factory, sendShiftReport orchestration (success, failure,
 * mixed recipients), and delegation to crud for read operations.
 *
 * @see services/email/index.ts
 * @see EXEC-062 WS5
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailProvider } from '@/lib/email/types';
import type { Database } from '@/types/database.types';
import { DomainError } from '@/lib/errors/domain-errors';

// --- Mock crud module (must precede service import) ---
jest.mock('../crud', () => ({
  insertSendAttempt: jest.fn(),
  getSendAttemptsByCasino: jest.fn(),
  getFailedAttempts: jest.fn(),
  getSendAttemptById: jest.fn(),
}));

import * as crud from '../crud';
import { createEmailService } from '../index';
import type { EmailServiceInterface } from '../index';
import type { ShiftReportEmailInput } from '../dtos';

// === Fixtures ===

type EmailSendAttemptRow =
  Database['public']['Tables']['email_send_attempt']['Row'];

function makeAttemptRow(
  overrides: Partial<EmailSendAttemptRow> = {},
): EmailSendAttemptRow {
  return {
    id: 'attempt-uuid-1',
    casino_id: 'casino-uuid-1',
    recipient_email: 'pit-boss@example.com',
    template: 'shift_report',
    status: 'sent',
    provider_message_id: 'msg_abc',
    error_summary: null,
    payload_ref: { shift_id: 'shift-1', report_date: '2026-04-06' },
    original_attempt_id: null,
    created_at: '2026-04-06T12:00:00Z',
    ...overrides,
  };
}

const defaultInput: ShiftReportEmailInput = {
  casinoId: 'casino-uuid-1',
  shiftId: 'shift-uuid-1',
  recipients: ['pit-boss@example.com'],
  reportDate: '2026-04-06',
};

// === Mock factories ===

function createMockSupabase(): SupabaseClient<Database> {
  return {
    from: jest.fn(),
    rpc: jest.fn(),
  } as unknown as SupabaseClient<Database>;
}

function createMockProvider(): EmailProvider {
  return {
    send: jest.fn(),
  };
}

// === Tests ===

describe('createEmailService', () => {
  let supabase: SupabaseClient<Database>;
  let provider: EmailProvider;
  let service: EmailServiceInterface;

  beforeEach(() => {
    jest.clearAllMocks();
    supabase = createMockSupabase();
    provider = createMockProvider();
    service = createEmailService(supabase, provider);
  });

  describe('factory creation', () => {
    it('returns object with all interface methods', () => {
      expect(service).toHaveProperty('sendShiftReport');
      expect(service).toHaveProperty('getSendAttempts');
      expect(service).toHaveProperty('getFailedAttempts');
      expect(service).toHaveProperty('getSendAttemptById');
    });

    it('all methods are functions', () => {
      expect(typeof service.sendShiftReport).toBe('function');
      expect(typeof service.getSendAttempts).toBe('function');
      expect(typeof service.getFailedAttempts).toBe('function');
      expect(typeof service.getSendAttemptById).toBe('function');
    });
  });

  // --- sendShiftReport ---

  describe('sendShiftReport', () => {
    it('success path inserts sent-status row and returns attemptId', async () => {
      const attemptRow = makeAttemptRow({ id: 'attempt-001' });

      (provider.send as jest.Mock).mockResolvedValue({
        messageId: 'msg_resend_001',
      });
      (crud.insertSendAttempt as jest.Mock).mockResolvedValue(attemptRow);

      const result = await service.sendShiftReport(defaultInput);

      expect(provider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'pit-boss@example.com',
          subject: expect.stringContaining('2026-04-06'),
          html: expect.stringContaining('shift-uuid-1'),
        }),
      );

      expect(crud.insertSendAttempt).toHaveBeenCalledWith(
        supabase,
        expect.objectContaining({
          casino_id: 'casino-uuid-1',
          recipient_email: 'pit-boss@example.com',
          template: 'shift_report',
          status: 'sent',
          provider_message_id: 'msg_resend_001',
          payload_ref: {
            shift_id: 'shift-uuid-1',
            report_date: '2026-04-06',
          },
        }),
      );

      expect(result.success).toBe(true);
      expect(result.attemptIds).toContain('attempt-001');
      expect(result.failures).toHaveLength(0);
    });

    it('failure path inserts failed-status row with error_summary', async () => {
      const failedAttemptRow = makeAttemptRow({
        id: 'attempt-fail-001',
        status: 'failed',
        error_summary: 'provider error',
      });

      (provider.send as jest.Mock).mockRejectedValue(
        new Error('provider error'),
      );
      (crud.insertSendAttempt as jest.Mock).mockResolvedValue(failedAttemptRow);

      const result = await service.sendShiftReport(defaultInput);

      // Verify the failure crud call has status: 'failed' and error_summary
      expect(crud.insertSendAttempt).toHaveBeenCalledWith(
        supabase,
        expect.objectContaining({
          status: 'failed',
          error_summary: expect.any(String),
        }),
      );

      expect(result.success).toBe(false);
      expect(result.attemptIds).toContain('attempt-fail-001');
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].recipient).toBe('pit-boss@example.com');
      expect(result.failures[0].error).toBeDefined();
    });

    it('returns correct result structure shape', async () => {
      (provider.send as jest.Mock).mockResolvedValue({ messageId: 'msg_1' });
      (crud.insertSendAttempt as jest.Mock).mockResolvedValue(
        makeAttemptRow({ id: 'attempt-shape-check' }),
      );

      const result = await service.sendShiftReport(defaultInput);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('attemptIds');
      expect(result).toHaveProperty('failures');
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.attemptIds)).toBe(true);
      expect(Array.isArray(result.failures)).toBe(true);
    });

    it('handles multiple recipients: mixed success and failure', async () => {
      const inputMulti: ShiftReportEmailInput = {
        ...defaultInput,
        recipients: ['success@example.com', 'fail@example.com'],
      };

      const successRow = makeAttemptRow({
        id: 'attempt-ok',
        recipient_email: 'success@example.com',
      });
      const failRow = makeAttemptRow({
        id: 'attempt-err',
        recipient_email: 'fail@example.com',
        status: 'failed',
      });

      // First call succeeds, second fails
      (provider.send as jest.Mock)
        .mockResolvedValueOnce({ messageId: 'msg_ok' })
        .mockRejectedValueOnce(new Error('delivery failure'));

      (crud.insertSendAttempt as jest.Mock)
        .mockResolvedValueOnce(successRow) // success insert
        .mockResolvedValueOnce(failRow); // failure insert

      const result = await service.sendShiftReport(inputMulti);

      expect(result.success).toBe(false);
      expect(result.attemptIds).toHaveLength(2);
      expect(result.attemptIds).toContain('attempt-ok');
      expect(result.attemptIds).toContain('attempt-err');
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].recipient).toBe('fail@example.com');
    });

    it('handles all recipients succeeding', async () => {
      const inputMulti: ShiftReportEmailInput = {
        ...defaultInput,
        recipients: ['a@example.com', 'b@example.com'],
      };

      (provider.send as jest.Mock)
        .mockResolvedValueOnce({ messageId: 'msg_a' })
        .mockResolvedValueOnce({ messageId: 'msg_b' });

      (crud.insertSendAttempt as jest.Mock)
        .mockResolvedValueOnce(makeAttemptRow({ id: 'att-a' }))
        .mockResolvedValueOnce(makeAttemptRow({ id: 'att-b' }));

      const result = await service.sendShiftReport(inputMulti);

      expect(result.success).toBe(true);
      expect(result.attemptIds).toHaveLength(2);
      expect(result.failures).toHaveLength(0);
    });

    it('handles all recipients failing', async () => {
      const inputMulti: ShiftReportEmailInput = {
        ...defaultInput,
        recipients: ['x@example.com', 'y@example.com'],
      };

      (provider.send as jest.Mock)
        .mockRejectedValueOnce(new Error('fail x'))
        .mockRejectedValueOnce(new Error('fail y'));

      (crud.insertSendAttempt as jest.Mock)
        .mockResolvedValueOnce(
          makeAttemptRow({ id: 'att-x', status: 'failed' }),
        )
        .mockResolvedValueOnce(
          makeAttemptRow({ id: 'att-y', status: 'failed' }),
        );

      const result = await service.sendShiftReport(inputMulti);

      expect(result.success).toBe(false);
      expect(result.attemptIds).toHaveLength(2);
      expect(result.failures).toHaveLength(2);
    });

    it('throws DomainError when failure logging itself fails', async () => {
      (provider.send as jest.Mock).mockRejectedValue(new Error('send failed'));
      (crud.insertSendAttempt as jest.Mock).mockRejectedValue(
        new Error('DB write failed'),
      );

      await expect(service.sendShiftReport(defaultInput)).rejects.toThrow(
        DomainError,
      );

      await expect(service.sendShiftReport(defaultInput)).rejects.toMatchObject(
        {
          code: 'INTERNAL_ERROR',
          message: 'Failed to log email send attempt',
        },
      );
    });

    it('includes shift data in HTML template', async () => {
      (provider.send as jest.Mock).mockResolvedValue({ messageId: 'msg_html' });
      (crud.insertSendAttempt as jest.Mock).mockResolvedValue(makeAttemptRow());

      await service.sendShiftReport(defaultInput);

      const sendCall = (provider.send as jest.Mock).mock.calls[0][0];
      expect(sendCall.html).toContain('shift-uuid-1');
      expect(sendCall.html).toContain('2026-04-06');
      expect(sendCall.html).toContain('casino-uuid-1');
    });
  });

  // --- Read delegation ---

  describe('getSendAttempts', () => {
    it('delegates to crud.getSendAttemptsByCasino', async () => {
      const rows = [makeAttemptRow()];
      (crud.getSendAttemptsByCasino as jest.Mock).mockResolvedValue(rows);

      const result = await service.getSendAttempts();

      expect(crud.getSendAttemptsByCasino).toHaveBeenCalledWith(supabase);
      expect(result).toEqual(rows);
    });
  });

  describe('getFailedAttempts', () => {
    it('delegates to crud.getFailedAttempts', async () => {
      const rows = [makeAttemptRow({ status: 'failed' })];
      (crud.getFailedAttempts as jest.Mock).mockResolvedValue(rows);

      const result = await service.getFailedAttempts();

      expect(crud.getFailedAttempts).toHaveBeenCalledWith(supabase);
      expect(result).toEqual(rows);
    });
  });

  describe('getSendAttemptById', () => {
    it('delegates to crud.getSendAttemptById', async () => {
      const row = makeAttemptRow({ id: 'lookup-id' });
      (crud.getSendAttemptById as jest.Mock).mockResolvedValue(row);

      const result = await service.getSendAttemptById('lookup-id');

      expect(crud.getSendAttemptById).toHaveBeenCalledWith(
        supabase,
        'lookup-id',
      );
      expect(result).toEqual(row);
    });

    it('returns null when not found', async () => {
      (crud.getSendAttemptById as jest.Mock).mockResolvedValue(null);

      const result = await service.getSendAttemptById('nonexistent');

      expect(result).toBeNull();
    });
  });
});

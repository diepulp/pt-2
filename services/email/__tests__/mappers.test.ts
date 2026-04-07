/** @jest-environment node */
/**
 * Email Send Attempt Mapper Unit Tests
 *
 * Tests the identity mapper for email_send_attempt rows.
 * Coverage target: 100% for mappers.
 *
 * @see services/email/mappers.ts
 * @see EXEC-062 WS5
 */

import type { Database } from '@/types/database.types';
import { mapSendAttemptRow } from '../mappers';

type EmailSendAttemptRow =
  Database['public']['Tables']['email_send_attempt']['Row'];

// === Fixtures ===

const fullRow: EmailSendAttemptRow = {
  id: 'attempt-uuid-1',
  casino_id: 'casino-uuid-1',
  recipient_email: 'pit-boss@example.com',
  template: 'shift_report',
  status: 'sent',
  provider_message_id: 'msg_abc123',
  error_summary: null,
  payload_ref: { shift_id: 'shift-1', report_date: '2026-04-06' },
  original_attempt_id: null,
  created_at: '2026-04-06T12:00:00Z',
};

const failedRow: EmailSendAttemptRow = {
  id: 'attempt-uuid-2',
  casino_id: 'casino-uuid-1',
  recipient_email: 'manager@example.com',
  template: 'shift_report',
  status: 'failed',
  provider_message_id: null,
  error_summary: 'rate limited',
  payload_ref: null,
  original_attempt_id: 'attempt-uuid-1',
  created_at: '2026-04-06T12:05:00Z',
};

// === Tests ===

describe('mapSendAttemptRow', () => {
  it('maps row to DTO (identity)', () => {
    const result = mapSendAttemptRow(fullRow);

    expect(result).toEqual(fullRow);
  });

  it('preserves all fields from a sent attempt', () => {
    const result = mapSendAttemptRow(fullRow);

    expect(result.id).toBe('attempt-uuid-1');
    expect(result.casino_id).toBe('casino-uuid-1');
    expect(result.recipient_email).toBe('pit-boss@example.com');
    expect(result.template).toBe('shift_report');
    expect(result.status).toBe('sent');
    expect(result.provider_message_id).toBe('msg_abc123');
    expect(result.error_summary).toBeNull();
    expect(result.payload_ref).toEqual({
      shift_id: 'shift-1',
      report_date: '2026-04-06',
    });
    expect(result.original_attempt_id).toBeNull();
    expect(result.created_at).toBe('2026-04-06T12:00:00Z');
  });

  it('preserves all fields from a failed attempt', () => {
    const result = mapSendAttemptRow(failedRow);

    expect(result.id).toBe('attempt-uuid-2');
    expect(result.status).toBe('failed');
    expect(result.provider_message_id).toBeNull();
    expect(result.error_summary).toBe('rate limited');
    expect(result.payload_ref).toBeNull();
    expect(result.original_attempt_id).toBe('attempt-uuid-1');
  });

  it('returns a value equal to the input (identity function)', () => {
    const result = mapSendAttemptRow(fullRow);

    // Identity: every key in input is present with same value
    const keys = Object.keys(fullRow) as Array<keyof EmailSendAttemptRow>;
    for (const key of keys) {
      expect(result[key]).toEqual(fullRow[key]);
    }
  });
});

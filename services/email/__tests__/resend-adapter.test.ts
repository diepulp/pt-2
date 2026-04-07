/** @jest-environment node */
/**
 * Resend Adapter Unit Tests
 *
 * Tests the Resend email provider adapter including env validation,
 * successful sends, and error handling with safe error details.
 *
 * @see lib/email/resend-adapter.ts
 * @see EXEC-062 WS5
 */

import type { EmailProvider } from '@/lib/email/types';

// --- Module mock (must precede adapter import) ---
const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockSend,
    },
  })),
}));

import { createResendProvider } from '@/lib/email/resend-adapter';

// === Helpers ===

/** Snapshot and restore env vars around each test */
const ENV_KEYS = ['RESEND_API_KEY', 'RESEND_SENDER_DOMAIN'] as const;

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

// === Tests ===

describe('createResendProvider', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    // Snapshot env
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
    }
    // Set valid defaults
    setEnv('RESEND_API_KEY', 're_test_key_123');
    setEnv('RESEND_SENDER_DOMAIN', 'example.com');
  });

  afterEach(() => {
    // Restore env
    for (const key of ENV_KEYS) {
      setEnv(key, originalEnv[key]);
    }
  });

  // --- Env validation ---

  describe('environment variable validation', () => {
    it('throws if RESEND_API_KEY is not set', () => {
      setEnv('RESEND_API_KEY', undefined);

      expect(() => createResendProvider()).toThrow(
        'RESEND_API_KEY environment variable is not set',
      );
    });

    it('throws if RESEND_SENDER_DOMAIN is not set', () => {
      setEnv('RESEND_SENDER_DOMAIN', undefined);

      expect(() => createResendProvider()).toThrow(
        'RESEND_SENDER_DOMAIN environment variable is not set',
      );
    });

    it('creates provider when both env vars are set', () => {
      const provider = createResendProvider();

      expect(provider).toBeDefined();
      expect(typeof provider.send).toBe('function');
    });
  });

  // --- send() ---

  describe('send()', () => {
    let provider: EmailProvider;

    beforeEach(() => {
      provider = createResendProvider();
    });

    it('returns messageId on success', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'msg_123' },
        error: null,
      });

      const result = await provider.send({
        to: 'pit-boss@example.com',
        subject: 'Shift Report',
        html: '<h1>Report</h1>',
      });

      expect(result).toEqual({ messageId: 'msg_123' });
    });

    it('passes correct from address derived from RESEND_SENDER_DOMAIN', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'msg_456' },
        error: null,
      });

      await provider.send({
        to: 'pit-boss@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@example.com',
          to: 'pit-boss@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        }),
      );
    });

    it('returns "unknown" messageId when data.id is absent', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await provider.send({
        to: 'user@example.com',
        subject: 'No ID',
        html: '<p>No data</p>',
      });

      expect(result).toEqual({ messageId: 'unknown' });
    });

    it('throws with "Email send failed" when Resend returns an error', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'rate limited' },
      });

      await expect(
        provider.send({
          to: 'user@example.com',
          subject: 'Fail',
          html: '<p>Fail</p>',
        }),
      ).rejects.toThrow(/Email send failed/);
    });

    it('includes safe error details in the thrown error message', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'invalid API key', code: '401' },
      });

      await expect(
        provider.send({
          to: 'user@example.com',
          subject: 'Auth Fail',
          html: '<p>Auth</p>',
        }),
      ).rejects.toThrow(/invalid API key/);
    });
  });
});

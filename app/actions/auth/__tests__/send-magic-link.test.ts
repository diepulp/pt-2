/** @jest-environment node */

/**
 * sendMagicLinkAction — unit tests
 *
 * Verifies DEC-6 (allowlist gate before OTP), RULE-2 (no signUp), RULE-7 (non-revealing errors).
 */

// Mock modules before any imports
const mockEmitTelemetry = jest.fn();
jest.mock('@/lib/telemetry/emit-telemetry', () => ({
  emitTelemetry: (...args: unknown[]) => mockEmitTelemetry(...args),
}));

const mockCheckAllowlistGate = jest.fn();
jest.mock('@/services/pilot', () => ({
  checkAllowlistGate: (...args: unknown[]) => mockCheckAllowlistGate(...args),
  sendMagicLinkSchema: {
    parse: ({ email }: { email: string }) => {
      if (!email || !email.includes('@'))
        throw Object.assign(new Error('ZodError'), { name: 'ZodError' });
      // Return with canonical email
      return { email: email.toLowerCase().trim() };
    },
  },
}));

const mockSignInWithOtp = jest.fn();
const mockCreateClient = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockCreateClient(),
}));

const mockCreateServiceClient = jest.fn();
jest.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));

// Use ZodError from zod for the validation error path
jest.mock('zod', () => {
  const actual = jest.requireActual('zod');
  return actual;
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sendMagicLinkAction } = require('../send-magic-link');

describe('sendMagicLinkAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateServiceClient.mockReturnValue({});
    mockCreateClient.mockResolvedValue({
      auth: {
        signInWithOtp: mockSignInWithOtp,
      },
    });
    mockSignInWithOtp.mockResolvedValue({ error: null });
  });

  describe('allowlist gate', () => {
    it('returns ok:true data.allowlistResult="not_approved" without issuing OTP for non-approved email', async () => {
      mockCheckAllowlistGate.mockResolvedValue('not_approved');

      const result = await sendMagicLinkAction('unknown@casino.com');

      expect(result.ok).toBe(true);
      expect(result.data?.allowlistResult).toBe('not_approved');
      expect(mockSignInWithOtp).not.toHaveBeenCalled();
    });

    it('returns ok:true data.allowlistResult="approved" and issues OTP for approved email', async () => {
      mockCheckAllowlistGate.mockResolvedValue('approved');

      const result = await sendMagicLinkAction('jane@casino.com');

      expect(result.ok).toBe(true);
      expect(result.data?.allowlistResult).toBe('approved');
      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'jane@casino.com',
          options: expect.objectContaining({ shouldCreateUser: true }),
        }),
      );
    });

    it('never calls signUp() regardless of allowlist result (RULE-2)', async () => {
      mockCheckAllowlistGate.mockResolvedValue('approved');
      const mockSignUp = jest.fn();
      mockCreateClient.mockResolvedValue({
        auth: { signInWithOtp: mockSignInWithOtp, signUp: mockSignUp },
      });

      await sendMagicLinkAction('jane@casino.com');

      expect(mockSignUp).not.toHaveBeenCalled();
    });
  });

  describe('OTP error handling', () => {
    it('returns ok:false INTERNAL_ERROR when signInWithOtp fails', async () => {
      mockCheckAllowlistGate.mockResolvedValue('approved');
      mockSignInWithOtp.mockResolvedValue({
        error: { message: 'rate limited' },
      });

      const result = await sendMagicLinkAction('jane@casino.com');

      expect(result.ok).toBe(false);
      expect(result.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('admin email guard (PRD-085)', () => {
    afterEach(() => {
      delete process.env.PILOT_ADMIN_EMAILS;
    });

    it('returns not_approved for admin email without hitting allowlist', async () => {
      process.env.PILOT_ADMIN_EMAILS = 'admin@example.com';
      const result = await sendMagicLinkAction('admin@example.com');
      expect(result.ok).toBe(true);
      expect(result.data?.allowlistResult).toBe('not_approved');
    });

    it('never calls createServiceClient for admin email', async () => {
      process.env.PILOT_ADMIN_EMAILS = 'admin@example.com';
      await sendMagicLinkAction('admin@example.com');
      expect(mockCreateServiceClient).not.toHaveBeenCalled();
    });
  });

  describe('ServiceResult envelope', () => {
    it('includes requestId, durationMs, timestamp on success', async () => {
      mockCheckAllowlistGate.mockResolvedValue('not_approved');

      const result = await sendMagicLinkAction('unknown@casino.com');

      expect(result.requestId).toBeDefined();
      expect(typeof result.durationMs).toBe('number');
      expect(result.timestamp).toBeDefined();
    });
  });
});

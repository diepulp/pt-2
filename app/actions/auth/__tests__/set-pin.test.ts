/**
 * Set PIN Server Action Tests
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS7
 */

export {}; // Module boundary to avoid redeclaration conflicts

const mockWithServerAction = jest.fn();
jest.mock('@/lib/server-actions/middleware/compositor', () => ({
  withServerAction: (...args: unknown[]) => mockWithServerAction(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$10$hashedpin'),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { setPinAction } = require('../set-pin');

describe('setPinAction', () => {
  const mockRpc = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockRpc.mockResolvedValue({ error: null });

    mockWithServerAction.mockImplementation(
      async (_supabase: unknown, handler: (...args: unknown[]) => unknown) => {
        const mwCtx = {
          supabase: {
            rpc: mockRpc,
          },
          correlationId: 'test-corr-id',
          startedAt: Date.now(),
          rlsContext: {
            actorId: 'staff-001',
            casinoId: 'casino-001',
            staffRole: 'pit_boss',
          },
        };
        return handler(mwCtx);
      },
    );
  });

  it('returns ok: true when PIN is valid and saved', async () => {
    const result = await setPinAction('5739');
    expect(result.ok).toBe(true);
    expect(result.code).toBe('OK');
  });

  it('rejects invalid PIN format (< 4 digits)', async () => {
    const result = await setPinAction('12');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid PIN format (> 6 digits)', async () => {
    const result = await setPinAction('1234567');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('rejects non-numeric PIN', async () => {
    const result = await setPinAction('abcd');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('rejects denied PINs from denylist (0000)', async () => {
    const result = await setPinAction('0000');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(result.error).toContain('too common');
  });

  it('rejects denied PINs from denylist (1234)', async () => {
    const result = await setPinAction('1234');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('hashes PIN with bcrypt before storing', async () => {
    const bcrypt = require('bcryptjs');
    await setPinAction('5739');
    expect(bcrypt.hash).toHaveBeenCalledWith('5739', 10);
  });

  it('returns PIN_SET_FAILED when RPC fails (e.g. no staff context)', async () => {
    mockRpc.mockResolvedValue({
      error: { message: 'UNAUTHORIZED: RLS context not set' },
    });

    const result = await setPinAction('5739');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PIN_SET_FAILED');
  });
});

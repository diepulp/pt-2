/**
 * Verify PIN Server Action Tests
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS7
 */

export {}; // Module boundary to avoid redeclaration conflicts

const mockEmitTelemetry = jest.fn();
jest.mock('@/lib/telemetry/emit-telemetry', () => ({
  emitTelemetry: (...args: unknown[]) => mockEmitTelemetry(...args),
}));

const mockWithServerAction = jest.fn();
jest.mock('@/lib/server-actions/middleware/compositor', () => ({
  withServerAction: (...args: unknown[]) => mockWithServerAction(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyPinAction } = require('../verify-pin');
const bcrypt = require('bcryptjs');

describe('verifyPinAction', () => {
  const mockSelect = jest.fn();
  const mockRpc = jest.fn();

  function setupMwCtx(overrides?: Record<string, unknown>) {
    const mockFrom = () => ({
      select: () => ({
        eq: () => ({
          single: mockSelect,
        }),
      }),
    });

    return {
      supabase: { from: mockFrom, rpc: mockRpc },
      correlationId: 'test-corr-id',
      startedAt: Date.now(),
      rlsContext: {
        actorId: 'staff-001',
        casinoId: 'casino-001',
        staffRole: 'pit_boss',
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();

    mockWithServerAction.mockImplementation(
      async (_supabase: unknown, handler: Function) =>
        handler(setupMwCtx()),
    );

    mockSelect.mockResolvedValue({
      data: { pin_hash: '$2a$10$hashexample' },
      error: null,
    });

    mockRpc.mockResolvedValue({
      data: [{ attempt_count: 1, is_limited: false }],
      error: null,
    });
  });

  it('returns verified: true on correct PIN', async () => {
    bcrypt.compare.mockResolvedValue(true);
    mockRpc.mockResolvedValue({ data: null, error: null }); // clear attempts RPC

    const result = await verifyPinAction('5739');
    expect(result.ok).toBe(true);
    expect(result.data?.verified).toBe(true);
  });

  it('clears attempts via rpc_clear_pin_attempts on success', async () => {
    bcrypt.compare.mockResolvedValue(true);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await verifyPinAction('5739');
    expect(mockRpc).toHaveBeenCalledWith('rpc_clear_pin_attempts');
  });

  it('returns verified: false on wrong PIN', async () => {
    bcrypt.compare.mockResolvedValue(false);

    const result = await verifyPinAction('8421');
    expect(result.ok).toBe(true);
    expect(result.data?.verified).toBe(false);
  });

  it('returns RATE_LIMIT_EXCEEDED after 5 failed attempts', async () => {
    bcrypt.compare.mockResolvedValue(false);
    mockRpc.mockResolvedValue({
      data: [{ attempt_count: 5, is_limited: true }],
      error: null,
    });

    const result = await verifyPinAction('8421');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('returns NOT_FOUND when pin_hash is null', async () => {
    mockSelect.mockResolvedValue({
      data: { pin_hash: null },
      error: null,
    });

    const result = await verifyPinAction('5739');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
    expect(result.error).toContain('PIN not set');
  });

  it('emits auth.lock_screen.pin_failed on wrong PIN', async () => {
    bcrypt.compare.mockResolvedValue(false);

    await verifyPinAction('8421');

    const failedEvent = mockEmitTelemetry.mock.calls.find(
      (c: { eventType: string }[]) =>
        c[0].eventType === 'auth.lock_screen.pin_failed',
    );
    expect(failedEvent).toBeTruthy();
  });

  it('emits auth.lock_screen.rate_limited on exceed', async () => {
    bcrypt.compare.mockResolvedValue(false);
    mockRpc.mockResolvedValue({
      data: [{ attempt_count: 5, is_limited: true }],
      error: null,
    });

    await verifyPinAction('8421');

    const limitedEvent = mockEmitTelemetry.mock.calls.find(
      (c: { eventType: string }[]) =>
        c[0].eventType === 'auth.lock_screen.rate_limited',
    );
    expect(limitedEvent).toBeTruthy();
  });

  it('rejects invalid PIN format', async () => {
    const result = await verifyPinAction('ab');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });
});

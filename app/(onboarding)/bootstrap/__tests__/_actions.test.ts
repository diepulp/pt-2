/** @jest-environment node */

/**
 * bootstrapAction — mutation hardening tests (EXEC-083 WS9)
 *
 * Verifies: unauthenticated → UNAUTHORIZED, authenticated non-allowlisted → FORBIDDEN.
 */

const mockRequireApprovedPilotSessionBootstrap = jest.fn();
jest.mock('@/lib/server-actions/guards/require-approved-pilot-session', () => ({
  requireApprovedPilotSession: (...args: unknown[]) =>
    mockRequireApprovedPilotSessionBootstrap(...args),
}));

const mockWithServerActionBootstrap = jest.fn();
jest.mock('@/lib/server-actions/middleware/compositor', () => ({
  withServerAction: (...args: unknown[]) =>
    mockWithServerActionBootstrap(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/services/casino/crud', () => ({
  bootstrapCasino: jest.fn(),
}));

jest.mock('@/services/casino/schemas', () => ({
  bootstrapCasinoSchema: { parse: (x: unknown) => x },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { bootstrapAction } = require('../_actions');

function makeFormData(): FormData {
  const fd = new FormData();
  fd.append('casino_name', 'Grand Casino');
  return fd;
}

describe('bootstrapAction — mutation hardening (EXEC-083 WS9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWithServerActionBootstrap.mockResolvedValue({
      ok: true,
      code: 'OK',
      requestId: 'r',
      durationMs: 0,
      timestamp: '',
    });
  });

  it('rejects unauthenticated session with UNAUTHORIZED', async () => {
    const { DomainError } = jest.requireActual('@/lib/errors/domain-errors');
    mockRequireApprovedPilotSessionBootstrap.mockRejectedValue(
      new DomainError('UNAUTHORIZED', 'Authentication required'),
    );

    const result = await bootstrapAction(makeFormData());

    expect(result.ok).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
    expect(mockWithServerActionBootstrap).not.toHaveBeenCalled();
  });

  it('rejects authenticated but non-allowlisted session with FORBIDDEN', async () => {
    const { DomainError } = jest.requireActual('@/lib/errors/domain-errors');
    mockRequireApprovedPilotSessionBootstrap.mockRejectedValue(
      new DomainError('FORBIDDEN', 'Pilot access required'),
    );

    const result = await bootstrapAction(makeFormData());

    expect(result.ok).toBe(false);
    expect(result.code).toBe('FORBIDDEN');
    expect(mockWithServerActionBootstrap).not.toHaveBeenCalled();
  });

  it('proceeds to withServerAction when guard passes', async () => {
    mockRequireApprovedPilotSessionBootstrap.mockResolvedValue({
      email: 'jane@casino.com',
    });

    await bootstrapAction(makeFormData());

    expect(mockWithServerActionBootstrap).toHaveBeenCalledTimes(1);
  });
});

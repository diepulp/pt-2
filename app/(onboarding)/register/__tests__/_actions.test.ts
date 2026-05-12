/** @jest-environment node */

/**
 * registerCompanyAction — mutation hardening tests (EXEC-083 WS9)
 *
 * Verifies: unauthenticated → UNAUTHORIZED, authenticated non-allowlisted → FORBIDDEN.
 */

const mockRequireApprovedPilotSession = jest.fn();
jest.mock('@/lib/server-actions/guards/require-approved-pilot-session', () => ({
  requireApprovedPilotSession: (...args: unknown[]) =>
    mockRequireApprovedPilotSession(...args),
}));

const mockWithServerAction = jest.fn();
jest.mock('@/lib/server-actions/middleware/compositor', () => ({
  withServerAction: (...args: unknown[]) => mockWithServerAction(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/services/company/crud', () => ({
  registerCompany: jest.fn(),
}));

jest.mock('@/services/company/schemas', () => ({
  registerCompanySchema: { parse: (x: unknown) => x },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { registerCompanyAction } = require('../_actions');

function makeFormData(fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.append('company_name', fields.company_name ?? 'Acme Casino Group');
  return fd;
}

describe('registerCompanyAction — mutation hardening (EXEC-083 WS9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWithServerAction.mockResolvedValue({
      ok: true,
      code: 'OK',
      requestId: 'r',
      durationMs: 0,
      timestamp: '',
    });
  });

  it('rejects unauthenticated session with UNAUTHORIZED', async () => {
    const { DomainError } = jest.requireActual('@/lib/errors/domain-errors');
    mockRequireApprovedPilotSession.mockRejectedValue(
      new DomainError('UNAUTHORIZED', 'Authentication required'),
    );

    const result = await registerCompanyAction(makeFormData());

    expect(result.ok).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
    expect(mockWithServerAction).not.toHaveBeenCalled();
  });

  it('rejects authenticated but non-allowlisted session with FORBIDDEN', async () => {
    const { DomainError } = jest.requireActual('@/lib/errors/domain-errors');
    mockRequireApprovedPilotSession.mockRejectedValue(
      new DomainError('FORBIDDEN', 'Pilot access required'),
    );

    const result = await registerCompanyAction(makeFormData());

    expect(result.ok).toBe(false);
    expect(result.code).toBe('FORBIDDEN');
    expect(mockWithServerAction).not.toHaveBeenCalled();
  });

  it('proceeds to withServerAction when guard passes', async () => {
    mockRequireApprovedPilotSession.mockResolvedValue({
      email: 'jane@casino.com',
    });

    await registerCompanyAction(makeFormData());

    expect(mockWithServerAction).toHaveBeenCalledTimes(1);
  });
});

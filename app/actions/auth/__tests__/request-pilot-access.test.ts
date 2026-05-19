/** @jest-environment node */

/**
 * requestPilotAccessAction — unit tests
 *
 * Verifies: valid submission, duplicate email idempotency, validation errors.
 */

const mockSendNotification = jest.fn().mockResolvedValue(undefined);
const mockSendConfirmation = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/email/send-demo-request-notification', () => ({
  sendDemoRequestNotification: (...args: unknown[]) =>
    mockSendNotification(...args),
}));
jest.mock('@/lib/email/send-demo-request-confirmation', () => ({
  sendDemoRequestConfirmation: (...args: unknown[]) =>
    mockSendConfirmation(...args),
}));

const mockSubmitAccessRequest = jest.fn();
jest.mock('@/services/pilot', () => ({
  requestAccessSchema: {
    parse: (input: Record<string, unknown>) => {
      if (!input.email || !input.name || !input.casino_name || !input.role) {
        const err = new Error('ZodError');
        err.name = 'ZodError';
        // Simulate ZodError instanceof check
        const ZodError = jest.requireActual('zod').ZodError;
        throw new ZodError([]);
      }
      return { ...input, email: String(input.email).toLowerCase().trim() };
    },
  },
  submitAccessRequest: (...args: unknown[]) => mockSubmitAccessRequest(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { requestPilotAccessAction } = require('../request-pilot-access');

function makeFormData(fields: Record<string, string | undefined>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) fd.append(k, v);
  }
  return fd;
}

const validFields = {
  email: 'jane@casino.com',
  name: 'Jane Smith',
  casino_name: 'Grand Casino',
  role: 'Pit Manager',
};

describe('requestPilotAccessAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitAccessRequest.mockResolvedValue(undefined);
    mockSendNotification.mockResolvedValue(undefined);
    mockSendConfirmation.mockResolvedValue(undefined);
  });

  it('returns ok:true for a valid submission', async () => {
    const result = await requestPilotAccessAction(makeFormData(validFields));

    expect(result.ok).toBe(true);
    expect(result.code).toBe('OK');
    expect(mockSubmitAccessRequest).toHaveBeenCalledTimes(1);
  });

  it('returns ok:true for duplicate pending email (idempotent, non-revealing)', async () => {
    // submitAccessRequest handles 23505 internally and resolves without throwing
    mockSubmitAccessRequest.mockResolvedValue(undefined);

    const result = await requestPilotAccessAction(makeFormData(validFields));
    expect(result.ok).toBe(true);
  });

  it('returns ok:false VALIDATION_ERROR when required fields are missing', async () => {
    const result = await requestPilotAccessAction(
      makeFormData({
        email: 'jane@casino.com' /* missing name, casino_name, role */,
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(mockSubmitAccessRequest).not.toHaveBeenCalled();
  });

  it('returns ok:false INTERNAL_ERROR when submitAccessRequest throws', async () => {
    const { DomainError } = jest.requireActual('@/lib/errors/domain-errors');
    mockSubmitAccessRequest.mockRejectedValue(
      new DomainError('INTERNAL_ERROR', 'DB error'),
    );

    const result = await requestPilotAccessAction(makeFormData(validFields));

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INTERNAL_ERROR');
  });

  it('includes requestId, durationMs, timestamp in envelope', async () => {
    const result = await requestPilotAccessAction(makeFormData(validFields));

    expect(result.requestId).toBeDefined();
    expect(typeof result.durationMs).toBe('number');
    expect(result.timestamp).toBeDefined();
  });

  it('fires admin notification and requester confirmation on success', async () => {
    await requestPilotAccessAction(makeFormData(validFields));

    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Jane Smith',
        email: 'jane@casino.com',
        company: 'Grand Casino',
      }),
    );
    expect(mockSendConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Jane Smith', email: 'jane@casino.com' }),
    );
  });

  it('returns ok:true even when email sending fails', async () => {
    mockSendNotification.mockRejectedValue(new Error('smtp error'));
    mockSendConfirmation.mockRejectedValue(new Error('smtp error'));

    const result = await requestPilotAccessAction(makeFormData(validFields));
    expect(result.ok).toBe(true);
  });

  it('does not fire emails when DB insert fails', async () => {
    mockSubmitAccessRequest.mockRejectedValue(new Error('DB error'));

    await requestPilotAccessAction(makeFormData(validFields));
    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(mockSendConfirmation).not.toHaveBeenCalled();
  });
});

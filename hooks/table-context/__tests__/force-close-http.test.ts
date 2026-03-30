/**
 * @jest-environment node
 *
 * Force Close HTTP Fetcher Tests (PRD-038A WS4)
 *
 * Validates forceCloseTableSession HTTP contract.
 */

import { IDEMPOTENCY_HEADER } from '@/lib/http/headers';
import { forceCloseTableSession } from '@/services/table-context/http';

describe('forceCloseTableSession', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('calls POST /api/v1/table-sessions/{id}/force-close', async () => {
    const sessionId = 'session-123';
    global.fetch = jest.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: true,
          code: 'OK',
          status: 200,
          data: { id: sessionId, status: 'CLOSED' },
        }),
    });

    await forceCloseTableSession(sessionId, {
      close_reason: 'emergency',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/v1/table-sessions/${sessionId}/force-close`,
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('sends request body matching ForceCloseTableSessionRequestBody', async () => {
    const sessionId = 'session-456';
    global.fetch = jest.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: true,
          code: 'OK',
          status: 200,
          data: { id: sessionId, status: 'CLOSED' },
        }),
    });

    await forceCloseTableSession(sessionId, {
      close_reason: 'security_hold',
      close_note: 'Suspicious activity reported',
    });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);

    expect(body).toEqual({
      close_reason: 'security_hold',
      close_note: 'Suspicious activity reported',
    });
  });

  it('sends Idempotency-Key header when provided', async () => {
    const sessionId = 'session-789';
    const idempotencyKey = 'idem-key-abc';
    global.fetch = jest.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: true,
          code: 'OK',
          status: 200,
          data: { id: sessionId, status: 'CLOSED' },
        }),
    });

    await forceCloseTableSession(
      sessionId,
      { close_reason: 'emergency' },
      idempotencyKey,
    );

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const headers = fetchCall[1].headers;

    expect(headers[IDEMPOTENCY_HEADER]).toBe(idempotencyKey);
  });
});

/**
 * @jest-environment node
 *
 * Close Session HTTP Fetcher Tests (PRD-038A WS4)
 *
 * Validates closeTableSession sends Idempotency-Key header.
 */

import { IDEMPOTENCY_HEADER } from '@/lib/http/headers';
import { closeTableSession } from '@/services/table-context/http';

describe('closeTableSession', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends Idempotency-Key header on close request', async () => {
    const sessionId = 'session-close-001';
    const idempotencyKey = 'idem-close-key';
    global.fetch = jest.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: true,
          code: 'OK',
          status: 200,
          data: { id: sessionId, status: 'CLOSED' },
        }),
    });

    await closeTableSession(
      sessionId,
      { close_reason: 'end_of_shift' },
      idempotencyKey,
    );

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const headers = fetchCall[1].headers;

    expect(headers[IDEMPOTENCY_HEADER]).toBe(idempotencyKey);
  });
});

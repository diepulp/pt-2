/** @jest-environment node */

/**
 * Route contract tests: GET /api/v1/table-context/operational-projection
 *
 * PRD-088 DEC-EXEC-4: casinoId from rlsContext only — not from query params.
 * ADR-054 R4: type field is always 'estimated' — no layer may upgrade to 'actual'.
 */

import { NextRequest } from 'next/server';

import { GET } from '../route';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/supabase/service', () => ({
  createServiceClient: jest.fn().mockReturnValue({}),
}));

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-proj-1', actorId: 'actor-1' },
      startedAt: Date.now(),
    }),
  ),
}));

jest.mock('@/services/player-financial/crud', () => ({
  getShiftOperationalCompleteness: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getShiftOperationalCompleteness } =
  require('@/services/player-financial/crud') as {
    getShiftOperationalCompleteness: jest.Mock;
  };

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL(
    'http://localhost/api/v1/table-context/operational-projection',
  );
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

const VALID_PARAMS = {
  gamingDay: '2026-05-21',
  tableId: '11111111-1111-1111-1111-111111111111',
};

beforeEach(() => {
  jest.clearAllMocks();
  getShiftOperationalCompleteness.mockResolvedValue({
    status: 'complete',
    totalCents: 10000,
    count: 3,
    type: 'estimated',
  });
});

describe('GET /api/v1/table-context/operational-projection — validation', () => {
  it('returns 400 when gamingDay param is missing', async () => {
    const req = makeRequest({ tableId: VALID_PARAMS.tableId });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when gamingDay format is invalid (not YYYY-MM-DD)', async () => {
    const req = makeRequest({
      gamingDay: '21-05-2026',
      tableId: VALID_PARAMS.tableId,
    });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when tableId is missing', async () => {
    const req = makeRequest({ gamingDay: VALID_PARAMS.gamingDay });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when tableId is not a valid UUID', async () => {
    const req = makeRequest({
      gamingDay: VALID_PARAMS.gamingDay,
      tableId: 'not-a-uuid',
    });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/table-context/operational-projection — success', () => {
  it('returns 200 with OperationalProjectionResponseDTO shape', async () => {
    const req = makeRequest(VALID_PARAMS);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: {
        totalCents: expect.any(Number),
        count: expect.any(Number),
        completeness: { status: expect.any(String) },
        type: 'estimated',
      },
      requestId: expect.any(String),
    });
  });

  it('ADR-054 R4: type field is always estimated — no layer may upgrade to actual', async () => {
    const req = makeRequest(VALID_PARAMS);
    const res = await GET(req);
    const body = await res.json();
    expect(body.data.type).toBe('estimated');
    expect(body.data.type).not.toBe('actual');
    expect(body.data.type).not.toBe('observed');
    expect(body.data.type).not.toBe('compliance');
  });

  it('DEC-EXEC-4: casinoId is from rlsContext, not from query params', async () => {
    const req = makeRequest({ ...VALID_PARAMS, casinoId: 'attacker-casino' });
    await GET(req);
    expect(getShiftOperationalCompleteness).toHaveBeenCalledWith(
      null, // route passes null → crud creates service client internally
      'casino-proj-1', // from mocked rlsContext, not from query param
      VALID_PARAMS.gamingDay,
      VALID_PARAMS.tableId,
    );
  });

  it('passes gamingDay and tableId from query params to service function', async () => {
    const req = makeRequest(VALID_PARAMS);
    await GET(req);
    expect(getShiftOperationalCompleteness).toHaveBeenCalledWith(
      null,
      'casino-proj-1',
      '2026-05-21',
      '11111111-1111-1111-1111-111111111111',
    );
  });

  it('completeness status from service is reflected in response', async () => {
    getShiftOperationalCompleteness.mockResolvedValue({
      status: 'partial',
      totalCents: 5000,
      count: 2,
      type: 'estimated',
    });
    const req = makeRequest(VALID_PARAMS);
    const res = await GET(req);
    const body = await res.json();
    expect(body.data.completeness.status).toBe('partial');
    expect(body.data.totalCents).toBe(5000);
    expect(body.data.count).toBe(2);
  });
});

/** @jest-environment node */

/**
 * Visit Detail Route Handler — Boundary Test
 *
 * Tests GET /api/v1/visits/[visitId] at the HTTP boundary layer.
 * Validates request -> response shape, visitId passthrough from route params,
 * and error handling when visit not found.
 *
 * Mock strategy:
 * - withServerAction: intercepted to inject controlled MiddlewareContext
 * - createClient: mocked to avoid next/headers cookies() in Jest
 *
 * Modeled on Player exemplar: player-route-boundary.test.ts
 *
 * @see TESTING_GOVERNANCE_STANDARD.md §3.4
 * @see EXEC-SLICE-THREE-testing-posture.md WS3
 */

import { NextRequest } from 'next/server';

import type { ServiceResult } from '@/lib/http/service-response';

// ---------------------------------------------------------------------------
// Track .eq() calls to assert visitId passthrough
// ---------------------------------------------------------------------------
const eqSpy = jest.fn();

function createChainableSupabase(mockData: unknown, mockError: unknown = null) {
  const maybeSingle = jest
    .fn()
    .mockResolvedValue({ data: mockData, error: mockError });
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });

  // Record eq calls on the shared spy so assertions can inspect them
  eq.mockImplementation((...args: unknown[]) => {
    eqSpy(...args);
    return { maybeSingle };
  });

  return {
    from: jest.fn().mockReturnValue({ select }),
    _internals: { select, eq, maybeSingle },
  };
}

// ---------------------------------------------------------------------------
// Fixture: minimal VisitDTO shape
// ---------------------------------------------------------------------------
const VISIT_FIXTURE = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  player_id: '660e8400-e29b-41d4-a716-446655440000',
  casino_id: 'casino-abc-123',
  visit_kind: 'gaming_identified_rated',
  started_at: '2026-03-14T10:00:00Z',
  ended_at: null,
  visit_group_id: '550e8400-e29b-41d4-a716-446655440000',
  gaming_day: '2026-03-14',
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
let mockSupabase: ReturnType<typeof createChainableSupabase>;

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn(
    async (
      _supabase: unknown,
      handler: (
        ctx: Record<string, unknown>,
      ) => Promise<ServiceResult<unknown>>,
      _options: unknown,
    ) => {
      // Inject our controlled context — the handler receives MiddlewareContext
      return handler({
        supabase: mockSupabase,
        correlationId: 'test-correlation-id',
        startedAt: Date.now(),
        rlsContext: {
          actorId: 'actor-001',
          casinoId: 'casino-abc-123',
          staffRole: 'pit_boss',
        },
      });
    },
  ),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are in place
// ---------------------------------------------------------------------------
import { GET } from '@/app/api/v1/visits/[visitId]/route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/visits/[visitId] — boundary test', () => {
  const visitId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    jest.clearAllMocks();
    eqSpy.mockClear();
    // Default: happy-path supabase returning valid visit
    mockSupabase = createChainableSupabase(VISIT_FIXTURE);
  });

  it('returns 200 with visit shape when found', async () => {
    const request = new NextRequest(
      new URL(`/api/v1/visits/${visitId}`, 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request, {
      params: Promise.resolve({ visitId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: {
        id: VISIT_FIXTURE.id,
        player_id: VISIT_FIXTURE.player_id,
        casino_id: VISIT_FIXTURE.casino_id,
        visit_kind: VISIT_FIXTURE.visit_kind,
        started_at: VISIT_FIXTURE.started_at,
        gaming_day: VISIT_FIXTURE.gaming_day,
      },
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('passes visitId from route params through to query', async () => {
    const request = new NextRequest(
      new URL(`/api/v1/visits/${visitId}`, 'http://localhost:3000'),
      { method: 'GET' },
    );

    await GET(request, { params: Promise.resolve({ visitId }) });

    // Verify the query chain was: from('visit').select(...).eq('id', visitId).maybeSingle()
    expect(mockSupabase.from).toHaveBeenCalledWith('visit');
    expect(eqSpy).toHaveBeenCalledWith('id', visitId);
  });

  it('returns 404 when visit not found', async () => {
    // Simulate no visit found — maybeSingle returns null data
    mockSupabase = createChainableSupabase(null);

    // Re-wire the mock to use the new mockSupabase
    const { withServerAction } = jest.requireMock(
      '@/lib/server-actions/middleware',
    ) as { withServerAction: jest.Mock };

    withServerAction.mockImplementationOnce(
      async (
        _supabase: unknown,
        handler: (
          ctx: Record<string, unknown>,
        ) => Promise<ServiceResult<unknown>>,
      ) => {
        return handler({
          supabase: mockSupabase,
          correlationId: 'test-err-correlation',
          startedAt: Date.now(),
          rlsContext: {
            actorId: 'actor-001',
            casinoId: 'casino-abc-123',
            staffRole: 'pit_boss',
          },
        });
      },
    );

    const request = new NextRequest(
      new URL(`/api/v1/visits/${visitId}`, 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request, {
      params: Promise.resolve({ visitId }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      ok: false,
      code: 'VISIT_NOT_FOUND',
      error: expect.stringContaining('not found'),
    });
  });
});

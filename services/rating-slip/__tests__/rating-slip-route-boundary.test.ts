/** @jest-environment node */

/**
 * RatingSlip Detail Route Handler — Boundary Test
 *
 * Tests GET /api/v1/rating-slips/[id] at the HTTP boundary layer.
 * Validates request -> response shape, id passthrough from route params,
 * and error handling when rating slip not found.
 *
 * Mock strategy:
 * - withServerAction: intercepted to inject controlled MiddlewareContext
 * - createClient: mocked to avoid next/headers cookies() in Jest
 *
 * Modeled on Player exemplar: player-route-boundary.test.ts
 *
 * @see TESTING_GOVERNANCE_STANDARD.md S3.4
 * @see PRD-002 Rating Slip Service
 */

import { NextRequest } from 'next/server';

import type { ServiceResult } from '@/lib/http/service-response';

// ---------------------------------------------------------------------------
// Track .eq() calls to assert id passthrough
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
// Fixture: minimal RatingSlipWithPausesDTO shape
// ---------------------------------------------------------------------------
const SLIP_FIXTURE = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  casino_id: 'casino-abc-123',
  visit_id: '660e8400-e29b-41d4-a716-446655440000',
  table_id: '770e8400-e29b-41d4-a716-446655440000',
  seat_number: '3',
  start_time: '2026-03-14T10:00:00Z',
  end_time: null,
  status: 'open',
  average_bet: 100,
  game_settings: { min_bet: 25 },
  policy_snapshot: null,
  previous_slip_id: null,
  move_group_id: null,
  accumulated_seconds: 0,
  final_duration_seconds: null,
  rating_slip_pause: [],
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
import { GET } from '@/app/api/v1/rating-slips/[id]/route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/rating-slips/[id] — boundary test', () => {
  const slipId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    jest.clearAllMocks();
    eqSpy.mockClear();
    // Default: happy-path supabase returning valid slip
    mockSupabase = createChainableSupabase(SLIP_FIXTURE);
  });

  it('returns 200 with rating slip shape when found', async () => {
    const request = new NextRequest(
      new URL(`/api/v1/rating-slips/${slipId}`, 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: slipId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: {
        id: SLIP_FIXTURE.id,
        casino_id: SLIP_FIXTURE.casino_id,
        visit_id: SLIP_FIXTURE.visit_id,
        table_id: SLIP_FIXTURE.table_id,
        status: 'open',
        pauses: [],
      },
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('passes id from route params through to query', async () => {
    const request = new NextRequest(
      new URL(`/api/v1/rating-slips/${slipId}`, 'http://localhost:3000'),
      { method: 'GET' },
    );

    await GET(request, { params: Promise.resolve({ id: slipId }) });

    // Verify the query chain was: from('rating_slip').select(...).eq('id', slipId).maybeSingle()
    expect(mockSupabase.from).toHaveBeenCalledWith('rating_slip');
    expect(eqSpy).toHaveBeenCalledWith('id', slipId);
  });

  it('returns 404 when rating slip not found', async () => {
    // Simulate no slip found — maybeSingle returns null data
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
      new URL(`/api/v1/rating-slips/${slipId}`, 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: slipId }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      ok: false,
      code: 'RATING_SLIP_NOT_FOUND',
      error: expect.stringContaining('not found'),
    });
  });
});

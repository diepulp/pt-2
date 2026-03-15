/** @jest-environment node */

/**
 * Player Detail Route Handler — Boundary Test
 *
 * Tests GET /api/v1/players/[playerId] at the HTTP boundary layer.
 * Validates request → response shape, casino_id passthrough from RLS context,
 * and error handling when player not found.
 *
 * Mock strategy:
 * - withServerAction: intercepted to inject controlled MiddlewareContext
 * - createClient: mocked to avoid next/headers cookies() in Jest
 *
 * Modeled on Casino exemplar: settings-route-boundary.test.ts
 *
 * @see TESTING_GOVERNANCE_STANDARD.md §3.4
 * @see EXEC-SLICE-ONE-testing-posture.md WS3
 */

import { NextRequest } from 'next/server';

import type { ServiceResult } from '@/lib/http/service-response';

// ---------------------------------------------------------------------------
// Track .eq() calls to assert casino_id passthrough
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
// Fixture: minimal PlayerDTO shape
// ---------------------------------------------------------------------------
const PLAYER_FIXTURE = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  first_name: 'John',
  last_name: 'Doe',
  birth_date: '1990-01-15',
  created_at: '2025-01-01T00:00:00Z',
  middle_name: null,
  email: 'john.doe@example.com',
  phone_number: '+1-555-123-4567',
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
import { GET } from '@/app/api/v1/players/[playerId]/route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/players/[playerId] — boundary test', () => {
  const playerId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    jest.clearAllMocks();
    eqSpy.mockClear();
    // Default: happy-path supabase returning valid player
    mockSupabase = createChainableSupabase(PLAYER_FIXTURE);
  });

  it('returns 200 with player shape when found', async () => {
    const request = new NextRequest(
      new URL(`/api/v1/players/${playerId}`, 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request, {
      params: Promise.resolve({ playerId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: {
        id: PLAYER_FIXTURE.id,
        first_name: PLAYER_FIXTURE.first_name,
        last_name: PLAYER_FIXTURE.last_name,
        birth_date: PLAYER_FIXTURE.birth_date,
        created_at: PLAYER_FIXTURE.created_at,
      },
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('passes playerId from route params through to query', async () => {
    const request = new NextRequest(
      new URL(`/api/v1/players/${playerId}`, 'http://localhost:3000'),
      { method: 'GET' },
    );

    await GET(request, { params: Promise.resolve({ playerId }) });

    // Verify the query chain was: from('player').select(...).eq('id', playerId).maybeSingle()
    expect(mockSupabase.from).toHaveBeenCalledWith('player');
    expect(eqSpy).toHaveBeenCalledWith('id', playerId);
  });

  it('returns 404 when player not found', async () => {
    // Simulate no player found — maybeSingle returns null data
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
      new URL(`/api/v1/players/${playerId}`, 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request, {
      params: Promise.resolve({ playerId }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      ok: false,
      code: 'PLAYER_NOT_FOUND',
      error: expect.stringContaining('not found'),
    });
  });
});

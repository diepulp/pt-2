/** @jest-environment node */

/**
 * Floor Layout Route Handler -- Boundary Test
 *
 * Tests GET /api/v1/floor-layouts at the HTTP boundary layer.
 * Validates request -> response shape, casino_id scoping from RLS context,
 * and error handling when required query params are missing.
 *
 * Mock strategy:
 * - withServerAction: intercepted to inject controlled MiddlewareContext
 * - createClient: mocked to avoid next/headers cookies() in Jest
 * - Supabase client: chainable mock that resolves with fixture data
 *
 * @see FLOOR-LAYOUT-POSTURE.md
 * @see services/floor-layout/crud.ts
 */

import { NextRequest } from 'next/server';

import type { ServiceResult } from '@/lib/http/service-response';

// ---------------------------------------------------------------------------
// Track .eq() calls to assert casino_id passthrough
// ---------------------------------------------------------------------------
const eqSpy = jest.fn();

/**
 * Creates a chainable Supabase mock that supports the query chain used by
 * floor-layout crud.ts: from().select().eq().order().order().limit()
 *
 * The chain is thenable (awaited) at the end, returning { data, error }.
 */
function createChainableSupabase(mockData: unknown, mockError: unknown = null) {
  const terminalResult = { data: mockData, error: mockError };

  function createChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    const handler = (..._args: unknown[]) => createChain();

    ['select', 'order', 'limit', 'lt', 'is', 'in', 'single'].forEach(
      (method) => {
        chain[method] = jest.fn(handler);
      },
    );

    chain['eq'] = jest.fn((...args: unknown[]) => {
      eqSpy(...args);
      return createChain();
    });

    chain['then'] = (
      resolve: (v: typeof terminalResult) => void,
      reject?: (e: unknown) => void,
    ) => {
      return Promise.resolve(terminalResult).then(resolve, reject);
    };

    return chain;
  }

  return {
    from: jest.fn(() => createChain()),
    rpc: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CASINO_ID = '550e8400-e29b-41d4-a716-446655440000';

// ---------------------------------------------------------------------------
// Fixture: minimal floor_layout rows (pre-mapper shape)
// ---------------------------------------------------------------------------
const LAYOUTS_FIXTURE = [
  {
    id: '660e8400-e29b-41d4-a716-446655440001',
    casino_id: CASINO_ID,
    name: 'Main Floor',
    description: 'Primary casino floor layout',
    status: 'approved',
    created_by: '770e8400-e29b-41d4-a716-446655440001',
    created_at: '2025-06-01T00:00:00Z',
    updated_at: '2025-06-01T00:00:00Z',
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440002',
    casino_id: CASINO_ID,
    name: 'VIP Section',
    description: 'VIP gaming area',
    status: 'draft',
    created_by: '770e8400-e29b-41d4-a716-446655440001',
    created_at: '2025-05-15T00:00:00Z',
    updated_at: '2025-05-20T00:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Mocks — jest.mock is hoisted, so inline the casino_id literal
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
      return handler({
        supabase: mockSupabase,
        correlationId: 'test-correlation-id',
        startedAt: Date.now(),
        rlsContext: {
          actorId: '880e8400-e29b-41d4-a716-446655440001',
          casinoId: '550e8400-e29b-41d4-a716-446655440000',
          staffRole: 'pit_boss',
        },
      });
    },
  ),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are in place
// ---------------------------------------------------------------------------
import { GET } from '@/app/api/v1/floor-layouts/route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/floor-layouts -- boundary test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eqSpy.mockClear();
    mockSupabase = createChainableSupabase(LAYOUTS_FIXTURE);
  });

  it('returns 200 with layout list shape when casino context is set', async () => {
    const request = new NextRequest(
      new URL(
        `/api/v1/floor-layouts?casino_id=${CASINO_ID}`,
        'http://localhost:3000',
      ),
      { method: 'GET' },
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: {
        items: expect.arrayContaining([
          expect.objectContaining({
            id: '660e8400-e29b-41d4-a716-446655440001',
            casino_id: CASINO_ID,
            name: 'Main Floor',
          }),
        ]),
      },
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('passes casino_id from query params through to Supabase query', async () => {
    const request = new NextRequest(
      new URL(
        `/api/v1/floor-layouts?casino_id=${CASINO_ID}`,
        'http://localhost:3000',
      ),
      { method: 'GET' },
    );

    await GET(request);

    expect(mockSupabase.from).toHaveBeenCalledWith('floor_layout');
    expect(eqSpy).toHaveBeenCalledWith('casino_id', CASINO_ID);
  });

  it('returns error when casino_id query param is missing', async () => {
    const request = new NextRequest(
      new URL('/api/v1/floor-layouts', 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      ok: false,
    });
  });
});

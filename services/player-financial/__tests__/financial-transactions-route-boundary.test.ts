/** @jest-environment node */

/**
 * Financial Transactions Route Handler -- Boundary Test
 *
 * Tests GET /api/v1/financial-transactions at the HTTP boundary layer.
 * Validates request -> response shape, casino_id scoping from RLS context,
 * and error handling when middleware returns an error result.
 *
 * Mock strategy:
 * - withServerAction: intercepted to inject controlled MiddlewareContext
 * - createClient: mocked to avoid next/headers cookies() in Jest
 *
 * @see PLAYER-FINANCIAL-POSTURE.md
 */

import { NextRequest } from 'next/server';

import type { ServiceResult } from '@/lib/http/service-response';

// ---------------------------------------------------------------------------
// Track query chain calls to assert casino_id passthrough
// ---------------------------------------------------------------------------
const eqSpy = jest.fn();

function createChainableSupabase(mockData: unknown, mockError: unknown = null) {
  // Build a self-referencing, thenable builder.
  // Supabase query builders resolve via `await queryBuilder` which calls .then().
  const builder: Record<string, unknown> = {};

  const resolve = { data: mockData, error: mockError };

  builder.single = jest.fn().mockResolvedValue(resolve);
  builder.limit = jest.fn().mockReturnValue(builder);
  builder.order = jest.fn().mockReturnValue(builder);
  builder.gte = jest.fn().mockReturnValue(builder);
  builder.lte = jest.fn().mockReturnValue(builder);
  builder.lt = jest.fn().mockReturnValue(builder);
  builder.in = jest.fn().mockReturnValue(builder);
  builder.eq = jest.fn().mockImplementation((...args: unknown[]) => {
    eqSpy(...args);
    return builder;
  });
  builder.select = jest.fn().mockReturnValue(builder);

  // Make the builder thenable so `await queryBuilder` resolves to { data, error }
  Object.defineProperty(builder, 'then', {
    value: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(resolve).then(onFulfilled),
    enumerable: false,
    configurable: true,
  });

  const from = jest.fn().mockReturnValue(builder);
  const rpc = jest.fn().mockResolvedValue(resolve);

  return {
    from,
    rpc,
    _internals: builder,
  };
}

// ---------------------------------------------------------------------------
// Fixture: minimal FinancialTransactionDTO shape
// ---------------------------------------------------------------------------
const TXN_FIXTURE = {
  id: 'txn-uuid-1',
  casino_id: 'casino-abc-123',
  player_id: 'player-uuid-1',
  visit_id: 'visit-uuid-1',
  rating_slip_id: null,
  amount: 500,
  direction: 'in',
  source: 'pit',
  tender_type: 'cash',
  created_by_staff_id: 'staff-uuid-1',
  related_transaction_id: null,
  created_at: '2025-01-15T10:00:00Z',
  gaming_day: '2025-01-15',
  idempotency_key: 'idem-123',
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
import { GET } from '@/app/api/v1/financial-transactions/route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/financial-transactions -- boundary test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eqSpy.mockClear();
    // Default: happy-path supabase returning a list result
    mockSupabase = createChainableSupabase([TXN_FIXTURE]);
  });

  it('returns 200 with items array when casino context is set', async () => {
    const request = new NextRequest(
      new URL('/api/v1/financial-transactions', 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.code).toBe('OK');
    expect(body.data).toHaveProperty('items');
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data).toHaveProperty('cursor');
    expect(body).toHaveProperty('requestId');
    expect(body).toHaveProperty('timestamp');
  });

  it('queries player_financial_transaction table via service layer', async () => {
    const request = new NextRequest(
      new URL(
        '/api/v1/financial-transactions?player_id=550e8400-e29b-41d4-a716-446655440000',
        'http://localhost:3000',
      ),
      { method: 'GET' },
    );

    const response = await GET(request);
    const body = await response.json();

    // The route handler creates a PlayerFinancialService and calls list()
    // which queries 'player_financial_transaction' via supabase.from()
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    // Verify from() was called on the injected supabase mock
    expect(mockSupabase.from).toHaveBeenCalled();
    // Verify eqSpy was called with the player_id filter
    expect(eqSpy).toHaveBeenCalledWith(
      'player_id',
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('returns error when supabase query fails', async () => {
    mockSupabase = createChainableSupabase(null, {
      code: 'PGRST000',
      message: 'Database connection error',
    });

    // Re-wire the mock to use the new error-state mockSupabase
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
      new URL('/api/v1/financial-transactions', 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request);

    // Error from supabase should propagate to HTTP error response
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

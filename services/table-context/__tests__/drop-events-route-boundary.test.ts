/** @jest-environment node */

/**
 * Drop Events Route Handler — Boundary Test
 *
 * Tests GET /api/v1/table-context/drop-events at the HTTP boundary layer.
 * Validates request -> response shape, RLS-scoped supabase passthrough,
 * and error handling when middleware returns an error result.
 *
 * Mock strategy:
 * - withServerAction: intercepted to inject controlled MiddlewareContext
 * - createClient: mocked to avoid next/headers cookies() in Jest
 *
 * @see CONTEXT-ROLLOUT-TEMPLATE.md Step 5
 * @see settings-route-boundary.test.ts (Casino exemplar)
 */

import { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
import type { ServiceResult } from '@/lib/http/service-response';

// ---------------------------------------------------------------------------
// Track query chain calls to assert table and ordering
// ---------------------------------------------------------------------------
const fromSpy = jest.fn();
const selectSpy = jest.fn();
const orderSpy = jest.fn();
const rpcSpy = jest.fn();

function createChainableSupabase(mockData: unknown, mockError: unknown = null) {
  // The final call in the chain resolves to { data, error }
  const terminalPromise = Promise.resolve({ data: mockData, error: mockError });

  // Build chainable — each method returns the chain + thenable
  const chain = {
    select: selectSpy,
    order: orderSpy,
    eq: jest.fn(),
    not: jest.fn(),
    is: jest.fn(),
    then: (terminalPromise as PromiseLike<unknown>).then.bind(terminalPromise),
  };

  // Each chainable method returns the chain itself
  selectSpy.mockReturnValue(chain);
  orderSpy.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.not.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);

  fromSpy.mockReturnValue(chain);

  // RPC mock for rpc_current_gaming_day
  rpcSpy.mockResolvedValue({ data: '2026-04-01', error: null });

  return {
    from: fromSpy,
    rpc: rpcSpy,
  };
}

// ---------------------------------------------------------------------------
// Fixture: minimal drop event list shape
// ---------------------------------------------------------------------------
const DROP_EVENTS_FIXTURE = [
  {
    id: 'drop-001',
    casino_id: 'casino-abc-123',
    table_id: 'table-001',
    drop_box_id: 'box-001',
    seal_no: 'SEAL-123',
    removed_at: '2026-04-01T08:00:00Z',
    gaming_day: '2026-04-01',
  },
  {
    id: 'drop-002',
    casino_id: 'casino-abc-123',
    table_id: 'table-002',
    drop_box_id: 'box-002',
    seal_no: 'SEAL-456',
    removed_at: '2026-04-01T09:00:00Z',
    gaming_day: '2026-04-01',
  },
];

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

// Mock the chip-custody service module to isolate the route handler
jest.mock('@/services/table-context/chip-custody', () => ({
  listDropEvents: jest.fn().mockResolvedValue([]),
  logDropEvent: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Import route handler and mocked service AFTER mocks are in place
// ---------------------------------------------------------------------------
import { GET } from '@/app/api/v1/table-context/drop-events/route';
import { listDropEvents } from '@/services/table-context/chip-custody';

const mockListDropEvents = listDropEvents as jest.MockedFunction<
  typeof listDropEvents
>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/table-context/drop-events — boundary test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fromSpy.mockClear();
    selectSpy.mockClear();
    orderSpy.mockClear();
    rpcSpy.mockClear();
    mockSupabase = createChainableSupabase(DROP_EVENTS_FIXTURE);
    mockListDropEvents.mockResolvedValue(DROP_EVENTS_FIXTURE as never);
  });

  it('returns 200 with drop events list shape', async () => {
    const request = new NextRequest(
      new URL('/api/v1/table-context/drop-events', 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.any(Array),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('passes RLS-scoped supabase through to listDropEvents service', async () => {
    const request = new NextRequest(
      new URL('/api/v1/table-context/drop-events', 'http://localhost:3000'),
      { method: 'GET' },
    );

    await GET(request);

    // Verify listDropEvents was called with the RLS-scoped supabase client
    // from middleware context (casino_id scoping is enforced via RLS policies)
    expect(mockListDropEvents).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({}),
    );
  });

  it('returns error when service throws DomainError', async () => {
    // Simulate service-level error (e.g., INTERNAL_ERROR from Supabase)
    mockListDropEvents.mockRejectedValueOnce(
      new DomainError('INTERNAL_ERROR', 'Database connection failed'),
    );

    // Re-wire the mock to use the error-throwing service
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
      new URL('/api/v1/table-context/drop-events', 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      ok: false,
      code: 'INTERNAL_ERROR',
      error: expect.stringContaining('Database connection failed'),
    });
  });
});

/** @jest-environment node */

/**
 * Valuation Policy Route Handler -- Boundary Test
 *
 * Tests GET /api/v1/loyalty/valuation-policy at the HTTP boundary layer.
 * Validates request -> response shape, casino_id passthrough from RLS context,
 * and error handling when no active policy exists.
 *
 * Mock strategy:
 * - withServerAction: intercepted to inject controlled MiddlewareContext
 * - createClient: mocked to avoid next/headers cookies() in Jest
 *
 * @see CONTEXT-ROLLOUT-TEMPLATE.md Step 5
 * @see ISSUE-C4D2AA48 Valuation serialization bug
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

  const eq: jest.Mock = jest.fn();

  // Record eq calls on the shared spy and return self-referencing chain
  eq.mockImplementation((...args: unknown[]) => {
    eqSpy(...args);
    return { eq, maybeSingle };
  });

  const select = jest.fn().mockReturnValue({ eq });

  return {
    from: jest.fn().mockReturnValue({ select }),
    rpc: jest.fn(),
    _internals: { select, eq, maybeSingle },
  };
}

// ---------------------------------------------------------------------------
// Fixture: minimal ValuationPolicyDTO shape (snake_case DB row)
// ---------------------------------------------------------------------------
const POLICY_FIXTURE = {
  id: 'policy-001',
  casino_id: 'casino-abc-123',
  cents_per_point: 2,
  effective_date: '2026-03-20',
  version_identifier: 'admin-2026-03-20',
  is_active: true,
  created_by_staff_id: 'staff-001',
  created_at: '2026-03-20T12:00:00Z',
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
      // Inject our controlled context -- the handler receives MiddlewareContext
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
import { GET } from '@/app/api/v1/loyalty/valuation-policy/route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/loyalty/valuation-policy -- boundary test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eqSpy.mockClear();
    // Default: happy-path supabase returning valid policy
    mockSupabase = createChainableSupabase(POLICY_FIXTURE);
  });

  it('returns 200 with policy shape when active policy exists', async () => {
    const request = new NextRequest(
      new URL('/api/v1/loyalty/valuation-policy', 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: {
        id: POLICY_FIXTURE.id,
        casinoId: POLICY_FIXTURE.casino_id,
        centsPerPoint: POLICY_FIXTURE.cents_per_point,
        effectiveDate: POLICY_FIXTURE.effective_date,
        versionIdentifier: POLICY_FIXTURE.version_identifier,
        isActive: POLICY_FIXTURE.is_active,
        createdByStaffId: POLICY_FIXTURE.created_by_staff_id,
        createdAt: POLICY_FIXTURE.created_at,
      },
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('passes casino_id from RLS context through to query', async () => {
    const request = new NextRequest(
      new URL('/api/v1/loyalty/valuation-policy', 'http://localhost:3000'),
      { method: 'GET' },
    );

    await GET(request);

    // Verify the query chain was:
    // from('loyalty_valuation_policy').select('*').eq('casino_id', ...).eq('is_active', true).maybeSingle()
    expect(mockSupabase.from).toHaveBeenCalledWith('loyalty_valuation_policy');
    expect(eqSpy).toHaveBeenCalledWith('casino_id', 'casino-abc-123');
    expect(eqSpy).toHaveBeenCalledWith('is_active', true);
  });

  it('returns 200 with null data when no active policy exists', async () => {
    // Simulate no active policy -- maybeSingle returns null data
    mockSupabase = createChainableSupabase(null);

    const request = new NextRequest(
      new URL('/api/v1/loyalty/valuation-policy', 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request);
    const body = await response.json();

    // Route returns 200 with null data (not 404) -- admin form handles "not configured" state
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: null,
    });
  });
});

/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/mtl/gaming-day-summary
 *
 * Tests GET endpoint for MTL Gaming Day Summary - the compliance authority surface.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: ISSUE-607F9CCB (Route Handler Testing Coverage Gap)
 * Workstream: WS8 (PRD-005 Phase 3 - Auxiliary Tests)
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

import { GET } from '../route';

// Mock Supabase client with proper query builder chaining
jest.mock('@/lib/supabase/server', () => {
  const createMockQueryBuilder = () => {
    const builder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    // Add Promise resolution to support await
    builder.then = function (resolve: (value: any) => void) {
      resolve({ data: [], error: null });
      return Promise.resolve({ data: [], error: null });
    };
    return builder;
  };

  const mockClient = {
    from: jest.fn(() => createMockQueryBuilder()),
  };

  return {
    createClient: jest.fn().mockResolvedValue(mockClient),
  };
});

// Mock middleware to bypass auth/RLS in unit tests
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {
        from: jest.fn(() => {
          const builder = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            gte: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            maybeSingle: jest
              .fn()
              .mockResolvedValue({ data: null, error: null }),
          };
          builder.then = function (resolve: (value: any) => void) {
            resolve({ data: [], error: null });
            return Promise.resolve({ data: [], error: null });
          };
          return builder;
        }),
      },
      correlationId: 'test-correlation-id',
      rlsContext: {
        casinoId: 'casino-1',
        actorId: 'actor-1',
        role: 'pit_boss',
      },
    }),
  ),
}));

// Mock RLS assertions to allow pit_boss role
jest.mock('@/lib/supabase/rls-context', () => ({
  assertRole: jest.fn(),
}));

describe('GET /api/v1/mtl/gaming-day-summary', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        gaming_day: '2026-01-03',
      },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.any(Object),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('requires casino_id and gaming_day filters', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        gaming_day: '2026-01-03',
      },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveProperty('items');
  });

  it('returns paginated results with items and next_cursor', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        gaming_day: '2026-01-03',
      },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(
      expect.objectContaining({
        items: expect.any(Array),
      }),
    );
    expect(body.data).toHaveProperty('next_cursor');
  });

  it('accepts agg_badge_in filter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        gaming_day: '2026-01-03',
        agg_badge_in: 'agg_ctr_met',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts agg_badge_out filter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        gaming_day: '2026-01-03',
        agg_badge_out: 'agg_ctr_near',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts min_total_in filter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        gaming_day: '2026-01-03',
        min_total_in: '10000',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts min_total_out filter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        gaming_day: '2026-01-03',
        min_total_out: '10000',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts patron_uuid filter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        gaming_day: '2026-01-03',
        patron_uuid: '123e4567-e89b-12d3-a456-426614174001',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts pagination parameters', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        gaming_day: '2026-01-03',
        cursor: 'next-cursor-token',
        limit: '50',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts combined filters', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        gaming_day: '2026-01-03',
        agg_badge_in: 'agg_watchlist',
        min_total_out: '5000',
        limit: '25',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('requires gaming_day parameter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(400);
  });
});

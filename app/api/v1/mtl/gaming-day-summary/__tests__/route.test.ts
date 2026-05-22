/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/mtl/gaming-day-summary
 *
 * Tests GET endpoint for MTL Gaming Day Summary — the compliance authority surface.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 * DEC-1 (EXEC-071 WS3): casino_id REMOVE — service always receives RLS context casino_id.
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: {
        casinoId: 'casino-1',
        actorId: 'actor-1',
        staffRole: 'pit_boss',
      },
    }),
  ),
}));

// Service-level mock — casino_id always comes from RLS context (DEC-1, EXEC-071 WS1)
const mockGetGamingDaySummary = jest.fn().mockResolvedValue({
  items: [],
  next_cursor: null,
});
jest.mock('@/services/mtl', () => ({
  createMtlService: jest.fn(() => ({
    getGamingDaySummary: (...args: unknown[]) =>
      mockGetGamingDaySummary(...args),
  })),
}));

// Import route handler AFTER mocks so module-level mock variables are initialized
import { GET } from '../route';

describe('GET /api/v1/mtl/gaming-day-summary', () => {
  beforeEach(() => {
    mockGetGamingDaySummary.mockClear();
    mockGetGamingDaySummary.mockResolvedValue({ items: [], next_cursor: null });
  });

  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: { gaming_day: '2026-01-03' },
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

  it('returns paginated results with items and next_cursor', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: { gaming_day: '2026-01-03' },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(
      expect.objectContaining({ items: expect.any(Array) }),
    );
    expect(body.data).toHaveProperty('next_cursor');
  });

  it('accepts gaming_day filter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: { gaming_day: '2026-01-03' },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it('accepts agg_badge_in filter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: { gaming_day: '2026-01-03', agg_badge_in: 'agg_ctr_met' },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it('accepts agg_badge_out filter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: { gaming_day: '2026-01-03', agg_badge_out: 'agg_ctr_near' },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it('accepts min_total_in filter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: { gaming_day: '2026-01-03', min_total_in: '10000' },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it('accepts min_total_out filter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: { gaming_day: '2026-01-03', min_total_out: '10000' },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it('accepts patron_uuid filter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: {
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
      searchParams: {},
    });
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  // ── DEC-1 (EXEC-071 WS1/WS3): casino_id REMOVE ─────────────────────────────
  // casino_id is never accepted from clients. The service always receives
  // mwCtx.rlsContext!.casinoId regardless of any query param.

  it('DEC-1: does not forward spoofed casino_id query param to service', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: {
        casino_id: 'spoofed-casino-999',
        gaming_day: '2026-01-03',
      },
    });
    await GET(request);

    expect(mockGetGamingDaySummary).toHaveBeenCalledWith(
      expect.objectContaining({ casino_id: 'casino-1' }),
    );
    expect(mockGetGamingDaySummary).not.toHaveBeenCalledWith(
      expect.objectContaining({ casino_id: 'spoofed-casino-999' }),
    );
  });

  it('DEC-1: request with spoofed casino_id still returns 200 (param is stripped)', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/gaming-day-summary', {
      searchParams: {
        casino_id: 'spoofed-casino-999',
        gaming_day: '2026-01-03',
      },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});

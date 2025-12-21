/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/visits
 *
 * Tests GET (list) and POST (create) collection endpoints.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS2 (VisitService Route Handler Tests)
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

import { GET, POST } from '../route';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    from: jest.fn(),
  }),
}));

// Mock middleware to bypass auth/RLS in unit tests
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
    }),
  ),
}));

// Mock visit service
jest.mock('@/services/visit', () => ({
  createVisitService: jest.fn(() => ({
    list: jest.fn().mockResolvedValue({
      items: [],
      cursor: null,
    }),
    // P2 fix (ISSUE-983EFA10): startVisit now returns { visit, isNew }
    startVisit: jest.fn().mockResolvedValue({
      visit: {
        id: 'visit-123',
        player_id: 'player-1',
        casino_id: 'casino-1',
        visit_kind: 'gaming_identified_rated',
        started_at: '2025-01-01T10:00:00Z',
        ended_at: null,
      },
      isNew: true,
    }),
    getActiveForPlayer: jest.fn().mockResolvedValue({
      has_active_visit: false,
      visit: null,
    }),
  })),
}));

describe('GET /api/v1/visits', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest('GET', '/api/v1/visits');
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

  it('accepts player_id filter', async () => {
    const request = createMockRequest('GET', '/api/v1/visits', {
      searchParams: { player_id: '123e4567-e89b-12d3-a456-426614174000' },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveProperty('items');
    expect(body.data).toHaveProperty('cursor');
  });

  it('accepts status filter', async () => {
    const request = createMockRequest('GET', '/api/v1/visits', {
      searchParams: { status: 'active' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts date range filters', async () => {
    const request = createMockRequest('GET', '/api/v1/visits', {
      searchParams: {
        from_date: '2025-01-01',
        to_date: '2025-01-31',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts cursor pagination', async () => {
    const request = createMockRequest('GET', '/api/v1/visits', {
      searchParams: {
        cursor: 'next-page-token',
        limit: '20',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });
});

describe('POST /api/v1/visits', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest('POST', '/api/v1/visits', {
      body: {
        player_id: '123e4567-e89b-12d3-a456-426614174000',
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 201 on successful creation (new visit)', async () => {
    const request = createMockRequest('POST', '/api/v1/visits', {
      headers: {
        'Idempotency-Key': 'test-key-123',
        'Content-Type': 'application/json',
      },
      body: {
        player_id: '123e4567-e89b-12d3-a456-426614174000',
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.objectContaining({
        id: expect.any(String),
        player_id: expect.any(String),
      }),
    });
  });
});

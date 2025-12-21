/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/rating-slips
 *
 * Tests GET (list) and POST (create) collection endpoints.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: ISSUE-607F9CCB (Rating Slip Testing Coverage Gap)
 * Workstream: WS2 (QA-ROUTE-TESTING)
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

// Mock rating slip service
jest.mock('@/services/rating-slip', () => ({
  createRatingSlipService: jest.fn(() => ({
    listForTable: jest.fn().mockResolvedValue({
      items: [],
      cursor: null,
    }),
    listForVisit: jest.fn().mockResolvedValue([]),
    listAll: jest.fn().mockResolvedValue({
      items: [],
      cursor: null,
    }),
    start: jest.fn().mockResolvedValue({
      id: 'slip-123',
      status: 'open',
      visitId: 'visit-1',
      tableId: 'table-1',
    }),
  })),
}));

describe('GET /api/v1/rating-slips', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest('GET', '/api/v1/rating-slips');
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

  it('accepts table_id filter', async () => {
    const request = createMockRequest('GET', '/api/v1/rating-slips', {
      searchParams: { table_id: '123e4567-e89b-12d3-a456-426614174000' },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveProperty('items');
    expect(body.data).toHaveProperty('cursor');
  });

  it('accepts visit_id filter', async () => {
    const request = createMockRequest('GET', '/api/v1/rating-slips', {
      searchParams: { visit_id: '123e4567-e89b-12d3-a456-426614174001' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts status filter', async () => {
    const request = createMockRequest('GET', '/api/v1/rating-slips', {
      searchParams: { status: 'open' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });
});

describe('POST /api/v1/rating-slips', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest('POST', '/api/v1/rating-slips', {
      body: {
        visit_id: '123e4567-e89b-12d3-a456-426614174002',
        table_id: '123e4567-e89b-12d3-a456-426614174003',
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 201 on successful creation', async () => {
    const request = createMockRequest('POST', '/api/v1/rating-slips', {
      headers: {
        'Idempotency-Key': 'test-key-123',
        'Content-Type': 'application/json',
      },
      body: {
        visit_id: '123e4567-e89b-12d3-a456-426614174002',
        table_id: '123e4567-e89b-12d3-a456-426614174003',
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
        status: 'open',
      }),
    });
  });
});

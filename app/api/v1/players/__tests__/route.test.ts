/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/players
 *
 * Tests GET (list/search) and POST (create) collection endpoints.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS1 (PlayerService Route Handler Tests)
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

// Mock player service
jest.mock('@/services/player', () => ({
  createPlayerService: jest.fn(() => ({
    search: jest.fn().mockResolvedValue([
      {
        id: 'player-1',
        firstName: 'John',
        lastName: 'Doe',
        isEnrolled: true,
      },
    ]),
    list: jest.fn().mockResolvedValue({
      items: [
        {
          id: 'player-1',
          firstName: 'John',
          lastName: 'Doe',
          status: 'active',
        },
      ],
      cursor: null,
    }),
    create: jest.fn().mockResolvedValue({
      id: 'player-123',
      firstName: 'Jane',
      lastName: 'Smith',
      status: 'active',
      createdAt: new Date().toISOString(),
    }),
  })),
}));

describe('GET /api/v1/players', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope for list', async () => {
    const request = createMockRequest('GET', '/api/v1/players');
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
    expect(body.data).toHaveProperty('items');
    expect(body.data).toHaveProperty('cursor');
  });

  it('handles search query parameter', async () => {
    const request = createMockRequest('GET', '/api/v1/players', {
      searchParams: { q: 'John' },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveProperty('items');
    expect(Array.isArray(body.data.items)).toBe(true);
  });

  it('accepts status filter', async () => {
    const request = createMockRequest('GET', '/api/v1/players', {
      searchParams: { status: 'active' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts cursor for pagination', async () => {
    const request = createMockRequest('GET', '/api/v1/players', {
      searchParams: { cursor: 'next-page-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts limit parameter', async () => {
    const request = createMockRequest('GET', '/api/v1/players', {
      searchParams: { limit: '50' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });
});

describe('POST /api/v1/players', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest('POST', '/api/v1/players', {
      body: {
        first_name: 'Jane',
        last_name: 'Smith',
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 201 on successful creation', async () => {
    const request = createMockRequest('POST', '/api/v1/players', {
      headers: {
        'Idempotency-Key': 'test-key-123',
        'Content-Type': 'application/json',
      },
      body: {
        first_name: 'Jane',
        last_name: 'Smith',
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
        firstName: 'Jane',
        lastName: 'Smith',
      }),
    });
  });

  it('validates required fields', async () => {
    const request = createMockRequest('POST', '/api/v1/players', {
      headers: {
        'Idempotency-Key': 'test-key-456',
        'Content-Type': 'application/json',
      },
      body: {
        first_name: 'Jane',
        // Missing last_name
      },
    });
    const response = await POST(request);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

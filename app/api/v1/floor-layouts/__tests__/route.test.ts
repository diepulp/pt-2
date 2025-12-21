/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/floor-layouts
 *
 * Tests GET (list) and POST (create) collection endpoints.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS9 (QA-ROUTE-TESTING-FLOOR-LAYOUT)
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

import { GET, POST } from '../route';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    from: jest.fn(),
    rpc: jest.fn(),
  }),
}));

// Mock middleware to bypass auth/RLS in unit tests
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {
        rpc: jest.fn().mockResolvedValue({
          data: {
            id: '123e4567-e89b-12d3-a456-426614174000',
            casino_id: 'casino-1',
            name: 'Main Floor',
            status: 'draft',
          },
          error: null,
        }),
      },
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
    }),
  ),
}));

// Mock floor layout service
jest.mock('@/services/floor-layout', () => ({
  createFloorLayoutService: jest.fn(() => ({
    listLayouts: jest.fn().mockResolvedValue({
      items: [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          casino_id: 'casino-1',
          name: 'Main Floor',
          status: 'active',
        },
      ],
      cursor: null,
    }),
  })),
}));

describe('GET /api/v1/floor-layouts', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest('GET', '/api/v1/floor-layouts', {
      searchParams: { casino_id: '123e4567-e89b-12d3-a456-426614174000' },
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

  it('accepts casino_id filter', async () => {
    const request = createMockRequest('GET', '/api/v1/floor-layouts', {
      searchParams: { casino_id: '123e4567-e89b-12d3-a456-426614174000' },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveProperty('items');
    expect(body.data).toHaveProperty('cursor');
  });

  it('accepts status filter', async () => {
    const request = createMockRequest('GET', '/api/v1/floor-layouts', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'draft',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts cursor pagination', async () => {
    const request = createMockRequest('GET', '/api/v1/floor-layouts', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        cursor: 'next-page-token',
        limit: '20',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });
});

describe('POST /api/v1/floor-layouts', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest('POST', '/api/v1/floor-layouts', {
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Main Floor',
        description: 'Primary gaming floor',
        created_by: '123e4567-e89b-12d3-a456-426614174001',
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 201 on successful creation', async () => {
    const request = createMockRequest('POST', '/api/v1/floor-layouts', {
      headers: {
        'Idempotency-Key': 'test-key-123',
        'Content-Type': 'application/json',
      },
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Main Floor',
        description: 'Primary gaming floor',
        created_by: '123e4567-e89b-12d3-a456-426614174001',
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
        casino_id: expect.any(String),
        name: 'Main Floor',
      }),
    });
  });
});

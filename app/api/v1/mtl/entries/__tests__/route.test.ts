/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/mtl/entries
 *
 * Tests GET (list) and POST (create) collection endpoints for MTL entries.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: ISSUE-607F9CCB (Route Handler Testing Coverage Gap)
 * Workstream: WS8 (PRD-011 Phase 3 - Auxiliary Tests)
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

describe('GET /api/v1/mtl/entries', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/entries', {
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
    const request = createMockRequest('GET', '/api/v1/mtl/entries', {
      searchParams: { casino_id: '123e4567-e89b-12d3-a456-426614174000' },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveProperty('items');
    expect(body.data).toEqual(
      expect.objectContaining({
        items: expect.any(Array),
      }),
    );
  });

  it('accepts patron_uuid filter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/entries', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        patron_uuid: '123e4567-e89b-12d3-a456-426614174001',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts pagination parameters', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/entries', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        cursor: 'next-cursor-token',
        limit: '50',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts min_amount filter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/entries', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        min_amount: '1000',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });
});

describe('POST /api/v1/mtl/entries', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest('POST', '/api/v1/mtl/entries', {
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        patron_uuid: '123e4567-e89b-12d3-a456-426614174001',
        amount: 5000,
        direction: 'in',
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 200 on successful creation', async () => {
    const request = createMockRequest('POST', '/api/v1/mtl/entries', {
      headers: {
        'Idempotency-Key': 'test-key-123',
        'Content-Type': 'application/json',
      },
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        patron_uuid: '123e4567-e89b-12d3-a456-426614174001',
        amount: 5000,
        direction: 'in',
        area: 'Table Games',
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
    });
  });

  it('accepts optional staff_id', async () => {
    const request = createMockRequest('POST', '/api/v1/mtl/entries', {
      headers: {
        'Idempotency-Key': 'test-key-124',
        'Content-Type': 'application/json',
      },
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        patron_uuid: '123e4567-e89b-12d3-a456-426614174001',
        staff_id: '123e4567-e89b-12d3-a456-426614174002',
        amount: 5000,
        direction: 'in',
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('accepts optional rating_slip_id', async () => {
    const request = createMockRequest('POST', '/api/v1/mtl/entries', {
      headers: {
        'Idempotency-Key': 'test-key-125',
        'Content-Type': 'application/json',
      },
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        patron_uuid: '123e4567-e89b-12d3-a456-426614174001',
        rating_slip_id: '123e4567-e89b-12d3-a456-426614174003',
        amount: 5000,
        direction: 'in',
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('accepts optional visit_id', async () => {
    const request = createMockRequest('POST', '/api/v1/mtl/entries', {
      headers: {
        'Idempotency-Key': 'test-key-126',
        'Content-Type': 'application/json',
      },
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        patron_uuid: '123e4567-e89b-12d3-a456-426614174001',
        visit_id: '123e4567-e89b-12d3-a456-426614174004',
        amount: 5000,
        direction: 'in',
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('accepts direction "out"', async () => {
    const request = createMockRequest('POST', '/api/v1/mtl/entries', {
      headers: {
        'Idempotency-Key': 'test-key-127',
        'Content-Type': 'application/json',
      },
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        patron_uuid: '123e4567-e89b-12d3-a456-426614174001',
        amount: 3000,
        direction: 'out',
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
  });
});

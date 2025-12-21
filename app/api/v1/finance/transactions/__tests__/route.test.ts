/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/finance/transactions (Legacy)
 *
 * Tests GET (list) and POST (create) legacy endpoints.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * NOTE: These are legacy routes. New code should use /api/v1/financial-transactions
 *
 * Issue: ISSUE-607F9CCB (Rating Slip Testing Coverage Gap)
 * Workstream: WS7 (PRD-011 Phase 3 - FinancialService)
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

import { GET, POST } from '../route';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    from: jest.fn(),
  }),
}));

describe('GET /api/v1/finance/transactions (Legacy)', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest('GET', '/api/v1/finance/transactions', {
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

  it('requires casino_id parameter', async () => {
    const request = createMockRequest('GET', '/api/v1/finance/transactions');
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it('accepts player_id filter', async () => {
    const request = createMockRequest('GET', '/api/v1/finance/transactions', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        player_id: '123e4567-e89b-12d3-a456-426614174001',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts gaming_day filter', async () => {
    const request = createMockRequest('GET', '/api/v1/finance/transactions', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        gaming_day: '2025-12-21',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts pagination parameters', async () => {
    const request = createMockRequest('GET', '/api/v1/finance/transactions', {
      searchParams: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        limit: '50',
        cursor: 'next-page-token',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });
});

describe('POST /api/v1/finance/transactions (Legacy)', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest('POST', '/api/v1/finance/transactions', {
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        player_id: '123e4567-e89b-12d3-a456-426614174001',
        amount: 1000,
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('requires casino_id in body', async () => {
    const request = createMockRequest('POST', '/api/v1/finance/transactions', {
      headers: {
        'Idempotency-Key': 'test-key-123',
        'Content-Type': 'application/json',
      },
      body: {
        player_id: '123e4567-e89b-12d3-a456-426614174001',
        amount: 1000,
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('requires player_id in body', async () => {
    const request = createMockRequest('POST', '/api/v1/finance/transactions', {
      headers: {
        'Idempotency-Key': 'test-key-123',
        'Content-Type': 'application/json',
      },
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        amount: 1000,
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('requires amount in body', async () => {
    const request = createMockRequest('POST', '/api/v1/finance/transactions', {
      headers: {
        'Idempotency-Key': 'test-key-123',
        'Content-Type': 'application/json',
      },
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        player_id: '123e4567-e89b-12d3-a456-426614174001',
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('accepts optional visit_id', async () => {
    const request = createMockRequest('POST', '/api/v1/finance/transactions', {
      headers: {
        'Idempotency-Key': 'test-key-124',
        'Content-Type': 'application/json',
      },
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        player_id: '123e4567-e89b-12d3-a456-426614174001',
        amount: 1000,
        visit_id: '123e4567-e89b-12d3-a456-426614174002',
      },
    });
    const response = await POST(request);

    // Note: This endpoint is incomplete (returns null), so expect 200
    expect(response.status).toBe(200);
  });

  it('accepts optional rating_slip_id', async () => {
    const request = createMockRequest('POST', '/api/v1/finance/transactions', {
      headers: {
        'Idempotency-Key': 'test-key-125',
        'Content-Type': 'application/json',
      },
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        player_id: '123e4567-e89b-12d3-a456-426614174001',
        amount: 1000,
        rating_slip_id: '123e4567-e89b-12d3-a456-426614174003',
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('accepts optional tender_type', async () => {
    const request = createMockRequest('POST', '/api/v1/finance/transactions', {
      headers: {
        'Idempotency-Key': 'test-key-126',
        'Content-Type': 'application/json',
      },
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        player_id: '123e4567-e89b-12d3-a456-426614174001',
        amount: 1000,
        tender_type: 'cash',
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('accepts optional created_at', async () => {
    const request = createMockRequest('POST', '/api/v1/finance/transactions', {
      headers: {
        'Idempotency-Key': 'test-key-127',
        'Content-Type': 'application/json',
      },
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        player_id: '123e4567-e89b-12d3-a456-426614174001',
        amount: 1000,
        created_at: new Date().toISOString(),
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
  });
});

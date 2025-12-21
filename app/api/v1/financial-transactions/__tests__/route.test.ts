/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/financial-transactions
 *
 * Tests GET (list) and POST (create) collection endpoints.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: ISSUE-607F9CCB (Rating Slip Testing Coverage Gap)
 * Workstream: WS7 (PRD-011 Phase 3 - FinancialService)
 */

import { GET, POST } from '../route';
import { createMockRequest } from '@/lib/testing/route-test-helpers';

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
      rlsContext: {
        casinoId: 'casino-1',
        actorId: 'actor-1',
        staffRole: 'pit_boss',
      },
    }),
  ),
}));

// Mock player financial service
jest.mock('@/services/player-financial', () => ({
  createPlayerFinancialService: jest.fn(() => ({
    list: jest.fn().mockResolvedValue({
      items: [],
      cursor: null,
    }),
    create: jest.fn().mockResolvedValue({
      id: 'txn-123',
      player_id: 'player-1',
      amount: 1000,
      direction: 'in',
      source: 'pit',
      tender_type: 'cash',
      created_at: new Date().toISOString(),
    }),
  })),
}));

describe('GET /api/v1/financial-transactions', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest('GET', '/api/v1/financial-transactions');
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
    const request = createMockRequest('GET', '/api/v1/financial-transactions', {
      searchParams: { player_id: '123e4567-e89b-12d3-a456-426614174000' },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveProperty('items');
    expect(body.data).toHaveProperty('cursor');
  });

  it('accepts visit_id filter', async () => {
    const request = createMockRequest('GET', '/api/v1/financial-transactions', {
      searchParams: { visit_id: '123e4567-e89b-12d3-a456-426614174001' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts table_id filter', async () => {
    const request = createMockRequest('GET', '/api/v1/financial-transactions', {
      searchParams: { table_id: '123e4567-e89b-12d3-a456-426614174002' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts direction filter', async () => {
    const request = createMockRequest('GET', '/api/v1/financial-transactions', {
      searchParams: { direction: 'in' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts source filter', async () => {
    const request = createMockRequest('GET', '/api/v1/financial-transactions', {
      searchParams: { source: 'pit' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts tender_type filter', async () => {
    const request = createMockRequest('GET', '/api/v1/financial-transactions', {
      searchParams: { tender_type: 'cash' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts gaming_day filter', async () => {
    const request = createMockRequest('GET', '/api/v1/financial-transactions', {
      searchParams: { gaming_day: '2025-12-21' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('accepts pagination parameters', async () => {
    const request = createMockRequest('GET', '/api/v1/financial-transactions', {
      searchParams: {
        limit: '50',
        cursor: '123e4567-e89b-12d3-a456-426614174010',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });
});

describe('POST /api/v1/financial-transactions', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest('POST', '/api/v1/financial-transactions', {
      body: {
        player_id: '123e4567-e89b-12d3-a456-426614174000',
        amount: 1000,
        direction: 'in',
        source: 'pit',
        tender_type: 'cash',
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 201 on successful creation (pit boss)', async () => {
    const request = createMockRequest('POST', '/api/v1/financial-transactions', {
      headers: {
        'Idempotency-Key': 'test-key-123',
        'Content-Type': 'application/json',
      },
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174010',
        player_id: '123e4567-e89b-12d3-a456-426614174000',
        visit_id: '123e4567-e89b-12d3-a456-426614174001',
        amount: 1000,
        direction: 'in',
        source: 'pit',
        tender_type: 'cash',
        created_by_staff_id: '123e4567-e89b-12d3-a456-426614174011',
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
        amount: expect.any(Number),
      }),
    });
  });

  it('includes required visit_id', async () => {
    const request = createMockRequest('POST', '/api/v1/financial-transactions', {
      headers: {
        'Idempotency-Key': 'test-key-124',
        'Content-Type': 'application/json',
      },
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174010',
        player_id: '123e4567-e89b-12d3-a456-426614174000',
        visit_id: '123e4567-e89b-12d3-a456-426614174001',
        amount: 1000,
        direction: 'in',
        source: 'pit',
        tender_type: 'cash',
        created_by_staff_id: '123e4567-e89b-12d3-a456-426614174011',
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it('accepts optional rating_slip_id', async () => {
    const request = createMockRequest('POST', '/api/v1/financial-transactions', {
      headers: {
        'Idempotency-Key': 'test-key-125',
        'Content-Type': 'application/json',
      },
      body: {
        casino_id: '123e4567-e89b-12d3-a456-426614174010',
        player_id: '123e4567-e89b-12d3-a456-426614174000',
        visit_id: '123e4567-e89b-12d3-a456-426614174001',
        rating_slip_id: '123e4567-e89b-12d3-a456-426614174002',
        amount: 1000,
        direction: 'in',
        source: 'pit',
        tender_type: 'cash',
        created_by_staff_id: '123e4567-e89b-12d3-a456-426614174011',
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
  });
});

/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/financial-transactions/[id]
 *
 * Tests GET (detail) resource endpoint.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: ISSUE-607F9CCB (Rating Slip Testing Coverage Gap)
 * Workstream: WS7 (PRD-011 Phase 3 - FinancialService)
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { GET } from '../route';

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

// Mock player financial service
jest.mock('@/services/player-financial', () => ({
  createPlayerFinancialService: jest.fn(() => ({
    getById: jest.fn().mockResolvedValue({
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

describe('GET /api/v1/financial-transactions/[id]', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest(
      'GET',
      '/api/v1/financial-transactions/123e4567-e89b-12d3-a456-426614174000',
    );
    const params = createMockRouteParams({
      id: '123e4567-e89b-12d3-a456-426614174000',
    });

    const response = await GET(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.objectContaining({
        id: expect.any(String),
        player_id: expect.any(String),
        amount: expect.any(Number),
        direction: expect.any(String),
        source: expect.any(String),
      }),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('validates id as UUID', async () => {
    const request = createMockRequest(
      'GET',
      '/api/v1/financial-transactions/invalid-uuid',
    );
    const params = createMockRouteParams({
      id: 'invalid-uuid',
    });

    const response = await GET(request, params);

    expect(response.status).toBe(400);
  });

  it('returns transaction data on success', async () => {
    const request = createMockRequest(
      'GET',
      '/api/v1/financial-transactions/123e4567-e89b-12d3-a456-426614174000',
    );
    const params = createMockRouteParams({
      id: '123e4567-e89b-12d3-a456-426614174000',
    });

    const response = await GET(request, params);
    const body = await response.json();

    expect(body.data).toHaveProperty('id');
    expect(body.data).toHaveProperty('player_id');
    expect(body.data).toHaveProperty('amount');
    expect(body.data).toHaveProperty('direction');
    expect(body.data).toHaveProperty('source');
  });
});

/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/visits/active
 *
 * Tests GET endpoint for retrieving active visit for a player.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS2 (VisitService Route Handler Tests)
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

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

// Mock visit service
jest.mock('@/services/visit', () => ({
  createVisitService: jest.fn(() => ({
    getActiveForPlayer: jest.fn().mockResolvedValue({
      has_active_visit: true,
      visit: {
        id: 'visit-123',
        player_id: 'player-1',
        casino_id: 'casino-1',
        visit_date: '2025-01-01',
        check_in: '2025-01-01T10:00:00Z',
        check_out: null,
        created_at: '2025-01-01T10:00:00Z',
        updated_at: '2025-01-01T10:00:00Z',
      },
    }),
  })),
}));

describe('GET /api/v1/visits/active', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest('GET', '/api/v1/visits/active', {
      searchParams: { player_id: '123e4567-e89b-12d3-a456-426614174000' },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.objectContaining({
        has_active_visit: expect.any(Boolean),
      }),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('requires player_id query parameter', async () => {
    const request = createMockRequest('GET', '/api/v1/visits/active');
    const response = await GET(request);

    // Should fail validation without player_id
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('returns active visit when one exists', async () => {
    const request = createMockRequest('GET', '/api/v1/visits/active', {
      searchParams: { player_id: '123e4567-e89b-12d3-a456-426614174000' },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveProperty('has_active_visit', true);
    expect(body.data).toHaveProperty('visit');
    expect(body.data.visit).toHaveProperty('id');
  });
});

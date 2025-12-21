/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/visits/[visitId]
 *
 * Tests GET endpoint for retrieving a single visit by ID.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS2 (VisitService Route Handler Tests)
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

// Mock visit service
jest.mock('@/services/visit', () => ({
  createVisitService: jest.fn(() => ({
    getById: jest.fn().mockResolvedValue({
      id: '123e4567-e89b-12d3-a456-426614174000',
      player_id: 'player-1',
      casino_id: 'casino-1',
      visit_date: '2025-01-01',
      check_in: '2025-01-01T10:00:00Z',
      check_out: null,
      created_at: '2025-01-01T10:00:00Z',
      updated_at: '2025-01-01T10:00:00Z',
    }),
  })),
}));

describe('GET /api/v1/visits/[visitId]', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest(
      'GET',
      '/api/v1/visits/123e4567-e89b-12d3-a456-426614174000',
    );
    const params = createMockRouteParams({
      visitId: '123e4567-e89b-12d3-a456-426614174000',
    });

    const response = await GET(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.objectContaining({
        id: '123e4567-e89b-12d3-a456-426614174000',
        player_id: expect.any(String),
      }),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('handles valid UUID in route params', async () => {
    const visitId = '123e4567-e89b-12d3-a456-426614174000';
    const request = createMockRequest('GET', `/api/v1/visits/${visitId}`);
    const params = createMockRouteParams({ visitId });

    const response = await GET(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.id).toBe(visitId);
  });
});

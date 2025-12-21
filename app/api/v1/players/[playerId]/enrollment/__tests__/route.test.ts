/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/players/[playerId]/enrollment
 *
 * Tests GET (enrollment status) endpoint.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS1 (PlayerService Route Handler Tests)
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

// Mock player service
jest.mock('@/services/player', () => ({
  createPlayerService: jest.fn(() => ({
    getEnrollment: jest.fn().mockResolvedValue({
      playerId: '123e4567-e89b-12d3-a456-426614174000',
      casinoId: 'casino-1',
      enrolledAt: new Date().toISOString(),
    }),
  })),
}));

const VALID_PLAYER_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('GET /api/v1/players/[playerId]/enrollment', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope when enrolled', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/players/${VALID_PLAYER_ID}/enrollment`,
    );
    const params = createMockRouteParams({ playerId: VALID_PLAYER_ID });
    const response = await GET(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.objectContaining({
        playerId: VALID_PLAYER_ID,
        casinoId: expect.any(String),
        enrolledAt: expect.any(String),
      }),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('accepts valid UUID in route params', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/players/${VALID_PLAYER_ID}/enrollment`,
    );
    const params = createMockRouteParams({ playerId: VALID_PLAYER_ID });
    const response = await GET(request, params);

    expect(response.status).toBe(200);
  });

  it('validates route params', async () => {
    const request = createMockRequest(
      'GET',
      '/api/v1/players/invalid-id/enrollment',
    );
    const params = createMockRouteParams({ playerId: 'invalid-id' });
    const response = await GET(request, params);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

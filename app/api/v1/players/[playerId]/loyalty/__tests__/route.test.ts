/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/players/[playerId]/loyalty
 *
 * Tests GET (loyalty balance) endpoint.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Note: This route uses LoyaltyService, not PlayerService, but is mounted
 * under /players/[playerId]/loyalty for REST semantics.
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

// Mock loyalty service (not player service)
jest.mock('@/services/loyalty', () => ({
  createLoyaltyService: jest.fn(() => ({
    getBalance: jest.fn().mockResolvedValue({
      playerId: '123e4567-e89b-12d3-a456-426614174000',
      casinoId: 'casino-1',
      points: 1500,
      tier: 'gold',
      lifetimePoints: 5000,
    }),
  })),
}));

const VALID_PLAYER_ID = '123e4567-e89b-12d3-a456-426614174000';
const VALID_CASINO_ID = '123e4567-e89b-12d3-a456-426614174001';

describe('GET /api/v1/players/[playerId]/loyalty', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/players/${VALID_PLAYER_ID}/loyalty`,
      {
        searchParams: { casinoId: VALID_CASINO_ID },
      },
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
        points: expect.any(Number),
      }),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('requires casinoId query parameter', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/players/${VALID_PLAYER_ID}/loyalty`,
    );
    const params = createMockRouteParams({ playerId: VALID_PLAYER_ID });
    const response = await GET(request, params);

    // Should fail validation without casinoId
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('accepts valid UUID in route params', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/players/${VALID_PLAYER_ID}/loyalty`,
      {
        searchParams: { casinoId: VALID_CASINO_ID },
      },
    );
    const params = createMockRouteParams({ playerId: VALID_PLAYER_ID });
    const response = await GET(request, params);

    expect(response.status).toBe(200);
  });

  it('validates casinoId in query params', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/players/${VALID_PLAYER_ID}/loyalty`,
      {
        searchParams: { casinoId: 'invalid-uuid' },
      },
    );
    const params = createMockRouteParams({ playerId: VALID_PLAYER_ID });
    const response = await GET(request, params);

    // Note: playerId from route params is NOT validated by this route
    // Only casinoId query param is validated by balanceQuerySchema
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

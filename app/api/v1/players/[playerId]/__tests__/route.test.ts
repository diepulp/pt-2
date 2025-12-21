/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/players/[playerId]
 *
 * Tests GET (detail) and PATCH (update) resource endpoints.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS1 (PlayerService Route Handler Tests)
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { GET, PATCH } from '../route';

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
    getById: jest.fn().mockResolvedValue({
      id: '123e4567-e89b-12d3-a456-426614174000',
      firstName: 'John',
      lastName: 'Doe',
      status: 'active',
    }),
    update: jest.fn().mockResolvedValue({
      id: '123e4567-e89b-12d3-a456-426614174000',
      firstName: 'John',
      lastName: 'Smith',
      status: 'active',
    }),
  })),
}));

const VALID_PLAYER_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('GET /api/v1/players/[playerId]', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/players/${VALID_PLAYER_ID}`,
    );
    const params = createMockRouteParams({ playerId: VALID_PLAYER_ID });
    const response = await GET(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.objectContaining({
        id: VALID_PLAYER_ID,
        firstName: expect.any(String),
        lastName: expect.any(String),
      }),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('accepts valid UUID in route params', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/players/${VALID_PLAYER_ID}`,
    );
    const params = createMockRouteParams({ playerId: VALID_PLAYER_ID });
    const response = await GET(request, params);

    expect(response.status).toBe(200);
  });
});

describe('PATCH /api/v1/players/[playerId]', () => {
  it('exports PATCH handler', () => {
    expect(typeof PATCH).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/players/${VALID_PLAYER_ID}`,
      {
        body: {
          first_name: 'John',
          last_name: 'Smith',
        },
      },
    );
    const params = createMockRouteParams({ playerId: VALID_PLAYER_ID });
    const response = await PATCH(request, params);

    expect(response.status).toBe(400);
  });

  it('returns 200 on successful update', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/players/${VALID_PLAYER_ID}`,
      {
        headers: {
          'Idempotency-Key': 'test-key-123',
          'Content-Type': 'application/json',
        },
        body: {
          first_name: 'John',
          last_name: 'Smith',
        },
      },
    );
    const params = createMockRouteParams({ playerId: VALID_PLAYER_ID });
    const response = await PATCH(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.objectContaining({
        id: VALID_PLAYER_ID,
        lastName: 'Smith',
      }),
    });
  });

  it('accepts partial updates', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/players/${VALID_PLAYER_ID}`,
      {
        headers: {
          'Idempotency-Key': 'test-key-456',
          'Content-Type': 'application/json',
        },
        body: {
          last_name: 'UpdatedName',
        },
      },
    );
    const params = createMockRouteParams({ playerId: VALID_PLAYER_ID });
    const response = await PATCH(request, params);

    expect(response.status).toBe(200);
  });

  it('validates route params', async () => {
    const request = createMockRequest('PATCH', '/api/v1/players/invalid-id', {
      headers: {
        'Idempotency-Key': 'test-key-789',
        'Content-Type': 'application/json',
      },
      body: {
        last_name: 'Smith',
      },
    });
    const params = createMockRouteParams({ playerId: 'invalid-id' });
    const response = await PATCH(request, params);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

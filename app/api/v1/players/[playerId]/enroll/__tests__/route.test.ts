/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/players/[playerId]/enroll
 *
 * Tests POST (enroll) action endpoint.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS1 (PlayerService Route Handler Tests)
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { POST } from '../route';

// Mock Supabase client with staff query support
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        limit: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: { casino_id: 'casino-1' },
            error: null,
          }),
        })),
      })),
    })),
  }),
}));

// Mock middleware to bypass auth/RLS in unit tests
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            limit: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: { casino_id: 'casino-1' },
                error: null,
              }),
            })),
          })),
        })),
      },
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
    getEnrollment: jest.fn().mockResolvedValue(null),
    enroll: jest.fn().mockResolvedValue({
      playerId: '123e4567-e89b-12d3-a456-426614174000',
      casinoId: 'casino-1',
      enrolledAt: new Date().toISOString(),
    }),
  })),
}));

const VALID_PLAYER_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('POST /api/v1/players/[playerId]/enroll', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest(
      'POST',
      `/api/v1/players/${VALID_PLAYER_ID}/enroll`,
      {
        body: {},
      },
    );
    const params = createMockRouteParams({ playerId: VALID_PLAYER_ID });
    const response = await POST(request, params);

    expect(response.status).toBe(400);
  });

  it('returns 201 on new enrollment', async () => {
    const request = createMockRequest(
      'POST',
      `/api/v1/players/${VALID_PLAYER_ID}/enroll`,
      {
        headers: {
          'Idempotency-Key': 'test-key-123',
          'Content-Type': 'application/json',
        },
        body: {},
      },
    );
    const params = createMockRouteParams({ playerId: VALID_PLAYER_ID });
    const response = await POST(request, params);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.objectContaining({
        playerId: VALID_PLAYER_ID,
        casinoId: expect.any(String),
      }),
    });
  });

  it('validates route params', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/players/invalid-id/enroll',
      {
        headers: {
          'Idempotency-Key': 'test-key-456',
          'Content-Type': 'application/json',
        },
        body: {},
      },
    );
    const params = createMockRouteParams({ playerId: 'invalid-id' });
    const response = await POST(request, params);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('accepts valid UUID in route params', async () => {
    const request = createMockRequest(
      'POST',
      `/api/v1/players/${VALID_PLAYER_ID}/enroll`,
      {
        headers: {
          'Idempotency-Key': 'test-key-789',
          'Content-Type': 'application/json',
        },
        body: {},
      },
    );
    const params = createMockRouteParams({ playerId: VALID_PLAYER_ID });
    const response = await POST(request, params);

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
  });
});

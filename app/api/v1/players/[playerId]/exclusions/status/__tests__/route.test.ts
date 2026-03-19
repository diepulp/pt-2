/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/players/[playerId]/exclusions/status
 *
 * Tests GET handler for collapsed exclusion status.
 * Validates all 4 statuses (blocked, alert, watchlist, clear).
 *
 * @see PRD-052 GAP-6
 * @see EXEC-052 WS6
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

// Track the mock so tests can change return value
const mockGetExclusionStatus = jest.fn();

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

// Mock exclusion service
jest.mock('@/services/player/exclusion', () => ({
  createExclusionService: jest.fn(() => ({
    getExclusionStatus: mockGetExclusionStatus,
  })),
}));

const VALID_PLAYER_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('GET /api/v1/players/[playerId]/exclusions/status', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it.each(['blocked', 'alert', 'watchlist', 'clear'] as const)(
    'returns ExclusionStatusDTO with status=%s',
    async (status) => {
      mockGetExclusionStatus.mockResolvedValue({
        player_id: VALID_PLAYER_ID,
        status,
      });

      const request = createMockRequest(
        'GET',
        `/api/v1/players/${VALID_PLAYER_ID}/exclusions/status`,
      );
      const params = createMockRouteParams({ playerId: VALID_PLAYER_ID });
      const response = await GET(request, params);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        ok: true,
        code: 'OK',
        data: {
          player_id: VALID_PLAYER_ID,
          status,
        },
        requestId: expect.any(String),
        timestamp: expect.any(String),
      });
    },
  );

  it('validates route params (rejects invalid UUID)', async () => {
    const request = createMockRequest(
      'GET',
      '/api/v1/players/invalid-id/exclusions/status',
    );
    const params = createMockRouteParams({ playerId: 'invalid-id' });
    const response = await GET(request, params);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

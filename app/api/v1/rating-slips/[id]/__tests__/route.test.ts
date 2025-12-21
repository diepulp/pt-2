/**
 * @jest-environment node
 *
 * Route Handler Tests: GET /api/v1/rating-slips/[id]
 *
 * Tests rating slip detail endpoint with pause history.
 * Created for QA-ROUTE-TESTING (ISSUE-607F9CCB).
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { GET } from '../route';

// Mock dependencies
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve({})),
}));

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
    }),
  ),
}));

const mockGetById = jest.fn();
jest.mock('@/services/rating-slip', () => ({
  createRatingSlipService: jest.fn(() => ({
    getById: mockGetById,
  })),
}));

describe('GET /api/v1/rating-slips/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with rating slip data', async () => {
    const slipId = '123e4567-e89b-12d3-a456-426614174000';
    mockGetById.mockResolvedValue({
      id: slipId,
      status: 'open',
      pauses: [],
    });

    const request = createMockRequest('GET', `/api/v1/rating-slips/${slipId}`);
    const routeParams = createMockRouteParams({ id: slipId });

    const response = await GET(request, routeParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.objectContaining({ id: slipId }),
    });
  });
});

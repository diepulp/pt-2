/**
 * @jest-environment node
 *
 * Rating Slip Duration Route Tests
 *
 * Tests for GET /api/v1/rating-slips/[id]/duration
 * Part of QA-ROUTE-TESTING execution (ISSUE-607F9CCB)
 */

import { GET } from '../route';
import { createMockRequest, createMockRouteParams } from '@/lib/testing/route-test-helpers';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
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

jest.mock('@/services/rating-slip', () => ({
  createRatingSlipService: jest.fn(() => ({
    getDuration: jest.fn().mockResolvedValue(3600),
  })),
}));

describe('GET /api/v1/rating-slips/[id]/duration', () => {
  const slipId = '123e4567-e89b-12d3-a456-426614174000';

  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with duration on success', async () => {
    const request = createMockRequest('GET', `/api/v1/rating-slips/${slipId}/duration`);
    const routeParams = createMockRouteParams({ id: slipId });
    const response = await GET(request, routeParams);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveProperty('duration_seconds');
  });
});

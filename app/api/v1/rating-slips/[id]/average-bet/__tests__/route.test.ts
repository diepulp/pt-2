/**
 * @jest-environment node
 *
 * Rating Slip Average Bet Route Tests
 *
 * Tests for PATCH /api/v1/rating-slips/[id]/average-bet
 * Part of QA-ROUTE-TESTING execution (ISSUE-607F9CCB)
 */

import { PATCH } from '../route';
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
    updateAverageBet: jest.fn().mockResolvedValue({
      id: 'slip-123',
      average_bet: 50,
    }),
  })),
}));

describe('PATCH /api/v1/rating-slips/[id]/average-bet', () => {
  const slipId = '123e4567-e89b-12d3-a456-426614174000';

  it('exports PATCH handler', () => {
    expect(typeof PATCH).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest('PATCH', `/api/v1/rating-slips/${slipId}/average-bet`, {
      body: { average_bet: 50 },
    });
    const routeParams = createMockRouteParams({ id: slipId });
    const response = await PATCH(request, routeParams);
    expect(response.status).toBe(400);
  });

  it('returns 200 on success with valid body', async () => {
    const request = createMockRequest('PATCH', `/api/v1/rating-slips/${slipId}/average-bet`, {
      headers: { 'Idempotency-Key': 'test-key' },
      body: { average_bet: 50 },
    });
    const routeParams = createMockRouteParams({ id: slipId });
    const response = await PATCH(request, routeParams);
    expect(response.status).toBe(200);
  });
});
